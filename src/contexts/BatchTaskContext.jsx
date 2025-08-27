import React, { createContext, useContext, useState, useEffect } from 'react';

const BatchTaskContext = createContext();

export const useBatchTask = () => {
  const context = useContext(BatchTaskContext);
  if (!context) {
    throw new Error('useBatchTask must be used within a BatchTaskProvider');
  }
  return context;
};

export const BatchTaskProvider = ({ children }) => {
  const [activeTasks, setActiveTasks] = useState(new Map()); // taskId -> { interfaceName, isolateInterface }

  // 添加任务
  const addTask = (taskId, interfaceName, isolateInterface) => {
    setActiveTasks(prev => new Map(prev).set(taskId, { interfaceName, isolateInterface }));
  };

  // 移除任务
  const removeTask = (taskId) => {
    setActiveTasks(prev => {
      const newMap = new Map(prev);
      newMap.delete(taskId);
      return newMap;
    });
  };

  // 获取所有使用网卡隔离的任务
  const getIsolatedTasks = () => {
    const isolatedTasks = [];
    activeTasks.forEach((task, taskId) => {
      if (task.isolateInterface) {
        isolatedTasks.push({ taskId, ...task });
      }
    });
    return isolatedTasks;
  };

  // 停止所有批量任务
  const stopAllTasks = async () => {
    const taskIds = Array.from(activeTasks.keys());
    
    for (const taskId of taskIds) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        await invoke('stop_batch_send', { taskId });
        removeTask(taskId);
      } catch (error) {
        console.error(`停止任务 ${taskId} 失败:`, error);
      }
    }
  };

  // 检查是否有活跃任务
  const hasActiveTasks = () => activeTasks.size > 0;

  // 检查是否有网卡隔离任务
  const hasIsolatedTasks = () => getIsolatedTasks().length > 0;

  const value = {
    activeTasks,
    addTask,
    removeTask,
    getIsolatedTasks,
    stopAllTasks,
    hasActiveTasks,
    hasIsolatedTasks,
  };

  return (
    <BatchTaskContext.Provider value={value}>
      {children}
    </BatchTaskContext.Provider>
  );
};