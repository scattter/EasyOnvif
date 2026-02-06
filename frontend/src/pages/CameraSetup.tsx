import { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { discoveryApi, cameraApi } from '../api';
import { Scan, Search, Check, AlertCircle, Loader2, Wifi, Settings } from 'lucide-react';
import toast from 'react-hot-toast';

interface DiscoveredDevice {
  ip: string;
  port: number;
  onvifUrl: string;
  manufacturer?: string;
  model?: string;
  serialNumber?: string;
  firmwareVersion?: string;
}

export default function CameraSetupPage() {
  const [scanMode, setScanMode] = useState<'network' | 'range' | 'manual'>('network');
  const [startIp, setStartIp] = useState('');
  const [endIp, setEndIp] = useState('');
  const [manualIp, setManualIp] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [discoveredDevices, setDiscoveredDevices] = useState<DiscoveredDevice[]>([]);
  const [configuringDevice, setConfiguringDevice] = useState<DiscoveredDevice | null>(null);

  // 检查现有配置
  const { data: existingConfig } = useQuery({
    queryKey: ['camera-config'],
    queryFn: () => cameraApi.getConfig(),
    retry: false,
  });

  // 网络扫描
  const networkScanMutation = useMutation({
    mutationFn: () => discoveryApi.scanNetwork(),
    onSuccess: (response) => {
      setDiscoveredDevices(response.data.data.devices);
      if (response.data.data.devices.length === 0) {
        toast('未发现摄像头，请尝试手动输入IP');
      } else {
        toast.success(`发现 ${response.data.data.devices.length} 个设备`);
      }
    },
    onError: () => {
      toast.error('扫描失败，请检查网络连接');
    },
  });

  // 范围扫描
  const rangeScanMutation = useMutation({
    mutationFn: () => discoveryApi.scanRange(startIp, endIp, 80),
    onSuccess: (response) => {
      setDiscoveredDevices(response.data.data.devices);
      if (response.data.data.devices.length === 0) {
        toast('未发现摄像头');
      } else {
        toast.success(`发现 ${response.data.data.devices.length} 个设备`);
      }
    },
    onError: () => {
      toast.error('扫描失败');
    },
  });

  // 手动测试
  const manualTestMutation = useMutation({
    mutationFn: () => discoveryApi.testSingle(manualIp, 80, username, password),
    onSuccess: (response) => {
      setDiscoveredDevices(response.data.data.devices);
      if (response.data.data.devices.length === 0) {
        toast.error('无法连接到该IP的ONVIF设备');
      } else {
        toast.success('找到设备！');
      }
    },
    onError: () => {
      toast.error('连接失败，请检查IP和端口');
    },
  });

  // 自动配置设备
  const autoConfigureMutation = useMutation({
    mutationFn: (device: DiscoveredDevice) =>
      discoveryApi.autoDiscover(device.ip, device.port, username, password),
    onSuccess: () => {
      toast.success('摄像头配置成功！');
      window.location.reload();
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error?.message || '配置失败');
    },
  });

  const handleScan = () => {
    setDiscoveredDevices([]);
    switch (scanMode) {
      case 'network':
        networkScanMutation.mutate();
        break;
      case 'range':
        if (!startIp || !endIp) {
          toast.error('请输入起始和结束IP');
          return;
        }
        rangeScanMutation.mutate();
        break;
      case 'manual':
        if (!manualIp) {
          toast.error('请输入IP地址');
          return;
        }
        manualTestMutation.mutate();
        break;
    }
  };

  const isScanning = networkScanMutation.isPending || rangeScanMutation.isPending || manualTestMutation.isPending;

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">
            {existingConfig?.data.data ? '重新配置摄像头' : '配置摄像头'}
          </h1>
          <p className="mt-2 text-gray-600">
            选择扫描方式自动发现摄像头，或手动输入IP地址
          </p>
        </div>

        {/* 现有配置提示 */}
        {existingConfig?.data.data && (
          <div className="card p-4 mb-6 bg-yellow-50 border-yellow-200">
            <div className="flex items-start">
              <AlertCircle className="w-5 h-5 text-yellow-600 mt-0.5 mr-3" />
              <div>
                <h3 className="font-medium text-yellow-800">已有摄像头配置</h3>
                <p className="text-sm text-yellow-700 mt-1">
                  当前已配置: {existingConfig.data.data.name} ({existingConfig.data.data.ip})
                </p>
                <p className="text-sm text-yellow-600 mt-1">
                  重新配置将覆盖现有设置
                </p>
              </div>
            </div>
          </div>
        )}

        {/* 扫描模式选择 */}
        <div className="card p-6 mb-6">
          <div className="flex space-x-4 mb-6">
            <button
              onClick={() => setScanMode('network')}
              className={`flex-1 py-3 px-4 rounded-lg border-2 text-center transition-colors ${
                scanMode === 'network'
                  ? 'border-primary-500 bg-primary-50 text-primary-700'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <Wifi className="w-6 h-6 mx-auto mb-2" />
              <div className="font-medium">网络扫描</div>
              <div className="text-xs text-gray-500 mt-1">自动发现局域网设备</div>
            </button>
            <button
              onClick={() => setScanMode('range')}
              className={`flex-1 py-3 px-4 rounded-lg border-2 text-center transition-colors ${
                scanMode === 'range'
                  ? 'border-primary-500 bg-primary-50 text-primary-700'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <Search className="w-6 h-6 mx-auto mb-2" />
              <div className="font-medium">IP范围</div>
              <div className="text-xs text-gray-500 mt-1">扫描指定IP段</div>
            </button>
            <button
              onClick={() => setScanMode('manual')}
              className={`flex-1 py-3 px-4 rounded-lg border-2 text-center transition-colors ${
                scanMode === 'manual'
                  ? 'border-primary-500 bg-primary-50 text-primary-700'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <Settings className="w-6 h-6 mx-auto mb-2" />
              <div className="font-medium">手动配置</div>
              <div className="text-xs text-gray-500 mt-1">输入固定IP</div>
            </button>
          </div>

          {/* 扫描参数 */}
          <div className="space-y-4">
            {scanMode === 'range' && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    起始IP
                  </label>
                  <input
                    type="text"
                    value={startIp}
                    onChange={(e) => setStartIp(e.target.value)}
                    placeholder="192.168.1.1"
                    className="input"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    结束IP
                  </label>
                  <input
                    type="text"
                    value={endIp}
                    onChange={(e) => setEndIp(e.target.value)}
                    placeholder="192.168.1.254"
                    className="input"
                  />
                </div>
              </div>
            )}

            {scanMode === 'manual' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  摄像头IP地址
                </label>
                <input
                  type="text"
                  value={manualIp}
                  onChange={(e) => setManualIp(e.target.value)}
                  placeholder="192.168.1.100"
                  className="input"
                />
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  用户名 (可选)
                </label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="admin"
                  className="input"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  密码 (可选)
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="camera password"
                  className="input"
                />
              </div>
            </div>

            <button
              onClick={handleScan}
              disabled={isScanning}
              className="w-full btn-primary py-3 disabled:opacity-50"
            >
              {isScanning ? (
                <>
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  扫描中...
                </>
              ) : (
                <>
                  <Scan className="w-5 h-5 mr-2" />
                  开始扫描
                </>
              )}
            </button>
          </div>
        </div>

        {/* 发现的设备列表 */}
        {discoveredDevices.length > 0 && (
          <div className="card p-6">
            <h2 className="text-lg font-medium text-gray-900 mb-4">
              发现 {discoveredDevices.length} 个设备
            </h2>
            <div className="space-y-4">
              {discoveredDevices.map((device, index) => (
                <div
                  key={index}
                  className="border border-gray-200 rounded-lg p-4 hover:border-primary-300 transition-colors"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="font-medium text-gray-900">
                        {device.manufacturer || 'Unknown'} {device.model || 'Camera'}
                      </div>
                      <div className="text-sm text-gray-500 mt-1">
                        IP: {device.ip}:{device.port}
                      </div>
                      {device.firmwareVersion && (
                        <div className="text-sm text-gray-500">
                          固件: {device.firmwareVersion}
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => setConfiguringDevice(device)}
                      disabled={autoConfigureMutation.isPending}
                      className="btn-primary text-sm"
                    >
                      {autoConfigureMutation.isPending && configuringDevice?.ip === device.ip ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <>
                          <Check className="w-4 h-4 mr-1" />
                          配置
                        </>
                      )}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 配置确认对话框 */}
        {configuringDevice && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
              <h3 className="text-lg font-medium text-gray-900 mb-4">确认配置</h3>
              <div className="space-y-3 mb-6">
                <div className="flex justify-between">
                  <span className="text-gray-500">设备:</span>
                  <span className="font-medium">
                    {configuringDevice.manufacturer || 'Unknown'} {configuringDevice.model || 'Camera'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">IP地址:</span>
                  <span className="font-medium">{configuringDevice.ip}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">用户名:</span>
                  <span className="font-medium">{username || '未设置'}</span>
                </div>
              </div>
              <div className="flex space-x-3">
                <button
                  onClick={() => setConfiguringDevice(null)}
                  className="flex-1 btn-secondary"
                >
                  取消
                </button>
                <button
                  onClick={() => {
                    autoConfigureMutation.mutate(configuringDevice);
                    setConfiguringDevice(null);
                  }}
                  disabled={autoConfigureMutation.isPending}
                  className="flex-1 btn-primary disabled:opacity-50"
                >
                  {autoConfigureMutation.isPending ? '配置中...' : '确认配置'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
