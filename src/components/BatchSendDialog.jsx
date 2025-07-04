import React, { useState } from "react";

const BatchSendDialog = ({ visible, onConfirm, onCancel, status, onStop }) => {
  const [frequency, setFrequency] = useState(1);

  if (!visible) return null;

  const isSending = !!status;

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg p-6 min-w-[340px]">
        <h2 className="text-lg font-bold mb-4 text-gray-800 dark:text-gray-100">批量发送设置</h2>
        {!isSending && (
          <div className="mb-4">
            <label className="block mb-2 text-gray-700 dark:text-gray-300">每秒发送次数：</label>
            <input
              type="number"
              min={1}
              value={frequency}
              onChange={e => setFrequency(Math.max(1, Number(e.target.value)))}
              className="border rounded px-2 py-1 w-full bg-gray-50 dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100"
            />
          </div>
        )}
        {isSending && (
          <div className="mb-4 text-sm text-gray-700 dark:text-gray-300">
            <div>开始时间：{status.startTime || '-'}</div>
            <div>已发送：{status.sentCount || 0}</div>
            <div>当前速度：{status.speed || 0} 次/秒</div>
          </div>
        )}
        <div className="flex justify-end gap-2 mt-4">
          {!isSending && (
            <button className="px-4 py-1 rounded border" onClick={onCancel}>取消</button>
          )}
          {!isSending ? (
            <button className="bg-blue-500 text-white px-4 py-1 rounded" onClick={() => onConfirm(frequency)}>发送</button>
          ) : (
            <button className="bg-red-500 text-white px-4 py-1 rounded" onClick={onStop}>结束任务</button>
          )}
        </div>
      </div>
    </div>
  );
};

export default BatchSendDialog; 