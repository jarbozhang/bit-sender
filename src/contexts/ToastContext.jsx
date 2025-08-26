import React, { createContext, useContext, useState, useCallback } from 'react';

const ToastContext = createContext();

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
};

export const ToastProvider = ({ children }) => {
  const [toasts, setToasts] = useState([]);
  const [errorDialog, setErrorDialog] = useState({ isOpen: false, title: '', message: '', details: '' });

  const addToast = useCallback(({ message, type = 'info', duration = 3000 }) => {
    const id = Date.now() + Math.random();
    const newToast = { id, message, type, duration };
    setToasts(prev => [...prev, newToast]);
    return id;
  }, []);

  const removeToast = useCallback((id) => {
    setToasts(prev => prev.filter(toast => toast.id !== id));
  }, []);

  const showSuccess = useCallback((message, duration) => {
    return addToast({ message, type: 'success', duration });
  }, [addToast]);

  const showError = useCallback((message, duration) => {
    return addToast({ message, type: 'error', duration });
  }, [addToast]);

  const showWarning = useCallback((message, duration) => {
    return addToast({ message, type: 'warning', duration });
  }, [addToast]);

  const showInfo = useCallback((message, duration) => {
    return addToast({ message, type: 'info', duration });
  }, [addToast]);

  // 显示详细错误对话框
  const showErrorDialog = useCallback(({ title = '错误', message, details }) => {
    setErrorDialog({ isOpen: true, title, message, details });
  }, []);

  // 关闭错误对话框
  const closeErrorDialog = useCallback(() => {
    setErrorDialog({ isOpen: false, title: '', message: '', details: '' });
  }, []);

  // 智能错误处理：检测权限错误并显示详细对话框
  const showSmartError = useCallback((errorMessage, duration = 5000) => {
    // 检测是否是权限相关错误
    const isPermissionError = errorMessage.includes('Operation not permitted') || 
                             errorMessage.includes('权限') || 
                             errorMessage.includes('sudo') ||
                             errorMessage.includes('setcap');

    if (isPermissionError && errorMessage.length > 100) {
      // 长的权限错误信息用对话框显示
      const title = '权限错误';
      const shortMessage = '发送数据包需要管理员权限';
      showErrorDialog({ title, message: shortMessage, details: errorMessage });
      // 同时显示简短的toast
      showError('权限不足，点击查看详情', duration);
    } else {
      // 普通错误用toast显示
      showError(errorMessage, duration);
    }
  }, [showError, showErrorDialog]);

  const value = {
    toasts,
    addToast,
    removeToast,
    showSuccess,
    showError,
    showWarning,
    showInfo,
    showErrorDialog,
    closeErrorDialog,
    showSmartError,
    errorDialog
  };

  return (
    <ToastContext.Provider value={value}>
      {children}
    </ToastContext.Provider>
  );
}; 