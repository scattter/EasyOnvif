import onvif from 'node-onvif';
import { CameraModel } from '../models';

interface ConnectionConfig {
  ip: string;
  port?: number;
  username?: string;
  password?: string;
}

class OnvifService {
  private device: any = null;
  private connectionPromise: Promise<boolean> | null = null;
  private zoomRatio = 1;
  private readonly minZoomRatio = 1;
  private readonly maxZoomRatio = 5;
  private eventListenerActive = false;

  async connect(config?: ConnectionConfig): Promise<boolean> {
    // 如果正在连接中，等待连接完成
    if (this.connectionPromise) {
      return this.connectionPromise;
    }

    this.connectionPromise = this.doConnect(config);
    try {
      const result = await this.connectionPromise;
      return result;
    } finally {
      this.connectionPromise = null;
    }
  }

  private async doConnect(config?: ConnectionConfig): Promise<boolean> {
    try {
      const cameraConfig = config || CameraModel.getConfig();
      
      if (!cameraConfig) {
        throw new Error('摄像头未配置');
      }

      const conf = cameraConfig as any;
      const { ip, port = 80, username, password, onvifUrl } = conf;
      const xaddr = onvifUrl || `http://${ip}:${port}/onvif/device_service`;

      // Initialize OnvifDevice with xaddr
      this.device = new onvif.OnvifDevice({
        xaddr,
        user: username || '',
        pass: password || '',
      });

      // Initialize the device (probes services, capabilities, profiles)
      await this.device.init();

      // 更新状态
      if (!config) {
        CameraModel.upsert({
          status: 'connected',
          lastConnectedAt: new Date(),
        });
      }

      return true;
    } catch (error) {
      if (!config) {
        CameraModel.upsert({
          status: 'error',
        });
      }
      console.error('ONVIF connect error:', error);
      throw error;
    }
  }

  async testConnection(config: ConnectionConfig): Promise<{
    reachable: boolean;
    onvifSupported: boolean;
    capabilities: {
      ptz: boolean;
      zoom: boolean;
      events: string[];
    };
  }> {
    try {
      const device = new onvif.OnvifDevice({
        xaddr: `http://${config.ip}:${config.port || 80}/onvif/device_service`,
        user: config.username || '',
        pass: config.password || '',
      });
      
      await device.init();

      // Check capabilities based on initialized services
      const capabilities = {
        ptz: !!device.services.ptz,
        zoom: !!device.services.ptz, // Zoom is typically part of PTZ service
        events: !!device.services.events ? ['motion', 'tampering'] : [],
      };

      return {
        reachable: true,
        onvifSupported: true,
        capabilities,
      };
    } catch (error) {
      console.error('Test connection error:', error);
      return {
        reachable: false,
        onvifSupported: false,
        capabilities: {
          ptz: false,
          zoom: false,
          events: [],
        },
      };
    }
  }

  async ptzMove(direction: string, speed: number): Promise<void> {
    if (!this.device) {
      await this.connect();
    }

    if (!this.device.services.ptz) {
      throw new Error('PTZ service not available');
    }

    const profile = this.device.getCurrentProfile();
    if (!profile) throw new Error('No profile found');
    const token = profile.token;

    if (direction === 'stop') {
      // Relative move doesn't need explicit stop, but we keep this for compatibility
      await this.device.services.ptz.stop({ ProfileToken: token });
      return;
    }

    const stepDistance = 0.1;
    const tx = direction === 'left' ? -stepDistance : direction === 'right' ? stepDistance : 0;
    const ty = direction === 'up' ? -stepDistance : direction === 'down' ? stepDistance : 0;

    try {
      await this.device.services.ptz.relativeMove({
        ProfileToken: token,
        Translation: { x: tx, y: ty, z: 0 },
      });
    } catch (error) {
      const vx = direction === 'left' ? -speed : direction === 'right' ? speed : 0;
      const vy = direction === 'up' ? -speed : direction === 'down' ? speed : 0;
      await this.device.services.ptz.continuousMove({
        ProfileToken: token,
        Velocity: { x: vx, y: vy, z: 0 },
        Timeout: 1,
      });
    }
  }

  async ptzZoom(direction: string, speed: number): Promise<void> {
    if (!this.device) {
      await this.connect();
    }

    if (!this.device.services.ptz) {
      throw new Error('PTZ service not available');
    }

    const profile = this.device.getCurrentProfile();
    if (!profile) throw new Error('No profile found');
    const token = profile.token;

    if (direction === 'stop') {
      await this.device.services.ptz.stop({ ProfileToken: token });
      return;
    }

    const stepDistance = 0.1;
    const tz = direction === 'out' ? -stepDistance : direction === 'in' ? stepDistance : 0;

    try {
      await this.device.services.ptz.relativeMove({
        ProfileToken: token,
        Translation: { x: 0, y: 0, z: tz },
      });
      this.updateZoomRatio(direction);
    } catch (error) {
      const vz = direction === 'out' ? -speed : direction === 'in' ? speed : 0;
      await this.device.services.ptz.continuousMove({
        ProfileToken: token,
        Velocity: { x: 0, y: 0, z: vz },
        Timeout: 1,
      });
      this.updateZoomRatio(direction);
    }
  }

  getZoomRatio(): number {
    return this.zoomRatio;
  }

  private updateZoomRatio(direction: string) {
    const step = 0.1;
    const delta = direction === 'in' ? step : direction === 'out' ? -step : 0;
    const next = this.zoomRatio + delta;
    this.zoomRatio = Math.max(this.minZoomRatio, Math.min(this.maxZoomRatio, Number(next.toFixed(2))));
  }

  async getPresets(): Promise<Array<{ token: string; name: string }>> {
    if (!this.device) {
      await this.connect();
    }

    if (!this.device.services.ptz) {
      return [];
    }

    try {
      const profile = this.device.getCurrentProfile();
      if (!profile) return [];
      
      const result = await this.device.services.ptz.getPresets({ ProfileToken: profile.token });
      
      // Handle nested response structure safely
      const presetsData = result?.data?.GetPresetsResponse?.Preset;
      if (!presetsData) return [];
      
      const presets = Array.isArray(presetsData) ? presetsData : [presetsData];
      
      return presets.map((preset: any) => ({
        token: preset.token,
        name: preset.Name,
      }));
    } catch (error) {
      console.error('Get presets error:', error);
      return [];
    }
  }

  async gotoPreset(token: string): Promise<void> {
    if (!this.device) {
      await this.connect();
    }

    if (!this.device.services.ptz) {
      throw new Error('PTZ service not available');
    }

    const profile = this.device.getCurrentProfile();
    if (!profile) throw new Error('No profile found');

    await this.device.services.ptz.gotoPreset({
      ProfileToken: profile.token,
      PresetToken: token,
    });
  }

  async getStreamUrl(): Promise<string> {
    if (!this.device) {
      await this.connect();
    }

    // node-onvif populates stream object in profile during init
    const profile = this.device.getCurrentProfile();
    if (profile && profile.stream && profile.stream.rtsp) {
      return profile.stream.rtsp;
    }
    
    // Fallback logic could be added here if needed, but usually init() handles it.
    throw new Error('Could not retrieve RTSP stream URL');
  }

  async startEventListener(callback: (event: any) => void): Promise<void> {
    if (!this.device) {
      await this.connect();
    }

    if (this.eventListenerActive) {
      return;
    }

    this.device.on('event', callback);
    if (typeof this.device.startPulling === 'function') {
      this.device.startPulling();
    }
    this.eventListenerActive = true;
  }
}

export const onvifService = new OnvifService();
