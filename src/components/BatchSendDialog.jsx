import React, { useState, useEffect, useRef } from "react";

const BatchSendDialog = ({ visible, onConfirm, onCancel, status, onStop, packetData, interfaceName }) => {
  const [frequency, setFrequency] = useState(1);
  const [taskId, setTaskId] = useState(null);
  const [taskStatus, setTaskStatus] = useState(null);
  const timerRef = useRef(null);

  useEffect(() => {
    if (!visible) {
      setTaskId(null);
      setTaskStatus(null);
      clearInterval(timerRef.current);
    }
  }, [visible]);

  // 启动批量任务
  const handleSend = async () => {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const id = await invoke('start_batch_send', {
        packetData,
        interfaceName,
        frequency
      });
      setTaskId(id);
      // 立即查一次
      fetchStatus(id);
      // 定时刷新
      timerRef.current = setInterval(() => fetchStatus(id), 1000);
    } catch (e) {
      alert('批量发送任务启动失败：' + e.message);
    }
  };

  // 查询任务状态
  const fetchStatus = async (id) => {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const s = await invoke('get_batch_send_status', { taskId: id });
      setTaskStatus(s);
      if (!s || !s.running) {
        clearInterval(timerRef.current);
      }
    } catch (e) {
      clearInterval(timerRef.current);
    }
  };

  // 结束任务
  const handleStop = async () => {
    if (!taskId) return;
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('stop_batch_send', { taskId });
      clearInterval(timerRef.current);
      setTaskStatus(null);
      setTaskId(null);
      if (onStop) onStop();
    } catch (e) {
      alert('结束任务失败：' + e.message);
    }
  };

  if (!visible) return null;

  const isSending = !!taskId && !!taskStatus && taskStatus.running;

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
        {isSending && taskStatus && (
          <div className="mb-4 text-sm text-gray-700 dark:text-gray-300">
            <div>开始时间：{new Date(taskStatus.start_time * 1000).toLocaleTimeString() || '-'}</div>
            <div>已发送：{taskStatus.sent_count || 0}</div>
            <div>当前速度：{taskStatus.speed || 0} 次/秒</div>
          </div>
        )}
        <div className="flex justify-end gap-2 mt-4">
          {!isSending && (
            <button className="px-4 py-1 rounded border" onClick={onCancel}>取消</button>
          )}
          {!isSending ? (
            <button className="bg-blue-500 text-white px-4 py-1 rounded" onClick={handleSend}>发送</button>
          ) : (
            <button className="bg-red-500 text-white px-4 py-1 rounded" onClick={handleStop}>结束任务</button>
          )}
        </div>
      </div>
    </div>
  );
};

export default BatchSendDialog; 