import dgram from 'dgram';
import { promisify } from 'util';
import xml2js from 'xml2js';

interface DiscoveredDevice {
  ip: string;
  port: number;
  onvifUrl: string;
  manufacturer?: string;
  model?: string;
  serialNumber?: string;
  firmwareVersion?: string;
}

export class OnvifDiscoveryService {
  private readonly WS_DISCOVERY_PORT = 3702;
  private readonly WS_DISCOVERY_IP = '239.255.255.250';
  private readonly DISCOVERY_TIMEOUT = 5000; // 5秒超时

  // WS-Discovery 探测消息
  private readonly probeMessage = `<?xml version="1.0" encoding="UTF-8"?>
<Envelope xmlns="http://www.w3.org/2003/05/soap-envelope" xmlns:wsa="http://schemas.xmlsoap.org/ws/2004/08/addressing" xmlns:tns="http://schemas.xmlsoap.org/ws/2005/04/discovery">
  <Header>
    <wsa:Action>http://schemas.xmlsoap.org/ws/2005/04/discovery/Probe</wsa:Action>
    <wsa:MessageID>urn:uuid:${this.generateUUID()}</wsa:MessageID>
    <wsa:To>urn:schemas-xmlsoap-org:ws:2005:04:discovery</wsa:To>
  </Header>
  <Body>
    <tns:Probe>
      <tns:Types>tdn:NetworkVideoTransmitter</tns:Types>
    </tns:Probe>
  </Body>
</Envelope>`;

  private readonly probeSoapBody = `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope" xmlns:tds="http://www.onvif.org/ver10/device/wsdl">
  <soap:Header/>
  <soap:Body>
    <tds:GetSystemDateAndTime/>
  </soap:Body>
</soap:Envelope>`;

  /**
   * 扫描局域网内的ONVIF设备
   */
  async scanNetwork(): Promise<DiscoveredDevice[]> {
    const devices: DiscoveredDevice[] = [];
    const seenIps = new Set<string>();

    return new Promise((resolve) => {
      const socket = dgram.createSocket('udp4');
      const timeout = setTimeout(() => {
        socket.close();
        resolve(devices);
      }, this.DISCOVERY_TIMEOUT);

      socket.on('message', async (msg, rinfo) => {
        try {
          const device = await this.parseDiscoveryResponse(msg.toString(), rinfo.address);
          if (device && !seenIps.has(device.ip)) {
            seenIps.add(device.ip);
            devices.push(device);
          }
        } catch (error) {
          console.error('解析发现响应失败:', error);
        }
      });

      socket.on('error', (err) => {
        console.error('Discovery socket error:', err);
        clearTimeout(timeout);
        socket.close();
        resolve(devices);
      });

      socket.bind(() => {
        socket.setBroadcast(true);
        socket.send(
          this.probeMessage,
          this.WS_DISCOVERY_PORT,
          this.WS_DISCOVERY_IP,
          (err) => {
            if (err) {
              console.error('发送探测消息失败:', err);
              clearTimeout(timeout);
              socket.close();
              resolve(devices);
            }
          }
        );
      });
    });
  }

  /**
   * 扫描指定IP范围
   */
  async scanIpRange(startIp: string, endIp: string, port: number = 80): Promise<DiscoveredDevice[]> {
    const devices: DiscoveredDevice[] = [];
    const start = this.ipToNumber(startIp);
    const end = this.ipToNumber(endIp);

    // 限制扫描范围，避免扫描太多IP
    const maxScan = 254;
    if (end - start > maxScan) {
      throw new Error(`扫描范围过大，最多支持 ${maxScan} 个IP`);
    }

    const promises: Promise<void>[] = [];

    for (let i = start; i <= end; i++) {
      const ip = this.numberToIp(i);
      promises.push(
        this.testOnvifDevice(ip, port).then((device) => {
          if (device) {
            devices.push(device);
          }
        }).catch(() => {
          // 忽略连接失败的IP
        })
      );
    }

    await Promise.all(promises);
    return devices;
  }

