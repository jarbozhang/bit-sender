import React, { useState, useEffect, useRef } from "react";

const BatchSendDialog = ({ visible, onConfirm, onCancel, status, onStop, packetData, interfaceName }) => {
  const [frequency, setFrequency] = useState(1);
  const [stopCondition, setStopCondition] = useState('manual'); // 'manual', 'duration', 'count'
  const [stopValue, setStopValue] = useState(10);
  const [taskId, setTaskId] = useState(null);
  const [taskStatus, setTaskStatus] = useState(null);
  const [isCompleted, setIsCompleted] = useState(false);
  const [completedStats, setCompletedStats] = useState(null);
  const timerRef = useRef(null);

  useEffect(() => {
    if (!visible) {
      setTaskId(null);
      setTaskStatus(null);
      setIsCompleted(false);
      setCompletedStats(null);
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
        frequency,
        stopCondition,
        stopValue
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
        // 任务已完成，保存统计信息
        if (s && !isCompleted) {
          const endTime = Date.now();
          const startTime = s.start_time * 1000;
          const duration = Math.round((endTime - startTime) / 1000);
          setCompletedStats({
            totalSent: s.sent_count,
            targetSpeed: s.speed,
            actualSpeed: duration > 0 ? Math.round(s.sent_count / duration) : 0,
            duration: duration,
            startTime: new Date(startTime).toLocaleTimeString(),
            endTime: new Date(endTime).toLocaleTimeString()
          });
          setIsCompleted(true);
        }
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
      
      // 保存手动停止时的统计信息
      if (taskStatus && !isCompleted) {
        const endTime = Date.now();
        const startTime = taskStatus.start_time * 1000;
        const duration = Math.round((endTime - startTime) / 1000);
        setCompletedStats({
          totalSent: taskStatus.sent_count,
          targetSpeed: taskStatus.speed,
          actualSpeed: duration > 0 ? Math.round(taskStatus.sent_count / duration) : 0,
          duration: duration,
          startTime: new Date(startTime).toLocaleTimeString(),
          endTime: new Date(endTime).toLocaleTimeString(),
          stoppedManually: true
        });
        setIsCompleted(true);
      }
      
      clearInterval(timerRef.current);
      setTaskStatus(null);
      setTaskId(null);
      // 不立即调用 onStop，让用户查看统计信息
      // if (onStop) onStop();
    } catch (e) {
      alert('结束任务失败：' + e.message);
    }
  };

  if (!visible) return null;

  const isSending = !!taskId && !!taskStatus && taskStatus.running;

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg p-6 min-w-[400px] max-w-[500px]">
        <h2 className="text-lg font-bold mb-4 text-gray-800 dark:text-gray-100">
          {isCompleted ? '批量发送完成' : '批量发送设置'}
        </h2>
        
        {/* 设置界面 */}
        {!isSending && !isCompleted && (
          <div className="mb-4 space-y-4">
            <div>
              <label className="block mb-2 text-gray-700 dark:text-gray-300">每秒发送次数：</label>
              <input
                type="number"
                min={1}
                value={frequency}
                onChange={e => setFrequency(Math.max(1, Number(e.target.value)))}
                className="border rounded px-2 py-1 w-full bg-gray-50 dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100"
              />
            </div>
            
            <div>
              <label className="block mb-2 text-gray-700 dark:text-gray-300">终止条件：</label>
              <select
                value={stopCondition}
                onChange={e => setStopCondition(e.target.value)}
                className="border rounded px-2 py-1 w-full bg-gray-50 dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100"
              >
                <option value="manual">手动停止</option>
                <option value="duration">发送指定时长</option>
                <option value="count">发送指定数量</option>
              </select>
            </div>
            
            {stopCondition !== 'manual' && (
              <div>
                <label className="block mb-2 text-gray-700 dark:text-gray-300">
                  {stopCondition === 'duration' ? '发送时长（秒）：' : '发送数量（个）：'}
                </label>
                <input
                  type="number"
                  min={1}
                  value={stopValue}
                  onChange={e => setStopValue(Math.max(1, Number(e.target.value)))}
                  className="border rounded px-2 py-1 w-full bg-gray-50 dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100"
                  placeholder={stopCondition === 'duration' ? '例如：30' : '例如：1000'}
                />
              </div>
            )}
          </div>
        )}
        
        {/* 发送中状态 */}
        {isSending && taskStatus && (
          <div className="mb-4 text-sm text-gray-700 dark:text-gray-300 space-y-2">
            <div className="flex justify-between">
              <span>开始时间：</span>
              <span>{new Date(taskStatus.start_time * 1000).toLocaleTimeString()}</span>
            </div>
            <div className="flex justify-between">
              <span>已发送：</span>
              <span className="font-mono text-blue-600 dark:text-blue-400">{taskStatus.sent_count.toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span>目标速度：</span>
              <span>{taskStatus.speed} 次/秒</span>
            </div>
            
            {/* 进度条和剩余信息 */}
            {stopCondition !== 'manual' && (
              <>
                <div className="flex justify-between">
                  <span>{stopCondition === 'duration' ? '已运行：' : '进度：'}</span>
                  <span>
                    {stopCondition === 'duration' 
                      ? `${Math.floor((Date.now() - taskStatus.start_time * 1000) / 1000)}s / ${stopValue}s`
                      : `${taskStatus.sent_count.toLocaleString()} / ${stopValue.toLocaleString()}`
                    }
                  </span>
                </div>
                
                {/* 进度条 */}
                <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                  <div 
                    className="bg-blue-500 h-2 rounded-full transition-all duration-500"
                    style={{
                      width: `${Math.min(100, stopCondition === 'duration' 
                        ? ((Date.now() - taskStatus.start_time * 1000) / 1000 / stopValue) * 100
                        : (taskStatus.sent_count / stopValue) * 100
                      )}%`
                    }}
                  ></div>
                </div>
                
                <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400">
                  <span>
                    {stopCondition === 'duration' 
                      ? `剩余时间: ${Math.max(0, stopValue - Math.floor((Date.now() - taskStatus.start_time * 1000) / 1000))}秒`
                      : `剩余: ${Math.max(0, stopValue - taskStatus.sent_count).toLocaleString()}个`
                    }
                  </span>
                  <span>
                    {Math.min(100, stopCondition === 'duration' 
                      ? ((Date.now() - taskStatus.start_time * 1000) / 1000 / stopValue) * 100
                      : (taskStatus.sent_count / stopValue) * 100
                    ).toFixed(1)}%
                  </span>
                </div>
              </>
            )}
            
            <div className="mt-2 text-green-600 dark:text-green-400 text-center">
              ⚡ 正在发送中...
            </div>
          </div>
        )}
        
        {/* 完成统计 */}
        {isCompleted && completedStats && (
          <div className="mb-4">
            <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700 rounded-lg p-4 mb-4">
              <div className="text-center mb-3">
                <div className="text-2xl text-green-600 dark:text-green-400">✅</div>
                <div className="text-green-800 dark:text-green-300 font-medium">
                  {completedStats.stoppedManually 
                    ? '任务已手动停止' 
                    : stopCondition === 'duration' 
                      ? `已按时长完成 (${stopValue}秒)`
                      : stopCondition === 'count'
                        ? `已按数量完成 (${stopValue.toLocaleString()}个)`
                        : '任务执行完成'
                  }
                </div>
              </div>
              
              <div className="text-sm text-gray-700 dark:text-gray-300 space-y-2">
                <div className="flex justify-between">
                  <span>总发送数量：</span>
                  <span className="font-mono font-bold text-blue-600 dark:text-blue-400">
                    {completedStats.totalSent.toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>目标速度：</span>
                  <span>{completedStats.targetSpeed} 次/秒</span>
                </div>
                <div className="flex justify-between">
                  <span>实际速度：</span>
                  <span className="font-mono text-green-600 dark:text-green-400">
                    {completedStats.actualSpeed} 次/秒
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>执行时长：</span>
                  <span>{completedStats.duration} 秒</span>
                </div>
                <hr className="border-gray-300 dark:border-gray-600 my-2" />
                <div className="flex justify-between">
                  <span>开始时间：</span>
                  <span>{completedStats.startTime}</span>
                </div>
                <div className="flex justify-between">
                  <span>结束时间：</span>
                  <span>{completedStats.endTime}</span>
                </div>
              </div>
            </div>
          </div>
        )}
        
        {/* 按钮区域 */}
        <div className="flex justify-end gap-2 mt-4">
          {!isSending && !isCompleted && (
            <>
              <button className="px-4 py-1 rounded border hover:bg-gray-50 dark:hover:bg-gray-700" onClick={onCancel}>
                取消
              </button>
              <button className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-1 rounded" onClick={handleSend}>
                开始发送
              </button>
            </>
          )}
          {isSending && (
            <button className="bg-red-500 hover:bg-red-600 text-white px-4 py-1 rounded" onClick={handleStop}>
              停止任务
            </button>
          )}
          {isCompleted && (
            <button 
              className="bg-gray-500 hover:bg-gray-600 text-white px-4 py-1 rounded" 
              onClick={() => {
                if (onStop) onStop();
                onCancel();
              }}
            >
              关闭
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default BatchSendDialog; 