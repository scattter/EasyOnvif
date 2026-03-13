import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { RecordingModel, SettingModel, EventModel, CameraModel } from '../models';
import { v4 as uuidv4 } from 'uuid';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';

class RecordingService {
  private prebufferProcess: any = null;
  private currentEventId: string | null = null;
  private prebufferStarted = false;
  private lastMotionAt = 0;
  
  // Segment recording management
  private prebufferStartTime: number = 0;
  private readonly SEGMENT_DURATION = 4; // 4s per segment. 10 files = 40s retention.
  private cleanupInterval: NodeJS.Timeout | null = null;
  private isRecordingEvent = false;

  private getStorageRoot(): string {
    return process.env.STORAGE_PATH || path.join(process.cwd(), '../storage');
  }

  private getFfmpegPath(): string {
    return process.env.FFMPEG_PATH || ffmpegInstaller.path || 'ffmpeg';
  }

  resolveStoragePath(relativePath: string): string {
    return path.join(this.getStorageRoot(), relativePath);
  }

  private getPrebufferSeconds(): number {
    const fromSetting = SettingModel.get('storage.prebuffer_seconds');
    const fromEnv = process.env.PREBUFFER_SECONDS;
    const raw = fromSetting || fromEnv || '10';
    return Math.max(1, parseInt(raw, 10));
  }

  private getPostbufferSeconds(): number {
    const fromSetting = SettingModel.get('storage.postbuffer_seconds');
    const fromEnv = process.env.POSTBUFFER_SECONDS;
    const raw = fromSetting || fromEnv || '20'; // Default reduced to 20s to fit within small prebuffer
    return Math.max(1, parseInt(raw, 10));
  }

  private getRtspUrl(): string | null {
    const config = CameraModel.getConfig();
    if (config?.rtspUrl) {
      try {
        const url = new URL(config.rtspUrl);
        if (!url.username && config.username) {
          url.username = encodeURIComponent(config.username);
          if (config.password) {
            url.password = encodeURIComponent(config.password);
          }
          return url.toString();
        }
      } catch {
      }
      return config.rtspUrl;
    }
    if (process.env.CAMERA_RTSP_URL) {
      return process.env.CAMERA_RTSP_URL;
    }
    if (config?.ip) {
      const user = config.username ? encodeURIComponent(config.username) : '';
      const pass = config.password ? encodeURIComponent(config.password) : '';
      const auth = user ? `${user}${pass ? `:${pass}` : ''}@` : '';
      const port = config.port || 554;
      return `rtsp://${auth}${config.ip}:${port}/stream1`;
    }
    return null;
  }

  // 启动预录循环缓冲区 (Continuous Segmenting)
  async startPrebuffer(): Promise<void> {
    if (this.prebufferStarted) {
      return;
    }
    const cameraConfig = this.getRtspUrl();
    
    if (!cameraConfig) {
      console.error('RecordingService: RTSP URL 未配置');
      return;
    }

    const prebufferPath = path.join(this.getStorageRoot(), 'prebuffer');
    console.log(`RecordingService: Starting prebuffer (continuous segmenting) at ${prebufferPath}`);
    
    if (!fs.existsSync(prebufferPath)) {
      fs.mkdirSync(prebufferPath, { recursive: true });
    }

    // Start cleanup loop
    if (this.cleanupInterval) clearInterval(this.cleanupInterval);
    this.cleanupInterval = setInterval(() => this.cleanupSegments(), 10000);

    const ffmpegPath = this.getFfmpegPath();
    console.log(`RecordingService: Using ffmpeg at ${ffmpegPath}`);

    this.prebufferStartTime = Date.now();

    this.prebufferProcess = spawn(ffmpegPath, [
      '-rtsp_transport', 'tcp',
      '-analyzeduration', '10000000',
      '-probesize', '10000000',
      '-i', cameraConfig,
      '-f', 'segment',
      '-segment_time', String(this.SEGMENT_DURATION),
      '-segment_format', 'mp4',
      '-segment_format_options', 'movflags=+faststart',
      '-reset_timestamps', '1',
      '-c', 'copy',
      '-an', // Disable audio to avoid codec issues in MP4
      '-y',
      path.join(prebufferPath, 'segment_%05d.mp4'), // Sequential 00000, 00001...
    ]);

    this.prebufferProcess.stderr.on('data', (data: Buffer) => {
        const msg = data.toString();
        if (msg.includes('Error') || msg.includes('Fail') || msg.includes('Opening')) {
            console.log(`[Prebuffer FFmpeg] ${msg}`);
        }
    });

    this.prebufferProcess.on('error', (err: any) => {
      console.error('RecordingService: Prebuffer process error:', err);
      this.prebufferStarted = false;
      this.prebufferProcess = null;
    });

    this.prebufferProcess.on('close', (code: number) => {
      console.log(`RecordingService: Prebuffer process exited with code ${code}`);
      this.prebufferStarted = false;
      this.prebufferProcess = null;
    });

    this.prebufferStarted = true;
    console.log('预录缓冲区已启动');
  }

