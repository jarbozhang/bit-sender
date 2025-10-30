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
            
            {/* 网卡隔离选项 - Windows 平台隐藏 */}
            {platform !== 'windows' && (
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
                      {t('batchSend.isolateInterface')}
                    </label>
                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      {t('batchSend.isolateDescription')}
                    </div>
                  
                  {/* 权限状态显示 */}
                  {checkingPrivileges && (
                    <div className="text-xs text-blue-500 mt-1">
                      ⏳ {t('batchSend.checkingPermissions')}
                    </div>
                  )}
                  {!checkingPrivileges && !hasAdminPrivileges && (
                    <div className="text-xs text-red-500 mt-1">
                      <div>❌ {t('batchSend.adminRequired')}</div>
                      {platform === 'macos' && (
                        <div className="mt-2 p-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded">
                          <div className="font-medium mb-1">{t('batchSend.macosCommand')}</div>
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
                          <div className="font-medium">{t('batchSend.windowsInstruction')}</div>
                        </div>
                      )}
                      {platform === 'linux' && (
                        <div className="mt-2 p-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded">
                          <div className="font-medium mb-1">{t('batchSend.linuxCommand')}</div>
                          <div className="font-mono text-xs bg-gray-800 text-green-400 p-1 rounded">
                            sudo ./BitSender
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                  {!checkingPrivileges && hasAdminPrivileges && (
                    <div className="text-xs text-green-600 dark:text-green-400 mt-1">
                      ✅ {t('batchSend.adminDetected')}
                      {process.env.NODE_ENV === 'development' && (
                        <span className="ml-2 text-blue-500">{t('batchSend.devMode')}</span>
                      )}
                    </div>
                  )}
                  
                  {/* 警告信息 */}
                  {isolateInterface && hasAdminPrivileges && (
                    <div className="text-xs text-orange-600 dark:text-orange-400 mt-2 p-2 bg-orange-50 dark:bg-orange-900/20 rounded border border-orange-200 dark:border-orange-700">
                      {process.env.NODE_ENV === 'development' ? (
                        <>
                          🧪 <strong>{t('batchSend.devMode')}</strong>{t('batchSend.isolateWarningDev')}
                        </>
                      ) : (
                        <>
                          ⚠️ <strong>{t('common.warning')}：</strong>{t('batchSend.isolateWarning')}
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
            )}
          </div>
        )}
        
        {/* 发送中状态 */}
        {isSending && taskStatus && (
          <div className="mb-4 text-sm text-gray-700 dark:text-gray-300 space-y-2">
            {/* 网卡隔离状态提示 - Windows 平台隐藏 */}
            {platform !== 'windows' && isolateInterface && (
              <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-700 rounded p-2 mb-2">
                <div className="text-orange-600 dark:text-orange-400 text-xs">
                  {process.env.NODE_ENV === 'development' ? (
                    <>🧪 <strong>{t('batchSend.devMode')}</strong>{t('batchSend.isolateStatusDev', {interface: interfaceName})}</>
                  ) : (
                    <>🔒 <strong>{t('batchSend.isolateStatus', {interface: interfaceName})}</strong></>
                  )}
                </div>
              </div>
            )}
            
            <div className="flex justify-between">
              <span>{t('batchSend.startTime')}：</span>
              <span>{new Date(taskStatus.start_time * 1000).toLocaleTimeString('zh-CN', { hour12: false })}</span>
            </div>
            <div className="flex justify-between">
              <span>{t('batchSend.sent')}：</span>
              <span className="font-mono text-blue-600 dark:text-blue-400">{taskStatus.sent_count.toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span>{t('batchSend.targetSpeed')}：</span>
              <span>{taskStatus.speed.toLocaleString()} {t('batchSend.frequencyUnit')}</span>
            </div>
            
            {/* 进度条和剩余信息 */}
            {stopCondition !== 'manual' && (
              <>
                <div className="flex justify-between">
                  <span>{stopCondition === 'duration' ? t('batchSend.running') + '：' : t('batchSend.progress') + '：'}</span>
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
                      ? `${t('batchSend.remainingTime')}: ${Math.max(0, stopValue - Math.floor((Date.now() - taskStatus.start_time * 1000) / 1000))}${t('batchSend.durationUnit')}`
                      : `${t('batchSend.remaining')}: ${Math.max(0, stopValue - taskStatus.sent_count).toLocaleString()}${t('batchSend.countUnit')}`
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
              ⚡ {t('batchSend.sending')}
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
                    ? t('batchSend.taskStopped')
                    : stopCondition === 'duration' 
                      ? t('batchSend.taskCompletedByDuration', {}, { duration: stopValue })
                      : stopCondition === 'count'
                        ? t('batchSend.taskCompletedByCount', {}, { count: stopValue.toLocaleString() })
                        : t('batchSend.taskCompleted')
                  }
                </div>
                {/* 网卡恢复状态提示 - Windows 平台隐藏 */}
                {platform !== 'windows' && isolateInterface && (
                  <div className="text-green-600 dark:text-green-400 text-xs mt-2">
                    {process.env.NODE_ENV === 'development' ? (
                      <>🧪 {t('batchSend.isolateRecoveredDev', {interface: interfaceName})}</>
                    ) : (
                      <>🔓 {t('batchSend.isolateRecovered', {interface: interfaceName})}</>
                    )}
                  </div>
                )}
              </div>
              
              <div className="text-sm text-gray-700 dark:text-gray-300 space-y-2">
                <div className="flex justify-between">
                  <span>{t('batchSend.totalSent')}：</span>
                  <span className="font-mono font-bold text-blue-600 dark:text-blue-400">
                    {completedStats.totalSent.toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>{t('batchSend.targetSpeed')}：</span>
                  <span>{completedStats.targetSpeed.toLocaleString()} {t('batchSend.frequencyUnit')}</span>
                </div>
                <div className="flex justify-between">
                  <span>{t('batchSend.actualSpeed')}：</span>
                  <span className="font-mono text-green-600 dark:text-green-400">
                    {completedStats.actualSpeed.toLocaleString()} {t('batchSend.frequencyUnit')}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>{t('batchSend.executionTime')}：</span>
                  <span>{completedStats.duration} {t('batchSend.durationUnit')}</span>
                </div>
                <hr className="border-gray-300 dark:border-gray-600 my-2" />
                <div className="flex justify-between">
                  <span>{t('batchSend.startTime')}：</span>
                  <span>{completedStats.startTime}</span>
                </div>
                <div className="flex justify-between">
                  <span>{t('batchSend.endTime')}：</span>
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
{t('common.cancel')}
              </button>
              <button className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-1 rounded" onClick={handleSend}>
{t('batchSend.startSend')}
              </button>
            </>
          )}
          {isSending && (
            <button className="bg-red-500 hover:bg-red-600 text-white px-4 py-1 rounded" onClick={handleStop}>
{t('batchSend.stopTask')}
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