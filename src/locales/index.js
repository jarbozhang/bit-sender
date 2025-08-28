import zhCN from './zh-CN.json';
import enUS from './en-US.json';

export const locales = {
  'zh-CN': zhCN,
  'en-US': enUS
};

export const useTranslation = (language) => {
  const t = (key, defaultValue = key, params = {}) => {
    const keys = key.split('.');
    let value = locales[language] || locales['zh-CN'];
    
    for (const k of keys) {
      value = value[k];
      if (value === undefined) {
        return defaultValue;
      }
    }
    
    let result = value || defaultValue;
    
    // 处理参数替换，如 {protocol} 等
    if (params && typeof result === 'string') {
      Object.keys(params).forEach(param => {
        result = result.replace(new RegExp(`\\{${param}\\}`, 'g'), params[param]);
      });
    }
    
    return result;
  };
  
  return { t };
};