  private async cleanupSegments() {
    const prebufferPath = path.join(this.getStorageRoot(), 'prebuffer');
    if (!fs.existsSync(prebufferPath)) return;

    // Strict limit: Keep max 10 files (approx 40s history with 4s segments)
    const MAX_FILES = 10;
    
    try {
        const files = fs.readdirSync(prebufferPath)
            .filter(file => file.startsWith('segment_') && file.endsWith('.mp4'))
            .map(file => {
                const filePath = path.join(prebufferPath, file);
                try {
                    return {
                        path: filePath,
                        mtime: fs.statSync(filePath).mtimeMs
                    };
                } catch (e) {
                    return null;
                }
            })
            .filter((f): f is { path: string; mtime: number } => f !== null)
            .sort((a, b) => a.mtime - b.mtime); // Oldest first

        // Delete excess files
        if (files.length > MAX_FILES) {
            const toDelete = files.slice(0, files.length - MAX_FILES);
            for (const file of toDelete) {
                try {
                    fs.unlinkSync(file.path);
                } catch (err) {
                    // ignore
                }
            }
        }
    } catch (err) {
        console.error('RecordingService: Error during cleanup:', err);
    }
  }

  async handleMotionEvent(metadata?: any): Promise<string | null> {
    const now = Date.now();
    console.log('RecordingService: handleMotionEvent called');
    
    if (this.isRecordingEvent) {
      console.log('RecordingService: Already recording event, ignoring motion');
      return this.currentEventId;
    }
    if (now - this.lastMotionAt < 3000) {
      console.log('RecordingService: Motion cooldown, ignoring');
      return this.currentEventId;
    }
    this.lastMotionAt = now;
    console.log('RecordingService: Starting motion recording (virtual)...');
    return this.startRecording('motion', metadata);
  }

