import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { streamApi } from '../api';
import toast from 'react-hot-toast';

export default function VideoPlayer() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isError, setIsError] = useState(false);
  
  const { data: streamData } = useQuery({
    queryKey: ['webrtc-url'],
    queryFn: () => streamApi.getWebRTCUrl(),
  });

  useEffect(() => {
    if (!streamData?.data.data.whepUrl || !videoRef.current) return;

    const whepUrl = streamData.data.data.whepUrl;
    const video = videoRef.current;

    // 简单的 WHEP 客户端实现
    let pc: RTCPeerConnection | null = null;

    const startWebRTC = async () => {
      try {
        setIsLoading(true);
        setIsError(false);

        pc = new RTCPeerConnection({
          iceServers: streamData.data.data.iceServers,
        });

        pc.addTransceiver('video', { direction: 'recvonly' });
        pc.addTransceiver('audio', { direction: 'recvonly' });

        pc.ontrack = (event) => {
          if (video.srcObject !== event.streams[0]) {
            video.srcObject = event.streams[0];
          }
        };

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        // 等待 ICE 收集完成
        await new Promise<void>((resolve) => {
          if (pc!.iceGatheringState === 'complete') {
            resolve();
          } else {
            pc!.onicegatheringstatechange = () => {
              if (pc!.iceGatheringState === 'complete') {
                resolve();
              }
            };
          }
        });

        // 发送 WHEP 请求
        const response = await fetch(whepUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/sdp',
          },
          body: pc.localDescription?.sdp,
        });

        if (!response.ok) {
          throw new Error('WHEP 连接失败');
        }

        const answer = await response.text();
        await pc.setRemoteDescription({ type: 'answer', sdp: answer });

        setIsLoading(false);
      } catch (error) {
        console.error('WebRTC 错误:', error);
        setIsError(true);
        setIsLoading(false);
        toast.error('视频流连接失败');
      }
    };

    startWebRTC();

    return () => {
      if (pc) {
        pc.close();
      }
    };
  }, [streamData]);

  return (
    <div className="card overflow-hidden">
      <div className="relative aspect-video bg-black">
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-900">
            <div className="text-white">加载中...</div>
          </div>
        )}
        {isError && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-900">
            <div className="text-white text-center">
              <div className="text-red-500 mb-2">连接失败</div>
              <div className="text-sm text-gray-400">请检查摄像头配置</div>
            </div>
          </div>
        )}
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="w-full h-full object-contain"
        />
      </div>
    </div>
  );
}
