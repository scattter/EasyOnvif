import { useQuery, useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { storageApi, authApi } from '../api';
import toast from 'react-hot-toast';

export default function SettingsPage() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const { data: storageConfig } = useQuery({
    queryKey: ['storage-config'],
    queryFn: () => storageApi.getConfig(),
  });

  const changePasswordMutation = useMutation({
    mutationFn: () => authApi.changePassword(currentPassword, newPassword),
    onSuccess: () => {
      toast.success('密码修改成功');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    },
    onError: () => {
      toast.error('密码修改失败');
    },
  });

  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      toast.error('两次输入的新密码不一致');
      return;
    }
    if (newPassword.length < 6) {
      toast.error('新密码至少需要6个字符');
      return;
    }
    changePasswordMutation.mutate();
  };

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold text-gray-900">系统设置</h1>

      {/* 存储配置 */}
      <div className="card p-6">
        <h2 className="text-lg font-medium text-gray-900 mb-4">存储配置</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              存储配额 (GB)
            </label>
            <input
              type="number"
              value={storageConfig?.data.data.quotaGB || 50}
              readOnly
              className="input bg-gray-50"
            />
            <p className="mt-1 text-sm text-gray-500">
              最大存储空间，超出后自动删除旧录像
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              预录时长 (秒)
            </label>
            <input
              type="number"
              value={storageConfig?.data.data.prebufferSeconds || 10}
              readOnly
              className="input bg-gray-50"
            />
            <p className="mt-1 text-sm text-gray-500">
              事件触发前保存的视频时长
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              后录时长 (秒)
            </label>
            <input
              type="number"
              value={storageConfig?.data.data.postbufferSeconds || 60}
              readOnly
              className="input bg-gray-50"
            />
            <p className="mt-1 text-sm text-gray-500">
              事件触发后保存的视频时长
            </p>
          </div>
        </div>
      </div>

      {/* 修改密码 */}
      <div className="card p-6">
        <h2 className="text-lg font-medium text-gray-900 mb-4">修改密码</h2>
        <form onSubmit={handlePasswordSubmit} className="max-w-md space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              当前密码
            </label>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="input"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              新密码
            </label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="input"
              required
              minLength={6}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              确认新密码
            </label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="input"
              required
            />
          </div>
          <button
            type="submit"
            disabled={changePasswordMutation.isPending}
            className="btn-primary w-full disabled:opacity-50"
          >
            {changePasswordMutation.isPending ? '修改中...' : '修改密码'}
          </button>
        </form>
      </div>

      {/* 系统信息 */}
      <div className="card p-6">
        <h2 className="text-lg font-medium text-gray-900 mb-4">系统信息</h2>
        <div className="space-y-2 text-sm text-gray-600">
          <p>版本: 1.0.0</p>
          <p>ONVIF 协议支持: Profile S, T</p>
          <p>视频编码: H.264/H.265</p>
          <p>流协议: RTSP, WebRTC</p>
        </div>
      </div>
    </div>
  );
}
