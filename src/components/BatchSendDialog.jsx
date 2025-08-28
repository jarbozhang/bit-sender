import React, { useState, useEffect, useRef } from "react";
import { useBatchTask } from "../contexts/BatchTaskContext";
import { useLanguage } from "../hooks/useLanguage";
import { useTranslation } from "../locales";
import CustomSelect from "./CustomSelect";

const BatchSendDialog = ({ visible, onConfirm, onCancel, status, onStop, packetData, interfaceName }) => {
  const [frequency, setFrequency] = useState(1);
  const [stopCondition, setStopCondition] = useState('manual'); // 'manual', 'duration', 'count'
  const [stopValue, setStopValue] = useState(10);
  const [isolateInterface, setIsolateInterface] = useState(false);
  const [hasAdminPrivileges, setHasAdminPrivileges] = useState(false);
  const [checkingPrivileges, setCheckingPrivileges] = useState(false);
  const [taskId, setTaskId] = useState(null);
  const [taskStatus, setTaskStatus] = useState(null);
  const [isCompleted, setIsCompleted] = useState(false);
  const [completedStats, setCompletedStats] = useState(null);
  const [platform, setPlatform] = useState(null);
  const timerRef = useRef(null);
  const { addTask, removeTask } = useBatchTask();
  const { language } = useLanguage();
  const { t } = useTranslation(language);

  useEffect(() => {
    if (!visible) {
      // 清理任务ID，避免内存泄漏
      if (taskId) {
        removeTask(taskId);
      }
      setTaskId(null);
      setTaskStatus(null);
      setIsCompleted(false);
      setCompletedStats(null);
      setIsolateInterface(false);
      clearInterval(timerRef.current);
    }
  }, [visible, taskId, removeTask]);

  // 检查管理员权限和平台信息
  useEffect(() => {
    const checkPrivileges = async () => {
      if (!visible) return;
      
      setCheckingPrivileges(true);
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        
        // 检查管理员权限
        const isAdmin = await invoke('check_admin_privileges');
        setHasAdminPrivileges(isAdmin);
        
        // 通过 Tauri 获取平台信息（备用方案：检测 userAgent）
        try {
          // 尝试通过 navigator 检测平台
          const userAgent = navigator.userAgent;
          if (userAgent.includes('Mac')) {
            setPlatform('macos');
          } else if (userAgent.includes('Win')) {
            setPlatform('windows');
          } else if (userAgent.includes('Linux')) {
            setPlatform('linux');
          } else {
            setPlatform('unknown');
          }
        } catch (platformError) {
          console.warn('平台检测失败:', platformError);
          setPlatform('unknown');
        }
        
      } catch (e) {
        console.warn('检查权限失败:', e);
        setHasAdminPrivileges(false);
        setPlatform('unknown');
      }
      setCheckingPrivileges(false);
    };

    if (visible) {
      checkPrivileges();
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
        stopValue,
        isolateInterface
      });
      setTaskId(id);
      // 添加到任务管理器
      addTask(id, interfaceName, isolateInterface);
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
            startTime: new Date(startTime).toLocaleTimeString('zh-CN', { hour12: false }),
            endTime: new Date(endTime).toLocaleTimeString('zh-CN', { hour12: false })
          });
          setIsCompleted(true);
        }
        // 从任务管理器中移除已完成的任务
        removeTask(id);
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
          startTime: new Date(startTime).toLocaleTimeString('zh-CN', { hour12: false }),
          endTime: new Date(endTime).toLocaleTimeString('zh-CN', { hour12: false }),
          stoppedManually: true
        });
        setIsCompleted(true);
      }
      
      clearInterval(timerRef.current);
      setTaskStatus(null);
      // 从任务管理器中移除手动停止的任务
      removeTask(taskId);
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
          {isCompleted ? t('batchSend.completed') : t('batchSend.title')}
        </h2>
        
        {/* 设置界面 */}
        {!isSending && !isCompleted && (
          <div className="mb-4 space-y-4">
            <div>
              <label className="block mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">{t('batchSend.frequency')}：</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  max={1000000}
                  value={frequency}
                  onChange={e => setFrequency(Math.max(1, Math.min(1000000, Number(e.target.value))))}
                  className="flex-1 border rounded-md px-3 py-2 text-sm bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
                <span className="text-sm text-gray-500 dark:text-gray-400 whitespace-nowrap">{t('batchSend.frequencyUnit')}</span>
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                {t('batchSend.frequencyHint')}
              </div>
            </div>
            
            <div>
              <label className="block mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">{t('batchSend.stopCondition')}：</label>
              <CustomSelect
                value={stopCondition}
                onChange={e => setStopCondition(e.target.value)}
                options={[
                  { value: 'manual', label: t('batchSend.manual') },
                  { value: 'duration', label: t('batchSend.duration') },
                  { value: 'count', label: t('batchSend.count') }
                ]}
                placeholder={t('batchSend.selectStopCondition')}
              />
            </div>
            
            {stopCondition !== 'manual' && (
              <div>
                <label className="block mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                  {stopCondition === 'duration' ? '发送时长：' : '发送数量：'}
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={1}
                    max={stopCondition === 'duration' ? 3600 : 1000000}
                    value={stopValue}
                    onChange={e => setStopValue(Math.max(1, Number(e.target.value)))}
                    className="flex-1 border rounded-md px-3 py-2 text-sm bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder={stopCondition === 'duration' ? '30' : '1000'}
                  />
                  <span className="text-sm text-gray-500 dark:text-gray-400 whitespace-nowrap">
                    {stopCondition === 'duration' ? '秒' : '个'}
                  </span>
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  {stopCondition === 'duration' 
                    ? '建议范围：1-3600 秒（1小时）' 
                    : '建议范围：1-100万个数据包'
                  }
                </div>
              </div>
            )}
            
            {/* 网卡隔离选项 */}
            <div className="border-t pt-4 mt-4">
              <div className="flex items-start">
                <input 
                  type="checkbox" 
                  id="isolate-interface"
                  checked={isolateInterface}
                  onChange={e => setIsolateInterface(e.target.checked)}
                  disabled={!hasAdminPrivileges && !checkingPrivileges}
                  className="mt-1"
                />
                <div className="ml-2 flex-1">
                  <label htmlFor="isolate-interface" className={`text-gray-700 dark:text-gray-300 ${(!hasAdminPrivileges && !checkingPrivileges) ? 'opacity-50' : ''}`}>
                    独占网卡 (发送期间该网卡不处理其他网络流量)
                  </label>
                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    启用后将暂时断开该网卡的正常网络连接，仅用于发送测试报文，发送完成后自动恢复
                  </div>
                  
                  {/* 权限状态显示 */}
                  {checkingPrivileges && (
                    <div className="text-xs text-blue-500 mt-1">
                      ⏳ 正在检查管理员权限...
                    </div>
                  )}
                  {!checkingPrivileges && !hasAdminPrivileges && (
                    <div className="text-xs text-red-500 mt-1">
                      <div>❌ 需要管理员权限才能使用此功能</div>
                      {platform === 'macos' && (
                        <div className="mt-2 p-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded">
                          <div className="font-medium mb-1">macOS 用户请使用以下命令启动：</div>
                          <div className="font-mono text-xs bg-gray-800 text-green-400 p-2 rounded break-all whitespace-pre-wrap">
                            {process.env.NODE_ENV === 'development' ? (
                              'sudo pnpm tauri dev'
                            ) : (
                              'sudo /Applications/BitSender.app/Contents/MacOS/BitSender'
                            )}
                          </div>
                        </div>
                      )}
                      {platform === 'windows' && (
                        <div className="mt-2 p-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded">
                          <div className="font-medium">Windows 用户请右键应用，选择"以管理员身份运行"</div>
                        </div>
                      )}
                      {platform === 'linux' && (
                        <div className="mt-2 p-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded">
                          <div className="font-medium mb-1">Linux 用户请使用以下命令启动：</div>
                          <div className="font-mono text-xs bg-gray-800 text-green-400 p-1 rounded">
                            sudo ./BitSender
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                  {!checkingPrivileges && hasAdminPrivileges && (
                    <div className="text-xs text-green-600 dark:text-green-400 mt-1">
                      ✅ 已检测到管理员权限
                      {process.env.NODE_ENV === 'development' && (
                        <span className="ml-2 text-blue-500">(开发模式)</span>
                      )}
                    </div>
                  )}
                  
                  {/* 警告信息 */}
                  {isolateInterface && hasAdminPrivileges && (
                    <div className="text-xs text-orange-600 dark:text-orange-400 mt-2 p-2 bg-orange-50 dark:bg-orange-900/20 rounded border border-orange-200 dark:border-orange-700">
                      {process.env.NODE_ENV === 'development' ? (
                        <>
                          🧪 <strong>开发模式：</strong>网卡隔离功能将被模拟执行，不会实际影响网络连接。这只是为了测试用户界面和业务逻辑。
                        </>
                      ) : (
                        <>
                          ⚠️ <strong>警告：</strong>启用网卡隔离后，该网卡将暂时无法进行正常网络通信。如果这是您的主要网络连接，可能会影响网络访问。
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
        
        {/* 发送中状态 */}
        {isSending && taskStatus && (
          <div className="mb-4 text-sm text-gray-700 dark:text-gray-300 space-y-2">
            {/* 网卡隔离状态提示 */}
            {isolateInterface && (
              <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-700 rounded p-2 mb-2">
                <div className="text-orange-600 dark:text-orange-400 text-xs">
                  {process.env.NODE_ENV === 'development' ? (
                    <>🧪 <strong>开发模式网卡隔离：</strong>正在模拟网卡 {interfaceName} 的隔离状态</>
                  ) : (
                    <>🔒 <strong>网卡隔离模式：</strong>网卡 {interfaceName} 已暂时断开正常网络连接</>
                  )}
                </div>
              </div>
            )}
            
            <div className="flex justify-between">
              <span>开始时间：</span>
              <span>{new Date(taskStatus.start_time * 1000).toLocaleTimeString('zh-CN', { hour12: false })}</span>
            </div>
            <div className="flex justify-between">
              <span>已发送：</span>
              <span className="font-mono text-blue-600 dark:text-blue-400">{taskStatus.sent_count.toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span>目标速度：</span>
              <span>{taskStatus.speed.toLocaleString()} 次/秒</span>
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
                {/* 网卡恢复状态提示 */}
                {isolateInterface && (
                  <div className="text-green-600 dark:text-green-400 text-xs mt-2">
                    {process.env.NODE_ENV === 'development' ? (
                      <>🧪 开发模式：网卡 {interfaceName} 模拟恢复完成</>
                    ) : (
                      <>🔓 网卡 {interfaceName} 已自动恢复正常网络连接</>
                    )}
                  </div>
                )}
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
                  <span>{completedStats.targetSpeed.toLocaleString()} 次/秒</span>
                </div>
                <div className="flex justify-between">
                  <span>实际速度：</span>
                  <span className="font-mono text-green-600 dark:text-green-400">
                    {completedStats.actualSpeed.toLocaleString()} 次/秒
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