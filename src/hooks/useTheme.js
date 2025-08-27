import { useState, useEffect } from 'react';

const THEME_KEY = 'bitSender-theme';

export function useTheme() {
  // 从localStorage获取保存的主题，或使用系统主题作为默认值
  const getInitialTheme = () => {
    const savedTheme = localStorage.getItem(THEME_KEY);
    if (savedTheme && ['light', 'dark', 'system'].includes(savedTheme)) {
      return savedTheme;
    }
    return 'system';
  };

  const [theme, setTheme] = useState(getInitialTheme);
  const [systemTheme, setSystemTheme] = useState(
    window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  );

  // 应用主题到DOM
  const applyTheme = (themeValue) => {
    const root = document.documentElement;
    if (themeValue === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  };

  // 获取实际应用的主题
  const getEffectiveTheme = (currentTheme, currentSystemTheme) => {
    if (currentTheme === 'system') {
      return currentSystemTheme;
    }
    return currentTheme;
  };

  // 设置主题
  const setThemeMode = (newTheme) => {
    if (['light', 'dark', 'system'].includes(newTheme)) {
      setTheme(newTheme);
      localStorage.setItem(THEME_KEY, newTheme);
      
      const effectiveTheme = getEffectiveTheme(newTheme, systemTheme);
      applyTheme(effectiveTheme);
    }
  };

  // 监听系统主题变化
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    
    const handleSystemThemeChange = (e) => {
      const newSystemTheme = e.matches ? 'dark' : 'light';
      setSystemTheme(newSystemTheme);
      
      // 如果当前设置是跟随系统，则应用新的系统主题
      if (theme === 'system') {
        applyTheme(newSystemTheme);
      }
    };

    mediaQuery.addEventListener('change', handleSystemThemeChange);
    return () => mediaQuery.removeEventListener('change', handleSystemThemeChange);
  }, [theme]);

  // 初始化主题
  useEffect(() => {
    const effectiveTheme = getEffectiveTheme(theme, systemTheme);
    applyTheme(effectiveTheme);
  }, [theme, systemTheme]);

  // 尝试集成 Tauri 主题监听（可选）
  useEffect(() => {
    let unlisten;
    
    const setupTauriTheme = async () => {
      try {
        const mod = await import('@tauri-apps/api');
        if (mod?.window?.appWindow) {
          const tauriTheme = await mod.window.appWindow.theme();
          if (theme === 'system') {
            setSystemTheme(tauriTheme === 'dark' ? 'dark' : 'light');
          }
          
          unlisten = await mod.window.appWindow.onThemeChanged(({ payload: { theme: newTheme } }) => {
            const newSystemTheme = newTheme === 'dark' ? 'dark' : 'light';
            setSystemTheme(newSystemTheme);
          });
        }
      } catch (e) {
        // Tauri 不可用，使用 web API
      }
    };

    setupTauriTheme();
    
    return () => {
      if (typeof unlisten === 'function') {
        unlisten();
      }
    };
  }, [theme]);

  const currentEffectiveTheme = getEffectiveTheme(theme, systemTheme);

  return {
    theme,
    systemTheme,
    effectiveTheme: currentEffectiveTheme,
    setTheme: setThemeMode,
    isDark: currentEffectiveTheme === 'dark'
  };
}