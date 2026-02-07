import { useMutation } from '@tanstack/react-query';
import { useCallback } from 'react';
import { ptzApi } from '../api';
import { ChevronUp, ChevronDown, ChevronLeft, ChevronRight, ZoomIn, ZoomOut } from 'lucide-react';

export default function PTZControl() {
  const moveMutation = useMutation({
    mutationFn: ({ direction, speed }: { direction: string; speed?: number }) =>
      ptzApi.move(direction as any, speed),
  });

  const zoomMutation = useMutation({
    mutationFn: ({ direction, speed }: { direction: string; speed?: number }) =>
      ptzApi.zoom(direction as any, speed),
  });

  // 触发一次移动
  const handleMove = useCallback((direction: string) => {
    moveMutation.mutate({ direction, speed: 0.5 });
  }, [moveMutation]);

  // 触发一次缩放
  const handleZoom = useCallback((direction: string) => {
    zoomMutation.mutate({ direction, speed: 0.3 });
  }, [zoomMutation]);

  // 处理鼠标/触摸事件
  const handleInteraction = (direction: string, type: 'move' | 'zoom') => (e: React.MouseEvent) => {
    e.preventDefault();
    if (type === 'move') {
      handleMove(direction);
    } else {
      handleZoom(direction);
    }
  };

  return (
    <div className="card p-6">
      <h3 className="text-lg font-medium text-gray-900 mb-4">云台控制</h3>
      
      <div className="space-y-6">
        {/* 方向控制 */}
        <div className="flex flex-col items-center select-none">
          <button
            onClick={handleInteraction('up', 'move')}
            className="p-3 rounded-lg bg-gray-100 hover:bg-gray-200 active:bg-gray-300 touch-none"
          >
            <ChevronUp className="w-6 h-6" />
          </button>
          
          <div className="flex space-x-4 my-2">
            <button
              onClick={handleInteraction('left', 'move')}
              className="p-3 rounded-lg bg-gray-100 hover:bg-gray-200 active:bg-gray-300 touch-none"
            >
              <ChevronLeft className="w-6 h-6" />
            </button>
            
            <div className="w-12 h-12 rounded-full bg-gray-200 flex items-center justify-center">
              <div className="w-3 h-3 rounded-full bg-gray-400" />
            </div>
            
            <button
              onClick={handleInteraction('right', 'move')}
              className="p-3 rounded-lg bg-gray-100 hover:bg-gray-200 active:bg-gray-300 touch-none"
            >
              <ChevronRight className="w-6 h-6" />
            </button>
          </div>
          
          <button
            onClick={handleInteraction('down', 'move')}
            className="p-3 rounded-lg bg-gray-100 hover:bg-gray-200 active:bg-gray-300 touch-none"
          >
            <ChevronDown className="w-6 h-6" />
          </button>
        </div>

        {/* 缩放控制 */}
        <div className="flex justify-center space-x-4">
          <button
            onClick={handleInteraction('out', 'zoom')}
            className="flex items-center space-x-2 px-4 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 active:bg-gray-300 touch-none"
          >
            <ZoomOut className="w-5 h-5" />
            <span>缩小</span>
          </button>
          
          <button
            onClick={handleInteraction('in', 'zoom')}
            className="flex items-center space-x-2 px-4 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 active:bg-gray-300 touch-none"
          >
            <ZoomIn className="w-5 h-5" />
            <span>放大</span>
          </button>
        </div>

        {/* 状态提示 */}
        {(moveMutation.isPending || zoomMutation.isPending) && (
          <div className="text-center text-sm text-gray-500">
            正在控制...
          </div>
        )}
        {(moveMutation.isError || zoomMutation.isError) && (
          <div className="text-center text-sm text-red-500">
            控制失败，请重试
          </div>
        )}
      </div>
    </div>
  );
}
