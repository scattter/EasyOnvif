import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { storageApi, streamApi, cameraApi } from '../api';
import VideoPlayer from '../components/VideoPlayer';
import PTZControl from '../components/PTZControl';
import StorageStatus from '../components/StorageStatus';
import { Camera, ArrowRight } from 'lucide-react';

export default function DashboardPage() {
  const [showPTZ, setShowPTZ] = useState(true);
  const [showFps, setShowFps] = useState(true);
  
  const { data: storageData } = useQuery({
    queryKey: ['storage-status'],
    queryFn: () => storageApi.getStatus(),
    refetchInterval: 30000,
  });

  const { data: streamData } = useQuery({
    queryKey: ['stream-status', showFps],
    queryFn: () => streamApi.getStatus({ showFps }),
    refetchInterval: 5000,
  });

  const { data: cameraConfig, isLoading: cameraLoading } = useQuery({
    queryKey: ['camera-config'],
    queryFn: () => cameraApi.getConfig(),
    retry: false,
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
            onClick={() => setShowPTZ(!showPTZ)}
            className="btn-secondary text-sm"
          >
            {showPTZ ? '隐藏控制' : '显示控制'}
          </button>
          <button
            onClick={() => setShowFps(!showFps)}
            className="btn-secondary text-sm"
          >
            {showFps ? '隐藏帧率' : '显示帧率'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 视频播放器 */}
        <div className="lg:col-span-2">
          <VideoPlayer />
        </div>

        {/* PTZ 控制 */}
        {showPTZ && (
          <div className="lg:col-span-1">
            <PTZControl />
          </div>
        )}
      </div>

      {/* 状态信息 */}
      <div className={`grid grid-cols-1 ${showFps ? 'md:grid-cols-5' : 'md:grid-cols-4'} gap-4`}>
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
        {showFps && (
          <div className="card p-4">
            <div className="text-sm text-gray-500">帧率</div>
            <div className="text-lg font-semibold">
              {typeof streamData?.data.data.fps === 'number' ? `${streamData?.data.data.fps} FPS` : '-'}
            </div>
          </div>
        )}
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
    </div>
  );
}
