import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { storageApi, streamApi } from '../api';
import VideoPlayer from '../components/VideoPlayer';
import PTZControl from '../components/PTZControl';
import StorageStatus from '../components/StorageStatus';

export default function DashboardPage() {
  const [showPTZ, setShowPTZ] = useState(true);
  
  const { data: storageData } = useQuery({
    queryKey: ['storage-status'],
    queryFn: () => storageApi.getStatus(),
    refetchInterval: 30000,
  });

  const { data: streamData } = useQuery({
    queryKey: ['stream-status'],
    queryFn: () => streamApi.getStatus(),
    refetchInterval: 5000,
  });

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
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
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
          <div className="text-lg font-semibold">{streamData?.data.data.fps || '-'} FPS</div>
        </div>
        <div className="card p-4">
          <div className="text-sm text-gray-500">码率</div>
          <div className="text-lg font-semibold">{streamData?.data.data.bitrate || '-'}</div>
        </div>
      </div>
    </div>
  );
}
