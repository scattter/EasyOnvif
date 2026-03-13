import EventEmitter from 'events';
import { CameraModel } from '../models';
import { MotionConfig } from '../types/database';
import { StreamService } from './stream';

export class MotionDetector extends EventEmitter {
  private static instance: MotionDetector;
  private previousFrameData: Uint8Array | null = null;
  private isRunning: boolean = false;
  private width = 640;
  private height = 360;
  // Pre-allocate buffer for 2 frames (230400 bytes per frame) to avoid allocation churn
  private readonly FRAME_SIZE = 640 * 360;
  private buffer: Buffer = Buffer.alloc(640 * 360 * 2); 
  private bufferLen: number = 0;
  
  // Debounce logic
  private consecutiveMotionFrames = 0;
  private readonly TRIGGER_FRAMES = 2; // Need 2 consecutive frames with motion to trigger
  private lastTriggerTime = 0;
  private readonly COOLDOWN_MS = 5000; // 5 seconds cooldown

  private constructor() {
    super();
    this.handleMotionFrame = this.handleMotionFrame.bind(this);
  }

  public static getInstance(): MotionDetector {
    if (!MotionDetector.instance) {
      MotionDetector.instance = new MotionDetector();
    }
    return MotionDetector.instance;
  }

  public updateConfig() {
    // Restart if running to apply new config
    if (this.isRunning) {
      this.stop();
      this.start();
    }
  }

  public async start() {
    if (this.isRunning) return;
    
    const cameraConfig = CameraModel.getConfig();
    if (!cameraConfig || !cameraConfig.rtspUrl) {
      console.log('MotionDetector: No camera config or RTSP URL found.');
      return;
    }

    const motionConfig = cameraConfig.motionConfig;
    if (!motionConfig || !motionConfig.enabled) {
      console.log('MotionDetector: Motion detection disabled.');
      return;
    }

    this.isRunning = true;
    this.buffer = Buffer.alloc(this.FRAME_SIZE * 2);
    this.bufferLen = 0;
    console.log('MotionDetector: Starting via StreamService...');
    
    // Subscribe to StreamService motion frames
    const streamService = StreamService.getInstance();
    streamService.on('motionFrame', this.handleMotionFrame);
    
    // Ensure StreamService is running with motion enabled
    // We use 'cam1' as streamId to match the frontend WebSocket URL
    await streamService.updateMotionConfig('cam1', true);
  }

  public stop() {
    this.isRunning = false;
    this.previousFrameData = null;
    this.buffer = Buffer.alloc(0);
    this.bufferLen = 0;
    
    const streamService = StreamService.getInstance();
    streamService.removeListener('motionFrame', this.handleMotionFrame);
    
    // Disable motion in StreamService (will stop ffmpeg if no viewers)
    streamService.updateMotionConfig('cam1', false).catch(err => {
        console.error('MotionDetector: Failed to update StreamService config on stop', err);
    });
    
    console.log('MotionDetector: Stopped.');
  }

  private handleMotionFrame(chunk: Buffer) {
    if (!this.isRunning) return;

    // Safety check: if buffer is full, reset to avoid overflow
    if (this.bufferLen + chunk.length > this.buffer.length) {
      console.warn('MotionDetector: Buffer overflow, resetting buffer to prevent memory leak.');
      this.bufferLen = 0;
      return;
    }

    // Copy chunk into pre-allocated buffer
    chunk.copy(this.buffer, this.bufferLen);
    this.bufferLen += chunk.length;
    
    while (this.bufferLen >= this.FRAME_SIZE) {
      // Create a copy of the frame for processing (needed for async/storage)
      const frameData = Buffer.from(this.buffer.subarray(0, this.FRAME_SIZE));
      
      const config = CameraModel.getConfig()?.motionConfig;
      if (config) {
          try {
            this.processFrame(frameData, config);
          } catch (err) {
            console.error('MotionDetector: Error processing frame', err);
          }
      }

      // Shift remaining data to start of buffer
      // copyWithin(targetStart, start, end)
      this.buffer.copyWithin(0, this.FRAME_SIZE, this.bufferLen);
      this.bufferLen -= this.FRAME_SIZE;
    }
  }

  private processFrame(currentFrame: Buffer, config: MotionConfig) {
    // Apply mask if needed (modifies currentFrame in place)
    if (config.regions && config.regions.length > 0) {
       this.applyMask(currentFrame, config.regions);
    }

    if (this.previousFrameData) {
       let diffPixels = 0;
       const threshold = 25; // Pixel difference threshold (0-255). ~10% change

       for (let i = 0; i < currentFrame.length; i++) {
           const diff = Math.abs(currentFrame[i] - this.previousFrameData[i]);
           if (diff > threshold) {
               diffPixels++;
           }
       }

       const totalPixels = this.width * this.height;
       const diffRatio = diffPixels / totalPixels;
       
       // Threshold calc: Sensitivity 1-100.
       // 100 -> 0.001 (0.1%)
       // 1 -> 0.1 (10%)
       const triggerThreshold = ((100 - config.sensitivity) / 100) * 0.2; // Max 20% diff required for sens 0

       if (diffRatio > triggerThreshold) {
          this.consecutiveMotionFrames++;
          if (this.consecutiveMotionFrames >= this.TRIGGER_FRAMES) {
             const now = Date.now();
             if (now - this.lastTriggerTime > this.COOLDOWN_MS) {
                this.lastTriggerTime = now;
                console.log(`Motion Detected! Diff: ${(diffRatio*100).toFixed(2)}% > ${(triggerThreshold*100).toFixed(2)}%`);
                this.emit('motion');
             }
          }
       } else {
          this.consecutiveMotionFrames = 0;
       }
    }

    this.previousFrameData = currentFrame;
  }

  private applyMask(frameData: Buffer, regions: MotionConfig['regions']) {
     const w = this.width;
     const h = this.height;
     
     const pixelRegions = regions.map(r => ({
       x1: Math.floor(r.x * w / 100),
       y1: Math.floor(r.y * h / 100),
       x2: Math.floor((r.x + r.width) * w / 100),
       y2: Math.floor((r.y + r.height) * h / 100)
     }));

     // If regions are defined, they are "inclusion" zones. Everything else is masked out (set to 0).
     // Wait, usually regions are "detection zones".
     // If user draws a box, they want to detect motion IN that box.
     // So pixels OUTSIDE the box should be ignored.
     
     for (let y = 0; y < h; y++) {
       for (let x = 0; x < w; x++) {
         let inside = false;
         for (const r of pixelRegions) {
           if (x >= r.x1 && x < r.x2 && y >= r.y1 && y < r.y2) {
             inside = true;
             break;
           }
         }
         
         if (!inside) {
           const idx = y * w + x; // 1 byte per pixel
           frameData[idx] = 0;
         }
       }
     }
  }
}
