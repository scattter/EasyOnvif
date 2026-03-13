import WebSocket from 'ws';
import { spawn, ChildProcess } from 'child_process';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import { IncomingMessage } from 'http';
import { CameraModel } from '../models';
import EventEmitter from 'events';

const FFMPEG_PATH = ffmpegInstaller.path;

interface StreamSession {
  process: ChildProcess;
  viewers: Set<WebSocket>;
  motionEnabled: boolean;
}

export class StreamService extends EventEmitter {
  private static instance: StreamService;
  private wss: WebSocket.Server | null = null;
  private sessions: Map<string, StreamSession> = new Map();
  private port: number = 9999;

  private constructor() {
    super();
  }

  public static getInstance(): StreamService {
    if (!StreamService.instance) {
      StreamService.instance = new StreamService();
    }
    return StreamService.instance;
  }

  public init(port: number) {
    this.port = port;
    this.wss = new WebSocket.Server({ port: this.port });

    this.wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
      const url = req.url || '';
      const parts = url.split('/');
      const streamId = parts.length > 2 ? parts[parts.length - 1] : 'default';
      
      console.log(`New client connected for stream: ${streamId}`);
      
      this.addClient(streamId, ws);

      ws.on('close', () => {
        console.log(`Client disconnected from stream: ${streamId}`);
        this.removeClient(streamId, ws);
      });
    });

    console.log(`Stream WebSocket server started on port ${this.port}`);
  }

  public async updateMotionConfig(streamId: string = 'default', enabled: boolean) {
    console.log(`Updating motion config for ${streamId}: ${enabled}`);
    const session = this.sessions.get(streamId);
    
    // If state unchanged, do nothing
    if (session && session.motionEnabled === enabled) return;

    // If session exists, we need to restart it to apply new config
    if (session) {
      this.stopSession(streamId);
    }

    // Start new session if needed (either has viewers or motion enabled)
    // We can't check viewers here easily if session is gone, but we can pass existing viewers
    // Actually, simpler: if enabled, start immediately.
    // If disabled, start only if viewers exist.
    if (enabled) {
      await this.startSession(streamId, session?.viewers || new Set(), enabled);
    } else if (session && session.viewers.size > 0) {
      await this.startSession(streamId, session.viewers, enabled);
    }
  }

  private async addClient(streamId: string, ws: WebSocket) {
    let session = this.sessions.get(streamId);

    if (!session) {
       // Check if motion detection is enabled in config
       const config = CameraModel.getConfig();
       const motionEnabled = config?.motionConfig?.enabled || false;
       await this.startSession(streamId, new Set([ws]), motionEnabled);
    } else {
      session.viewers.add(ws);
    }
  }

  private removeClient(streamId: string, ws: WebSocket) {
    const session = this.sessions.get(streamId);
    if (!session) return;

    session.viewers.delete(ws);

    if (session.viewers.size === 0 && !session.motionEnabled) {
      console.log(`No viewers left for ${streamId} and motion detection disabled, stopping session.`);
      this.stopSession(streamId);
    }
  }

  private stopSession(streamId: string) {
    const session = this.sessions.get(streamId);
    if (session) {
      session.process.kill('SIGKILL');
      this.sessions.delete(streamId);
    }
  }

  private async startSession(streamId: string, viewers: Set<WebSocket>, motionEnabled: boolean) {
    console.log(`Starting ffmpeg session for ${streamId} (Motion: ${motionEnabled})`);
    
    try {
      const { url: rtspUrl } = this.getRtspUrl();
      
      const args = [
        '-rtsp_transport', 'tcp',
        // '-re', // Removed to reduce latency/buffering issues for live RTSP
        '-i', rtspUrl,
        // Output 1: MPEG-TS for streaming (stdout)
        '-f', 'mpegts',
        '-codec:v', 'mpeg1video',
        '-b:v', '1000k',
        '-bf', '0',
        '-r', '30',
        '-map', '0:v',
        '-an',
        'pipe:1'
      ];

      const stdio: any[] = ['ignore', 'pipe', 'pipe'];

      // Output 2: Raw Grayscale for motion detection (pipe:3)
      // This is much lighter on CPU than MJPEG encoding/decoding
      if (motionEnabled) {
        args.push(
          '-f', 'rawvideo',
          '-pix_fmt', 'gray',
          '-vf', 'fps=2,scale=640:360',
          '-map', '0:v',
          '-an',
          'pipe:3'
        );
        stdio.push('pipe');
      }

      const ffmpegProcess = spawn(FFMPEG_PATH, args, { stdio });

      // Log FFmpeg stderr for debugging
      if (ffmpegProcess.stderr) {
        ffmpegProcess.stderr.on('data', (data: Buffer) => {
          // Only log errors or warnings to avoid spam
          const msg = data.toString();
          if (msg.toLowerCase().includes('error') || msg.toLowerCase().includes('fail')) {
             console.error(`[FFmpeg ${streamId}]`, msg);
          }
        });
      }

      const session: StreamSession = {
        process: ffmpegProcess,
        viewers: viewers,
        motionEnabled
      };
      
      this.sessions.set(streamId, session);

      ffmpegProcess.stdout?.on('data', (chunk: Buffer) => {
        // Broadcast to viewers
        if (session.viewers.size > 0) {
          session.viewers.forEach(ws => {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(chunk);
            }
          });
        }
      });

      // Handle motion stream
      if (motionEnabled && ffmpegProcess.stdio[3]) {
        ffmpegProcess.stdio[3].on('data', (chunk: Buffer) => {
          this.emit('motionFrame', chunk);
        });
      }

      ffmpegProcess.on('error', (err) => {
        console.error(`FFmpeg process error for ${streamId}:`, err);
        this.stopSession(streamId);
      });

      ffmpegProcess.on('exit', (code, signal) => {
        console.log(`FFmpeg process exited for ${streamId} with code ${code} signal ${signal}`);
        // Only restart if supposed to be running
        if (this.sessions.has(streamId)) {
           this.sessions.delete(streamId);
           // Simple restart logic: if it crashed but we still have viewers or motion enabled
           setTimeout(() => {
             const currentViewers = session.viewers; // These might be closed by now?
             // Filter closed viewers
             const activeViewers = new Set<WebSocket>();
             currentViewers.forEach(v => {
               if (v.readyState === WebSocket.OPEN) activeViewers.add(v);
             });
             
             if (activeViewers.size > 0 || motionEnabled) {
               console.log(`Restarting session for ${streamId}...`);
               this.startSession(streamId, activeViewers, motionEnabled);
             }
           }, 2000);
        }
      });

    } catch (err) {
      console.error('Failed to start ffmpeg session:', err);
    }
  }

  public getStatus(streamId: string): {
    isStreaming: boolean;
    viewers: number;
    resolution: string | null;
    fps: number | null;
    bitrate: string | null;
  } {
    const session = this.sessions.get(streamId);
    if (!session) {
      return {
        isStreaming: false,
        viewers: 0,
        resolution: null,
        fps: null,
        bitrate: null,
      };
    }
    return {
      isStreaming: true,
      viewers: session.viewers.size,
      resolution: null,
      fps: null,
      bitrate: null,
    };
  }

  private getRtspUrl(): { url: string } {
    const config = CameraModel.getConfig();
    if (!config) {
      throw new Error('Camera configuration not found');
    }

    let rtspUrl = config.rtspUrl;
    if (rtspUrl) {
      try {
        const url = new URL(rtspUrl);
        if (!url.username && config.username) {
          url.username = encodeURIComponent(config.username);
          if (config.password) {
            url.password = encodeURIComponent(config.password);
          }
          rtspUrl = url.toString();
        }
      } catch {
      }
    }
    if (!rtspUrl) {
      if (config.ip) {
        const user = config.username ? encodeURIComponent(config.username) : '';
        const pass = config.password ? encodeURIComponent(config.password) : '';
        const auth = user ? `${user}${pass ? `:${pass}` : ''}@` : '';
        rtspUrl = `rtsp://${auth}${config.ip}:${config.port || 554}/stream1`;
      } else {
        throw new Error('RTSP URL not configured');
      }
    }
    return { url: rtspUrl };
  }
}
