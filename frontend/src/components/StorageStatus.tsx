import type { StorageStatus } from '../types';

interface Props {
  data?: StorageStatus;
}

export default function StorageStatusComponent({ data }: Props) {
  if (!data) return null;

  const usageColor = data.usagePercent > 90 ? 'text-red-600' : 
                    data.usagePercent > 70 ? 'text-yellow-600' : 
                    'text-green-600';

  return (
    <div className="text-sm">
      <div className="flex items-center space-x-2">
        <span className="text-gray-500">存储:</span>
        <span className={usageColor}>
          {data.usagePercent.toFixed(1)}%
        </span>
        <span className="text-gray-400">
          ({data.usedGB.toFixed(1)} / {data.quotaGB} GB)
        </span>
      </div>
    </div>
  );
}