  private async runFfmpeg(args: string[]): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const proc = spawn(this.getFfmpegPath(), args);
      proc.on('error', reject);
      proc.on('close', (code: number) => {
        if (code === 0) resolve();
        else reject(new Error(`ffmpeg exited with code ${code}`));
      });
    });
  }

  // 开始事件录制 (Virtual - just marks time and schedules stitching)
  async startRecording(eventType: string, metadata?: any): Promise<string> {
    const cameraConfig = this.getRtspUrl();
    if (!cameraConfig) throw new Error('RTSP URL 未配置');

    const eventId = `evt_${Date.now()}_${uuidv4().slice(0, 8)}`;
    this.currentEventId = eventId;
    this.isRecordingEvent = true;

    const now = new Date();
    const eventModel = await EventModel.create({
      cameraId: CameraModel.getConfig()?.id,
      eventType,
      message: metadata?.message || eventType,
      timestamp: now,
      metadata,
    });

    const prebufferSeconds = this.getPrebufferSeconds();
    const postbufferSeconds = this.getPostbufferSeconds();

    console.log(`RecordingService: Scheduled recording finalize for event ${eventId} in ${postbufferSeconds}s`);

    // Schedule finalization after postbuffer time + buffer
    setTimeout(async () => {
        try {
            await this.finalizeSegmentedRecording(eventId, eventModel, now, prebufferSeconds, postbufferSeconds);
        } catch (error) {
            console.error('Finalize recording failed:', error);
        } finally {
            // Only reset if this is still the current event (should be)
            if (this.currentEventId === eventId) {
                this.isRecordingEvent = false;
                this.currentEventId = null;
            }
        }
    }, (postbufferSeconds + this.SEGMENT_DURATION + 2) * 1000);

    return eventId;
  }

  private async finalizeSegmentedRecording(
    eventId: string,
    eventModel: any, 
    eventTime: Date, 
    preSeconds: number, 
    postSeconds: number
  ): Promise<void> {
    console.log(`RecordingService: Finalizing event ${eventId}`);
    
    const eventTimeMs = eventTime.getTime();
    const startRange = eventTimeMs - (preSeconds * 1000);
    const endRange = eventTimeMs + (postSeconds * 1000);

    const prebufferPath = path.join(this.getStorageRoot(), 'prebuffer');
    if (!fs.existsSync(prebufferPath)) {
        console.error('RecordingService: Prebuffer directory not found');
        return;
    }

    const files = fs.readdirSync(prebufferPath)
        .filter(f => f.startsWith('segment_') && f.endsWith('.mp4'));
    
    const selectedFiles: { path: string; mtime: number }[] = [];
    
    for (const file of files) {
        const filePath = path.join(prebufferPath, file);
        try {
            const stat = fs.statSync(filePath);
            // Segment covers [mtime - duration, mtime]
            const segmentEnd = stat.mtimeMs;
            const segmentStart = segmentEnd - (this.SEGMENT_DURATION * 1000 * 1.5); // 1.5x buffer for drift

            // If segment overlaps with our desired range
            // (segmentEnd > startRange) AND (segmentStart < endRange)
            if (segmentEnd > startRange && segmentStart < endRange) {
                selectedFiles.push({ path: filePath, mtime: stat.mtimeMs });
            }
        } catch(e) {}
    }

    selectedFiles.sort((a, b) => a.mtime - b.mtime);

    if (selectedFiles.length === 0) {
        console.warn('RecordingService: No segments found for event');
        return;
    }

    console.log(`RecordingService: Found ${selectedFiles.length} segments for event`);

    const dateStr = eventTime.toISOString().split('T')[0];
    const eventDir = path.join(this.getStorageRoot(), 'events', dateStr);
    if (!fs.existsSync(eventDir)) {
      fs.mkdirSync(eventDir, { recursive: true });
    }

    const listFile = path.join(eventDir, `${eventId}_list.txt`);
    const finalFile = path.join(eventDir, `${eventId}.mp4`);

    const listContent = selectedFiles.map(f => `file '${f.path}'`).join('\n');
    fs.writeFileSync(listFile, listContent);

    // Concat segments
    try {
        await this.runFfmpeg(['-f', 'concat', '-safe', '0', '-i', listFile, '-c', 'copy', '-an', '-y', finalFile]);
        console.log(`RecordingService: Merged video saved to ${finalFile}`);
    } catch (err) {
        console.error('RecordingService: FFmpeg merge failed', err);
        fs.unlinkSync(listFile);
        return;
    }
    
    fs.unlinkSync(listFile);

    // Update Database
    const stats = fs.statSync(finalFile);
    const duration = selectedFiles.length * this.SEGMENT_DURATION;
    const startTime = new Date(startRange);
    const endTime = new Date(endRange);

    const recording = RecordingModel.create({
      cameraId: CameraModel.getConfig()?.id,
      eventId: eventId,
      eventType: eventModel.eventType,
      startTime,
      endTime,
      duration,
      fileSize: stats.size,
      filePath: path.join('events', dateStr, `${eventId}.mp4`),
    });

    EventModel.updateRecordingId(eventModel.id, recording.id);
  }

  // 清理存储空间
  async cleanupStorage(): Promise<{ deletedCount: number; freedSpace: number }> {
    const quotaGB = parseInt(SettingModel.get('storage.quota_gb') || '50', 10);
    const usedBytes = RecordingModel.getStorageUsage();
    const quotaBytes = quotaGB * 1024 * 1024 * 1024;

    if (usedBytes < quotaBytes * 0.9) {
      return { deletedCount: 0, freedSpace: 0 };
    }

    const { items } = RecordingModel.findAll(1000, 0);
    const sortedItems = items.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

    let deletedCount = 0;
    let freedSpace = 0;

    for (const item of sortedItems) {
      if (usedBytes - freedSpace < quotaBytes * 0.8) {
        break;
      }
      RecordingModel.softDelete(item.id);
      deletedCount++;
      freedSpace += item.fileSize || 0;

      const filePath = this.resolveStoragePath(item.filePath);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }
    return { deletedCount, freedSpace };
  }

  stopAll(): void {
    if (this.prebufferProcess) {
      this.prebufferProcess.kill();
    }
    if (this.cleanupInterval) {
        clearInterval(this.cleanupInterval);
    }
  }
}

export const recordingService = new RecordingService();
