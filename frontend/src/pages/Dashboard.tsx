import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { storageApi, streamApi, cameraApi } from '../api';
import VideoPlayer from '../components/VideoPlayer';
import PTZControl from '../components/PTZControl';
import StorageStatus from '../components/StorageStatus';
import { Camera, ArrowRight, Activity, Move } from 'lucide-react';
import toast from 'react-hot-toast';

export default function DashboardPage() {
  const [showControls, setShowControls] = useState(true);
  const [activeTab, setActiveTab] = useState<'ptz' | 'motion'>('ptz');
  const [showStatus, setShowStatus] = useState(false);
  const queryClient = useQueryClient();
  
  const [motionEnabled, setMotionEnabled] = useState(false);
  const [motionSensitivity, setMotionSensitivity] = useState(50);
  
  const { data: storageData } = useQuery({
    queryKey: ['storage-status'],
    queryFn: () => storageApi.getStatus(),
    refetchInterval: 30000,
  });

  const { data: streamData } = useQuery({
    queryKey: ['stream-status'],
    queryFn: () => streamApi.getStatus({ showFps: true }),
    enabled: showStatus,
    refetchInterval: 5000,
  });

  const { data: cameraConfig, isLoading: cameraLoading } = useQuery({
    queryKey: ['camera-config'],
    queryFn: () => cameraApi.getConfig(),
    retry: false,
  });

  useEffect(() => {
    if (cameraConfig?.data?.data?.motionConfig) {
      setMotionEnabled(cameraConfig.data.data.motionConfig.enabled);
      setMotionSensitivity(cameraConfig.data.data.motionConfig.sensitivity);
    }
  }, [cameraConfig]);

  const updateMotionMutation = useMutation({
    mutationFn: () => cameraApi.updateConfig({
      ...cameraConfig?.data.data,
      motionConfig: {
        enabled: motionEnabled,
        sensitivity: motionSensitivity,
        regions: cameraConfig?.data.data.motionConfig?.regions || []
      }
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['camera-config'] });
      toast.success('移动检测配置已保存');
    },
    onError: () => {
      toast.error('保存失败');
    }
  });

  // 如果没有配置摄像头，显示引导页面
  if (!cameraLoading && (!cameraConfig?.data.data || cameraConfig.data.error)) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <Camera className="w-16 h-16 mx-auto text-gray-300 mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 mb-2">未配置摄像头</h2>
          <p className="text-gray-500 mb-6">请先配置摄像头才能查看实时监控</p>
          <Link
            to="/camera-setup"
            className="btn-primary inline-flex items-center"
          >
            配置摄像头
            <ArrowRight className="w-4 h-4 ml-2" />
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">实时监控</h1>
        <div className="flex items-center space-x-4">
          <StorageStatus data={storageData?.data.data} />
          <button
            onClick={() => setShowControls(!showControls)}
            className="btn-secondary text-sm"
          >
            {showControls ? '隐藏控制' : '显示控制'}
          </button>
          <button
            onClick={() => setShowStatus(!showStatus)}
            className="btn-secondary text-sm"
          >
            {showStatus ? '隐藏信息' : '显示信息'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 视频播放器 */}
        <div className="lg:col-span-2">
          <VideoPlayer />
        </div>

        {/* 控制面板 */}
        {showControls && (
          <div className="lg:col-span-1 bg-white shadow rounded-lg border border-gray-100 overflow-hidden">
            {/* Tabs */}
            <div className="flex border-b">
              <button
                className={`flex-1 py-3 text-sm font-medium flex items-center justify-center ${
                  activeTab === 'ptz'
                    ? 'text-primary-600 border-b-2 border-primary-600 bg-primary-50'
                    : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                }`}
                onClick={() => setActiveTab('ptz')}
              >
                <Move className="w-4 h-4 mr-2" />
                云台控制
              </button>
              <button
                className={`flex-1 py-3 text-sm font-medium flex items-center justify-center ${
                  activeTab === 'motion'
                    ? 'text-primary-600 border-b-2 border-primary-600 bg-primary-50'
                    : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                }`}
                onClick={() => setActiveTab('motion')}
              >
                <Activity className="w-4 h-4 mr-2" />
                移动检测
              </button>
            </div>

            <div className="p-4">
              {activeTab === 'ptz' ? (
                <PTZControl />
              ) : (
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-medium text-gray-900">检测开关</h3>
                      <p className="text-xs text-gray-500">开启后将检测画面变化并录像</p>
                    </div>
                    <button
                      onClick={() => setMotionEnabled(!motionEnabled)}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                        motionEnabled ? 'bg-primary-600' : 'bg-gray-200'
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          motionEnabled ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </div>

                  <div className={motionEnabled ? 'opacity-100 transition-opacity' : 'opacity-50 pointer-events-none transition-opacity'}>
                    <div className="flex justify-between items-center mb-2">
                      <label className="text-sm font-medium text-gray-700">灵敏度</label>
                      <span className="text-sm font-bold text-primary-600">{motionSensitivity}</span>
                    </div>
                    <input
                      type="range"
                      min="1"
                      max="100"
                      value={motionSensitivity}
                      onChange={(e) => setMotionSensitivity(parseInt(e.target.value))}
                      className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                    />
                    <div className="flex justify-between text-xs text-gray-400 mt-1">
                      <span>低 (难触发)</span>
                      <span>高 (易触发)</span>
                    </div>
                  </div>

                  <div className="pt-4 border-t">
                    <button
                      onClick={() => updateMotionMutation.mutate()}
                      disabled={updateMotionMutation.isPending}
                      className="w-full btn-primary flex justify-center items-center"
                    >
                      {updateMotionMutation.isPending ? '保存中...' : '保存设置'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* 状态信息 */}
      {showStatus && (
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <div className="card p-4">
          <div className="text-sm text-gray-500">连接状态</div>
          <div className="text-lg font-semibold text-green-600">
            {streamData?.data.data.isStreaming ? '在线' : '离线'}
          </div>
        </div>
        <div className="card p-4">
          <div className="text-sm text-gray-500">分辨率</div>
          <div className="text-lg font-semibold">{streamData?.data.data.resolution || '-'}</div>
        </div>
        <div className="card p-4">
          <div className="text-sm text-gray-500">帧率</div>
          <div className="text-lg font-semibold">
            {typeof streamData?.data.data.fps === 'number' ? `${streamData?.data.data.fps} FPS` : '-'}
          </div>
        </div>
        <div className="card p-4">
          <div className="text-sm text-gray-500">码率</div>
          <div className="text-lg font-semibold">{streamData?.data.data.bitrate || '-'}</div>
        </div>
        <div className="card p-4">
          <div className="text-sm text-gray-500">放大比例</div>
          <div className="text-lg font-semibold">
            {typeof streamData?.data.data.zoomRatio === 'number' ? `${streamData?.data.data.zoomRatio.toFixed(2)}x` : '-'}
          </div>
        </div>
      </div>
      )}
    </div>
  );
}