  /**
   * 测试单个IP是否为ONVIF设备
   */
  async testOnvifDevice(ip: string, port: number = 80, username?: string, password?: string): Promise<DiscoveredDevice | null> {
    try {
      // 尝试多个常见的ONVIF端点
      const endpoints = [
        '/onvif/device_service',
        '/onvif/device',
        '/device_service',
        '/onvif/services',
      ];

      for (const endpoint of endpoints) {
        const onvifUrl = `http://${ip}:${port}${endpoint}`;
        
        // 1. 尝试GET请求 (轻量级)
        try {
          console.log(`Testing endpoint (GET): ${onvifUrl}`);
          const response = await this.httpRequest(onvifUrl, username, password);
          
          if (response.includes('onvif') || response.includes('ONVIF')) {
            console.log(`Endpoint confirmed (GET): ${onvifUrl}`);
            return {
              ip,
              port,
              onvifUrl,
            };
          }
        } catch (error) {
          const errMsg = error instanceof Error ? error.message : String(error);
          console.log(`Endpoint failed (GET): ${onvifUrl}`, errMsg);
          
          // 如果返回401(未授权)或405(方法不允许)，说明服务存在
          if (errMsg.includes('HTTP 401') || errMsg.includes('HTTP 405')) {
            console.log(`Endpoint found (auth required or method not allowed): ${onvifUrl}`);
            return {
              ip,
              port,
              onvifUrl,
            };
          }
        }

        // 2. 尝试POST请求 (GetSystemDateAndTime) - 更健壮，解决某些设备不支持GET的问题
        try {
          console.log(`Testing endpoint (POST): ${onvifUrl}`);
          const response = await this.httpRequest(onvifUrl, username, password, this.probeSoapBody);
          
          if (response.includes('GetSystemDateAndTimeResponse') || response.includes('onvif') || response.includes('ONVIF')) {
            console.log(`Endpoint confirmed (POST): ${onvifUrl}`);
            return {
              ip,
              port,
              onvifUrl,
            };
          }
        } catch (error) {
          const errMsg = error instanceof Error ? error.message : String(error);
          console.log(`Endpoint failed (POST): ${onvifUrl}`, errMsg);
          
          if (errMsg.includes('HTTP 401') || errMsg.includes('HTTP 405')) {
            console.log(`Endpoint found (auth required or method not allowed): ${onvifUrl}`);
            return {
              ip,
              port,
              onvifUrl,
            };
          }
        }
      }

      return null;
    } catch {
      return null;
    }
  }

  /**
   * 获取设备详细信息
   */
  async getDeviceInfo(ip: string, port: number, onvifUrl: string, username?: string, password?: string): Promise<Partial<DiscoveredDevice>> {
    try {
      // 构造GetDeviceInformation请求
      const soapRequest = `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope" xmlns:tds="http://www.onvif.org/ver10/device/wsdl">
  <soap:Header/>
  <soap:Body>
    <tds:GetDeviceInformation/>
  </soap:Body>
</soap:Envelope>`;

      const response = await this.httpRequest(onvifUrl, username, password, soapRequest);
      
      // 解析XML响应
      const parser = new xml2js.Parser({ explicitArray: false });
      const parseString = (str: string) => new Promise<any>((resolve, reject) => parser.parseString(str, (err: any, result: any) => err ? reject(err) : resolve(result)));
      const result = await parseString(response);
      
      const info = result?.['SOAP-ENV:Envelope']?.['SOAP-ENV:Body']?.['tds:GetDeviceInformationResponse'];
      
      return {
        manufacturer: info?.['tds:Manufacturer'],
        model: info?.['tds:Model'],
        serialNumber: info?.['tds:SerialNumber'],
        firmwareVersion: info?.['tds:FirmwareVersion'],
      };
    } catch (error) {
      console.error('获取设备信息失败:', error);
      return {};
    }
  }

  /**
   * 获取MJPEG流地址（尝试多个常见路径）
   */
  async getMjpegUrl(ip: string, port: number, username?: string, password?: string): Promise<string | null> {
    const mjpegPaths = [
      '/stream.jpg',           // TP-Link 常见格式
      '/cgi-bin/video.cgi',
      '/mjpeg.cgi',
      '/video.cgi',
      '/mjpg/video.mjpg',
      '/cgi-bin/mjpg/video.cgi',
      '/live/stream.jpg',
    ];

    for (const path of mjpegPaths) {
      const url = `http://${ip}:${port}${path}`;
      try {
        const response = await this.httpRequest(url, username, password);
        // 如果请求成功且内容看起来是图片流，则返回该URL
        if (response.includes('image') || response.includes('JFIF') || response.includes('\xff\xd8')) {
          console.log(`Found MJPEG endpoint: ${url}`);
          return url;
        }
      } catch (error: any) {
        // 检查是否是401错误（需要认证）
        if (error.message && (error.message.includes('401') || error.message.includes('403'))) {
          // 这个路径存在但需要认证，记录下来
          console.log(`MJPEG endpoint found (auth required): ${url}`);
          return url;
        }
        // 其他错误继续尝试下一个路径
      }
    }

    // 默认返回最常见的TP-Link格式
    return `http://${ip}:${port}/stream.jpg`;
  }

