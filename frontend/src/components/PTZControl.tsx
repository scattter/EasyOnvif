import { useMutation } from '@tanstack/react-query';
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

  const handleMove = (direction: string) => {
    moveMutation.mutate({ direction, speed: 0.5 });
  };

  const handleMoveStop = () => {
    moveMutation.mutate({ direction: 'stop' });
  };

  const handleZoom = (direction: string) => {
    zoomMutation.mutate({ direction, speed: 0.3 });
  };

  const handleZoomStop = () => {
    zoomMutation.mutate({ direction: 'stop' });
  };

  return (
    <div className="card p-6">
      <h3 className="text-lg font-medium text-gray-900 mb-4">云台控制</h3>
      
      <div className="space-y-6">
        {/* 方向控制 */}
        <div className="flex flex-col items-center">
          <button
            onMouseDown={() => handleMove('up')}
            onMouseUp={handleMoveStop}
            onMouseLeave={handleMoveStop}
            onTouchStart={() => handleMove('up')}
            onTouchEnd={handleMoveStop}
            className="p-3 rounded-lg bg-gray-100 hover:bg-gray-200 active:bg-gray-300"
          >
            <ChevronUp className="w-6 h-6" />
          </button>
          
          <div className="flex space-x-4 my-2">
            <button
              onMouseDown={() => handleMove('left')}
              onMouseUp={handleMoveStop}
              onMouseLeave={handleMoveStop}
              onTouchStart={() => handleMove('left')}
              onTouchEnd={handleMoveStop}
              className="p-3 rounded-lg bg-gray-100 hover:bg-gray-200 active:bg-gray-300"
            >
              <ChevronLeft className="w-6 h-6" />
            </button>
            
            <div className="w-12 h-12 rounded-full bg-gray-200 flex items-center justify-center">
              <div className="w-3 h-3 rounded-full bg-gray-400" />
            </div>
            
            <button
              onMouseDown={() => handleMove('right')}
              onMouseUp={handleMoveStop}
              onMouseLeave={handleMoveStop}
              onTouchStart={() => handleMove('right')}
              onTouchEnd={handleMoveStop}
              className="p-3 rounded-lg bg-gray-100 hover:bg-gray-200 active:bg-gray-300"
            >
              <ChevronRight className="w-6 h-6" />
            </button>
          </div>
          
          <button
            onMouseDown={() => handleMove('down')}
            onMouseUp={handleMoveStop}
            onMouseLeave={handleMoveStop}
            onTouchStart={() => handleMove('down')}
            onTouchEnd={handleMoveStop}
            className="p-3 rounded-lg bg-gray-100 hover:bg-gray-200 active:bg-gray-300"
          >
            <ChevronDown className="w-6 h-6" />
          </button>
        </div>

        {/* 缩放控制 */}
        <div className="flex justify-center space-x-4">
          <button
            onMouseDown={() => handleZoom('out')}
            onMouseUp={handleZoomStop}
            onMouseLeave={handleZoomStop}
            onTouchStart={() => handleZoom('out')}
            onTouchEnd={handleZoomStop}
            className="flex items-center space-x-2 px-4 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 active:bg-gray-300"
          >
            <ZoomOut className="w-5 h-5" />
            <span>缩小</span>
          </button>
          
          <button
            onMouseDown={() => handleZoom('in')}
            onMouseUp={handleZoomStop}
            onMouseLeave={handleZoomStop}
            onTouchStart={() => handleZoom('in')}
            onTouchEnd={handleZoomStop}
            className="flex items-center space-x-2 px-4 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 active:bg-gray-300"
          >
            <ZoomIn className="w-5 h-5" />
            <span>放大</span>
          </button>
        </div>
      </div>
    </div>
  );
}
