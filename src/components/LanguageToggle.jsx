import React, { useState, useEffect } from 'react';
import { GlobeAltIcon } from '@heroicons/react/24/outline';
import { useLanguage } from '../hooks/useLanguage';
import { useTranslation } from '../locales';

const LanguageToggle = () => {
  const { language, setLanguage } = useLanguage();
  const { t } = useTranslation(language);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [pendingLanguage, setPendingLanguage] = useState(null);
  const [isRestarting, setIsRestarting] = useState(false);

  const languages = [
    { key: 'zh-CN', label: t('language.chinese'), flag: '🇨🇳' },
    { key: 'en-US', label: t('language.english'), flag: '🇺🇸' }
  ];

  const handleConfirmSwitch = async () => {
    if (pendingLanguage) {
      try {
        setIsRestarting(true);
        // 先切换语言设置
        setLanguage(pendingLanguage);
        
        // 稍微延迟以确保设置已保存
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // 使用 Tauri API 重启应用
        const { relaunch } = await import('@tauri-apps/api/app');
        await relaunch();
      } catch (error) {
        console.error('重启失败:', error);
        setIsRestarting(false);
        // 如果重启失败，使用原生 alert 提示用户
        alert(t('language.restartFailed'));
        setShowConfirmDialog(false);
        setPendingLanguage(null);
      }
    }
  };

  const handleCancelSwitch = () => {
    setShowConfirmDialog(false);
    setPendingLanguage(null);
  };

  // ESC键关闭弹框
  useEffect(() => {
    const handleEscapeKey = (event) => {
      if (event.key === 'Escape' && showConfirmDialog) {
        handleCancelSwitch();
      }
    };

    if (showConfirmDialog) {
      document.addEventListener('keydown', handleEscapeKey);
      // 锁定滚动
      document.body.style.overflow = 'hidden';
    }
    
    return () => {
      document.removeEventListener('keydown', handleEscapeKey);
      // 恢复滚动
      document.body.style.overflow = 'unset';
    };
  }, [showConfirmDialog]);

  return (
    <div className="flex items-center justify-between">
      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{t('config.interfaceLanguage')}</span>
      <div className="flex items-center gap-2">
        {languages.map((lang) => {
          const isSelected = language === lang.key;
          
          return (
            <button
              key={lang.key}
              onClick={() => {
                if (lang.key !== language) {
                  setPendingLanguage(lang.key);
                  setShowConfirmDialog(true);
                }
              }}
              className={`
                flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs transition-all duration-200
                ${isSelected 
                  ? 'bg-blue-500 text-white shadow-sm' 
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
                }
              `}
              title={lang.label}
            >
              <span className="text-sm">{lang.flag}</span>
              <span>{lang.label}</span>
            </button>
          );
        })}
      </div>
      
      {/* 语言切换确认弹框 */}
      {showConfirmDialog && (
        <div 
          className="fixed inset-0 bg-black/30 flex items-center justify-center z-50"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              handleCancelSwitch();
            }
          }}
        >
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 min-w-[400px] max-w-[500px] mx-4">
            <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-4">
              {t('language.switchTitle')}
            </h3>
            
            <div className="mb-6">
              <p className="text-gray-600 dark:text-gray-400 mb-3">
                {t('language.switchMessage')}
              </p>
              <div className="flex items-center justify-center mb-3">
                <div className="text-center">
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">
                    {language === 'zh-CN' ? '当前语言' : 'Current Language'}: {languages.find(l => l.key === language)?.label}
                  </p>
                  <div className="flex items-center justify-center">
                    <span className="text-2xl">→</span>
                  </div>
                  <p className="text-sm text-blue-600 dark:text-blue-400 mt-1 font-medium">
                    {pendingLanguage === 'zh-CN' ? '切换至' : 'Switch to'}: {languages.find(l => l.key === pendingLanguage)?.label}
                  </p>
                </div>
              </div>
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-md p-3">
                <div className="flex items-center">
                  <svg className="w-5 h-5 text-blue-600 dark:text-blue-400 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  <p className="text-sm text-blue-800 dark:text-blue-200 font-medium">
                    {t('language.autoRestart')}
                  </p>
                </div>
              </div>
            </div>
            
            <div className="flex justify-end gap-3">
              <button
                onClick={handleCancelSwitch}
                disabled={isRestarting}
                className={`px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-gray-700 dark:text-gray-300 transition-colors ${
                  isRestarting 
                    ? 'opacity-50 cursor-not-allowed' 
                    : 'hover:bg-gray-50 dark:hover:bg-gray-700'
                }`}
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={handleConfirmSwitch}
                disabled={isRestarting}
                className={`px-4 py-2 text-white rounded-md transition-colors flex items-center gap-2 ${
                  isRestarting 
                    ? 'bg-gray-400 cursor-not-allowed' 
                    : 'bg-blue-500 hover:bg-blue-600'
                }`}
              >
                {isRestarting && (
                  <svg className="animate-spin w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                )}
                {isRestarting ? t('language.restarting') : t('language.confirmSwitch')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LanguageToggle;