  /**
   * 获取RTSP流地址
   */
  async getStreamUri(ip: string, port: number, onvifUrl: string, username?: string, password?: string): Promise<string | null> {
    try {
      // 首先获取媒体服务地址
      const mediaUrl = await this.getMediaUrl(onvifUrl, username, password);
      if (!mediaUrl) return null;

      // 构造GetStreamUri请求
      const soapRequest = `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope" xmlns:trt="http://www.onvif.org/ver10/media/wsdl" xmlns:tt="http://www.onvif.org/ver10/schema">
  <soap:Header/>
  <soap:Body>
    <trt:GetStreamUri>
      <trt:StreamSetup>
        <tt:Stream>RTP-Unicast</tt:Stream>
        <tt:Transport>
          <tt:Protocol>RTSP</tt:Protocol>
        </tt:Transport>
      </trt:StreamSetup>
      <trt:ProfileToken>profile_1</trt:ProfileToken>
    </trt:GetStreamUri>
  </soap:Body>
</soap:Envelope>`;

      const response = await this.httpRequest(mediaUrl, username, password, soapRequest);
      
      // 解析响应获取RTSP地址
      const parser = new xml2js.Parser({ explicitArray: false });
      const parseString = (str: string) => new Promise<any>((resolve, reject) => parser.parseString(str, (err: any, result: any) => err ? reject(err) : resolve(result)));
      const result = await parseString(response);
      
      const uri = result?.['SOAP-ENV:Envelope']?.['SOAP-ENV:Body']?.['trt:GetStreamUriResponse']?.['trt:MediaUri']?.['tt:Uri'];
      
      return uri || null;
    } catch (error) {
      console.error('获取流地址失败:', error);
      return null;
    }
  }

  /**
   * 解析WS-Discovery响应
   */
  private async parseDiscoveryResponse(xml: string, ip: string): Promise<DiscoveredDevice | null> {
    try {
      const parser = new xml2js.Parser({ explicitArray: false });
      const parseString = (str: string) => new Promise<any>((resolve, reject) => parser.parseString(str, (err: any, result: any) => err ? reject(err) : resolve(result)));
      const result = await parseString(xml);
      
      const probeMatch = result?.['SOAP-ENV:Envelope']?.['SOAP-ENV:Body']?.['wsdd:ProbeMatches']?.['wsdd:ProbeMatch'];
      
      if (probeMatch) {
        const xAddr = probeMatch['wsdd:XAddrs'];
        if (xAddr) {
          const url = new URL(xAddr.split(' ')[0]); // 可能有多个地址，取第一个
          return {
            ip: url.hostname,
            port: parseInt(url.port) || 80,
            onvifUrl: xAddr.split(' ')[0],
          };
        }
      }
      
      return null;
    } catch {
      return null;
    }
  }

  /**
   * 获取媒体服务URL
   */
  private async getMediaUrl(onvifUrl: string, username?: string, password?: string): Promise<string | null> {
    try {
      const soapRequest = `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope" xmlns:tds="http://www.onvif.org/ver10/device/wsdl">
  <soap:Header/>
  <soap:Body>
    <tds:GetServices>
      <tds:IncludeCapability>false</tds:IncludeCapability>
    </tds:GetServices>
  </soap:Body>
</soap:Envelope>`;

      const response = await this.httpRequest(onvifUrl, username, password, soapRequest);
      
      // 解析响应找到Media服务
      const parser = new xml2js.Parser({ explicitArray: false });
      const parseString = (str: string) => new Promise<any>((resolve, reject) => parser.parseString(str, (err: any, result: any) => err ? reject(err) : resolve(result)));
      const result = await parseString(response);
      
      const services = result?.['SOAP-ENV:Envelope']?.['SOAP-ENV:Body']?.['tds:GetServicesResponse']?.['tds:Service'];
      
      if (Array.isArray(services)) {
        const mediaService = services.find(s => s['tds:Namespace']?.includes('media'));
        if (mediaService) {
          return mediaService['tds:XAddr'];
        }
      } else if (services?.['tds:Namespace']?.includes('media')) {
        return services['tds:XAddr'];
      }
      
      return null;
    } catch {
      return null;
    }
  }

  /**
   * HTTP请求
   */
  private httpRequest(url: string, username?: string, password?: string, body?: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const urlObj = new URL(url);
      const options = {
        hostname: urlObj.hostname,
        port: urlObj.port || 80,
        path: urlObj.pathname + urlObj.search,
        method: body ? 'POST' : 'GET',
        headers: {
          'Content-Type': 'application/soap+xml; charset=utf-8',
          ...(body ? { 'Content-Length': Buffer.byteLength(body) } : {}),
          ...(username && password ? { 
            'Authorization': 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64') 
          } : {}),
        },
        timeout: 5000,
      };

      const http = require('http');
      const req = http.request(options, (res: any) => {
        let data = '';
        res.on('data', (chunk: Buffer) => data += chunk);
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(data);
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${data}`));
          }
        });
      });

      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });

      if (body) {
        req.write(body);
      }
      req.end();
    });
  }

  /**
   * IP地址转数字
   */
  private ipToNumber(ip: string): number {
    return ip.split('.').reduce((acc, octet) => (acc << 8) + parseInt(octet, 10), 0) >>> 0;
  }

  /**
   * 数字转IP地址
   */
  private numberToIp(num: number): string {
    return [
      (num >>> 24) & 255,
      (num >>> 16) & 255,
      (num >>> 8) & 255,
      num & 255,
    ].join('.');
  }

  /**
   * 生成UUID
   */
  private generateUUID(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }
}

export const onvifDiscoveryService = new OnvifDiscoveryService();
