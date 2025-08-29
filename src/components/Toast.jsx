import React, { useState, useEffect } from "react";
import { XMarkIcon, CheckCircleIcon, ExclamationTriangleIcon, InformationCircleIcon } from "@heroicons/react/24/outline";

const Toast = ({ 
  message, 
  type = "info", 
  duration = 3000, 
  onClose 
}) => {
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    if (duration > 0) {
      const timer = setTimeout(() => {
        setIsVisible(false);
        setTimeout(onClose, 300); // 等待动画结束
      }, duration);
      return () => clearTimeout(timer);
    }
  }, [duration, onClose]);

  const handleClose = () => {
    setIsVisible(false);
    setTimeout(onClose, 300);
  };

  const icons = {
    success: <CheckCircleIcon className="h-5 w-5 text-green-400" />,
    error: <ExclamationTriangleIcon className="h-5 w-5 text-red-400" />,
    warning: <ExclamationTriangleIcon className="h-5 w-5 text-yellow-400" />,
    info: <InformationCircleIcon className="h-5 w-5 text-blue-400" />
  };

  const colors = {
    success: "bg-green-50 border-green-200 text-green-800 dark:bg-green-900/20 dark:border-green-800 dark:text-green-200",
    error: "bg-red-50 border-red-200 text-red-800 dark:bg-red-900/20 dark:border-red-800 dark:text-red-200",
    warning: "bg-yellow-50 border-yellow-200 text-yellow-800 dark:bg-yellow-900/20 dark:border-yellow-800 dark:text-yellow-200",
    info: "bg-blue-50 border-blue-200 text-blue-800 dark:bg-blue-900/20 dark:border-blue-800 dark:text-blue-200"
  };

  return (
    <div className={`transition-all duration-300 ${
      isVisible ? 'translate-x-0 opacity-100' : 'translate-x-full opacity-0'
    }`}>
      <div className={`flex items-center p-4 border rounded-lg shadow-lg max-w-sm ${colors[type]}`}>
        {icons[type]}
        <span className="ml-3 flex-1 text-sm font-medium">{message}</span>
        <button
          onClick={handleClose}
          className="ml-4 inline-flex text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
        >
          <XMarkIcon className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
};

// Toast 管理器
export const ToastContainer = ({ toasts, removeToast }) => {
  return (
    <div className="fixed top-20 right-4 z-50 space-y-2">
      {toasts.map((toast) => (
        <Toast
          key={toast.id}
          message={toast.message}
          type={toast.type}
          duration={toast.duration}
          onClose={() => removeToast(toast.id)}
        />
      ))}
    </div>
  );
};

export default Toast; 