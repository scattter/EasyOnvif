import { useQuery } from '@tanstack/react-query';
import { useState, useEffect, useRef } from 'react';
import { streamApi } from '../api';
import toast from 'react-hot-toast';

export default function VideoPlayer() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const playerRef = useRef<any>(null);
  const [isError, setIsError] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const { data: streamData, isLoading: isApiLoading, error: apiError } = useQuery({
    queryKey: ['ws-url'],
    queryFn: () => streamApi.getWsUrl(),
    retry: 1,
  });

  useEffect(() => {
    if (apiError) {
      console.error('API Error:', apiError);
      setIsError(true);
      setErrorMessage('无法获取视频流地址');
      toast.error('视频流加载失败');
    }
  }, [apiError]);

  useEffect(() => {
    if (streamData?.data?.data?.wsUrl && canvasRef.current) {
      const url = streamData.data.data.wsUrl;
      console.log('Connecting to stream:', url);

      if (playerRef.current) {
        playerRef.current.destroy();
      }

      try {
        // JSMpeg player initialization
        // @ts-ignore
        playerRef.current = new window.JSMpeg.Player(url, {
          canvas: canvasRef.current,
          autoplay: true,
          audio: false, // Disable audio for now to avoid issues
          loop: true,
          videoBufferSize: 1024 * 1024, // 1MB buffer
          disableWebAssembly: true,
          disableGl: true,
        });
      } catch (e) {
        console.error('JSMpeg initialization error:', e);
        setIsError(true);
        setErrorMessage('播放器初始化失败');
      }
    }

    return () => {
      if (playerRef.current) {
        try {
            playerRef.current.destroy();
        } catch (e) {
            // Ignore destroy errors
        }
      }
    };
  }, [streamData]);

  return (
    <div className="card overflow-hidden">
      <div className="relative aspect-video bg-black">
        {isApiLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-900">
            <div className="text-white flex flex-col items-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white mb-2"></div>
              <div>正在连接摄像头...</div>
            </div>
          </div>
        )}
        
        {isError && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-900">
            <div className="text-white text-center px-4 max-w-md">
              <div className="text-red-500 mb-2 text-lg">连接失败</div>
              <div className="text-sm text-gray-400 whitespace-pre-line mb-4">
                {errorMessage}
              </div>
            </div>
          </div>
        )}
        
        <canvas
          ref={canvasRef}
          className="w-full h-full object-contain"
        />
      </div>
    </div>
  );
}
