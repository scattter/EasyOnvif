import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { cameraApi } from '../api';
import { Link } from 'react-router-dom';
import { Plus, Camera, Settings, Tv } from 'lucide-react';
import toast from 'react-hot-toast';

export default function DeviceListPage() {
  const queryClient = useQueryClient();
  const { data: cameraConfig, isLoading } = useQuery({
    queryKey: ['camera-config'],
    queryFn: () => cameraApi.getConfig(),
    retry: false,
  });

  const device = cameraConfig?.data?.data;
  const [isEditing, setIsEditing] = useState(false);

  const [form, setForm] = useState({
    name: '',
    ip: '',
    port: 80,
    username: '',
    password: '',
    rtspUrl: '',
    onvifUrl: '',
  });

  useEffect(() => {
    if (!device) {
      return;
    }
    setForm({
      name: device.name || '',
      ip: device.ip || '',
      port: device.port || 80,
      username: device.username || '',
      password: '',
      rtspUrl: device.rtspUrl || '',
      onvifUrl: device.onvifUrl || '',
    });
  }, [device]);

  const updateMutation = useMutation({
    mutationFn: (payload: {
      name?: string | null;
      ip: string;
      port?: number;
      username?: string | null;
      password?: string | null;
      rtspUrl?: string | null;
      onvifUrl?: string | null;
    }) => cameraApi.updateConfig(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['camera-config'] });
      setIsEditing(false);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => cameraApi.deleteConfig(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['camera-config'] });
      setIsEditing(false);
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">设备管理</h1>
          <p className="mt-1 text-sm text-gray-500">查看和管理已连接的监控设备</p>
        </div>
        {!device && (
          <Link
            to="/camera-setup"
            className="btn-primary inline-flex items-center"
          >
            <Plus className="w-5 h-5 mr-2" />
            添加设备
          </Link>
        )}
      </div>

      {!device ? (
        <div className="bg-white rounded-lg border-2 border-dashed border-gray-300 p-12 text-center">
          <Camera className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-2 text-sm font-medium text-gray-900">暂无设备</h3>
          <p className="mt-1 text-sm text-gray-500">开始添加您的第一个监控摄像头</p>
          <div className="mt-6">
            <Link
              to="/camera-setup"
              className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
            >
              <Plus className="-ml-1 mr-2 h-5 w-5" aria-hidden="true" />
              添加设备
            </Link>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          <div className="bg-white overflow-hidden shadow rounded-lg border border-gray-100 hover:shadow-md transition-shadow">
            <div className="p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <div className="flex items-center justify-center h-12 w-12 rounded-md bg-primary-100 text-primary-600">
                    <Camera className="h-6 w-6" />
                  </div>
                </div>
                <div className="ml-4 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">
                      {device.name || '未命名设备'}
                    </dt>
                    <dd>
                      <div className="text-lg font-medium text-gray-900">
                        {device.ip}:{device.port}
                      </div>
                    </dd>
                  </dl>
                </div>
              </div>
            </div>
            <div className="bg-gray-50 px-5 py-3">
              <div className="text-sm space-y-3">
                 <div className="flex justify-between items-center text-gray-500">
                    <span>状态</span>
                    <span className={`px-2 py-0.5 inline-flex text-xs leading-5 font-semibold rounded-full ${device.status === 'connected' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                      {device.status === 'connected' ? '在线' : '离线'}
                    </span>
                 </div>
                 <div className="flex flex-col space-y-1 text-gray-500">
                    <span className="text-xs uppercase tracking-wider text-gray-400">ONVIF 地址</span>
                    <span className="truncate text-xs bg-gray-100 p-1 rounded font-mono select-all" title={device.onvifUrl}>{device.onvifUrl}</span>
                 </div>
                 <div className="flex flex-col space-y-1 text-gray-500">
                    <span className="text-xs uppercase tracking-wider text-gray-400">RTSP 地址</span>
                    <span className="truncate text-xs bg-gray-100 p-1 rounded font-mono select-all" title={device.rtspUrl}>{device.rtspUrl}</span>
                 </div>
                 {device.lastConnectedAt && (
                   <div className="text-xs text-gray-400 text-right">
                     上次更新: {new Date(device.lastConnectedAt).toLocaleString()}
                   </div>
                 )}
              </div>
              <div className="mt-4 flex space-x-3 border-t pt-4">
                 <Link to="/" className="flex-1 text-center inline-flex justify-center items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700 shadow-sm">
                    <Tv className="w-4 h-4 mr-1.5" /> 实时画面
                 </Link>
                 <button
                   onClick={() => setIsEditing(!isEditing)}
                   className="flex-1 text-center inline-flex justify-center items-center px-3 py-2 border border-gray-300 text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 shadow-sm"
                 >
                   <Settings className="w-4 h-4 mr-1.5" /> {isEditing ? '取消编辑' : '编辑设备'}
                 </button>
              </div>
              {isEditing && (
                <div className="mt-4 space-y-3 border-t pt-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">名称</label>
                      <input
                        value={form.name}
                        onChange={(e) => setForm({ ...form, name: e.target.value })}
                        className="input text-sm"
                        placeholder="摄像头"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">IP</label>
                      <input
                        value={form.ip}
                        onChange={(e) => setForm({ ...form, ip: e.target.value })}
                        className="input text-sm"
                        placeholder="192.168.1.100"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">端口</label>
                      <input
                        type="number"
                        value={form.port}
                        onChange={(e) => setForm({ ...form, port: Number(e.target.value) || 0 })}
                        className="input text-sm"
                        placeholder="80"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">用户名</label>
                      <input
                        value={form.username}
                        onChange={(e) => setForm({ ...form, username: e.target.value })}
                        className="input text-sm"
                        placeholder="admin"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">密码</label>
                    <input
                      type="password"
                      value={form.password}
                      onChange={(e) => setForm({ ...form, password: e.target.value })}
                      className="input text-sm"
                      placeholder="留空表示不变"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">RTSP 地址</label>
                    <input
                      value={form.rtspUrl}
                      onChange={(e) => setForm({ ...form, rtspUrl: e.target.value })}
                      className="input text-sm"
                      placeholder="rtsp://user:pass@ip:554/stream1"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">ONVIF 地址</label>
                    <input
                      value={form.onvifUrl}
                      onChange={(e) => setForm({ ...form, onvifUrl: e.target.value })}
                      className="input text-sm"
                      placeholder="http://ip:port/onvif/device_service"
                    />
                  </div>
                  <div className="flex space-x-3">
                    <button
                      onClick={() => {
                        updateMutation.mutate({
                          name: form.name ? form.name : undefined,
                          ip: form.ip,
                          port: form.port,
                          username: form.username ? form.username : null,
                          password: form.password ? form.password : undefined,
                          rtspUrl: form.rtspUrl ? form.rtspUrl : null,
                          onvifUrl: form.onvifUrl ? form.onvifUrl : null,
                        });
                      }}
                      disabled={updateMutation.isPending}
                      className="flex-1 btn-primary text-sm disabled:opacity-50"
                    >
                      保存修改
                    </button>
                    <button
                      onClick={() => {
                        if (window.confirm('确定移除当前设备配置吗？')) {
                          deleteMutation.mutate();
                        }
                      }}
                      disabled={deleteMutation.isPending}
                      className="flex-1 btn-secondary text-sm text-red-600 disabled:opacity-50"
                    >
                      移除设备
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
