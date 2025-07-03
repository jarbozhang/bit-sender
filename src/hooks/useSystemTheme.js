import { useEffect } from 'react';

export function useSystemTheme() {
  useEffect(() => {
    let unlisten;
    const applyTheme = (theme) => {
      const root = document.documentElement;
      if (theme === 'dark') {
        root.classList.add('dark');
      } else {
        root.classList.remove('dark');
      }
    };

    const setup = async () => {
      // Tauri 桌面端
      try {
        // 动态 import，兼容 web 端
        const mod = await import('@tauri-apps/api');
        if (mod?.window?.appWindow) {
          const theme = await mod.window.appWindow.theme();
          applyTheme(theme);
          unlisten = await mod.window.appWindow.onThemeChanged(({ payload: { theme: newTheme } }) => {
            applyTheme(newTheme);
          });
          return;
        }
      } catch (e) {
        // ignore, fallback to web
      }
      // Web 端
      if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
        applyTheme('dark');
      } else {
        applyTheme('light');
      }
      const listener = (e) => applyTheme(e.matches ? 'dark' : 'light');
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', listener);
      // 清理
      return () => window.matchMedia('(prefers-color-scheme: dark)').removeEventListener('change', listener);
    };
    const cleanup = setup();
    return () => {
      if (typeof unlisten === 'function') unlisten();
      if (typeof cleanup === 'function') cleanup();
    };
  }, []);
} 