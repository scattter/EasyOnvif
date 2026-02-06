import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { recordingApi } from '../api';
import { Video, Trash2, FileVideo } from 'lucide-react';
import { useState } from 'react';

export default function RecordingsPage() {
  const [page, setPage] = useState(1);
  const limit = 20;

  const { data, isLoading } = useQuery({
    queryKey: ['recordings', page],
    queryFn: () => recordingApi.getList(page, limit),
  });

  const recordings = data?.data.data.items || [];
  const pagination = data?.data.data.pagination;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">录像回放</h1>
      </div>

      {isLoading ? (
        <div className="text-center py-12">
          <div className="text-gray-500">加载中...</div>
        </div>
      ) : recordings.length === 0 ? (
        <div className="card p-12 text-center">
          <FileVideo className="w-16 h-16 mx-auto text-gray-300 mb-4" />
          <div className="text-gray-500">暂无录像记录</div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {recordings.map((recording) => (
              <div key={recording.id} className="card overflow-hidden">
                <div className="aspect-video bg-gray-100 flex items-center justify-center">
                  {recording.thumbnailUrl ? (
                    <img
                      src={recording.thumbnailUrl}
                      alt="缩略图"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <Video className="w-12 h-12 text-gray-400" />
                  )}
                </div>
                <div className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-gray-900">
                      {recording.eventType === 'motion' ? '移动检测' : recording.eventType}
                    </span>
                    <span className="text-xs text-gray-500">
                      {recording.duration}s
                    </span>
                  </div>
                  <div className="text-sm text-gray-500 mb-4">
                    {format(new Date(recording.startTime), 'yyyy-MM-dd HH:mm:ss', { locale: zhCN })}
                  </div>
                  <div className="flex space-x-2">
                    <a
                      href={recording.videoUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 btn-primary text-center text-sm py-1.5"
                    >
                      播放
                    </a>
                    <button
                      className="p-1.5 rounded-md text-red-600 hover:bg-red-50"
                      title="删除"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* 分页 */}
          {pagination && pagination.totalPages > 1 && (
            <div className="flex items-center justify-center space-x-2 mt-8">
              <button
                onClick={() => setPage(p => p - 1)}
                disabled={!pagination.hasPrev}
                className="btn-secondary disabled:opacity-50"
              >
                上一页
              </button>
              <span className="text-sm text-gray-600">
                第 {pagination.page} / {pagination.totalPages} 页
              </span>
              <button
                onClick={() => setPage(p => p + 1)}
                disabled={!pagination.hasNext}
                className="btn-secondary disabled:opacity-50"
              >
                下一页
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
