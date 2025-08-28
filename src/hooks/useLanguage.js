import { useState, useEffect } from 'react';

export const useLanguage = () => {
  const [language, setLanguageState] = useState(() => {
    // 从localStorage读取语言设置，默认为中文
    const stored = localStorage.getItem('app-language');
    if (stored) {
      return stored;
    }
    
    // 检测浏览器语言，如果是英文相关则使用英文，否则使用中文
    const browserLang = navigator.language || navigator.userLanguage;
    if (browserLang.startsWith('en')) {
      return 'en-US';
    }
    return 'zh-CN';
  });

  const setLanguage = (newLanguage) => {
    setLanguageState(newLanguage);
    localStorage.setItem('app-language', newLanguage);
  };

  return {
    language,
    setLanguage
  };
};