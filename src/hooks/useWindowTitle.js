import { useEffect } from 'react';

/**
 * 设置窗口标题的 Hook
 * 支持 Tauri 桌面应用和 Web 端
 */
export function useWindowTitle(title) {
  useEffect(() => {
    if (!title) return;

    // 设置 Web 端标题
    document.title = title;

    // 设置 Tauri 桌面端窗口标题
    const setTauriTitle = async () => {
      try {
        const { window } = await import('@tauri-apps/api');
        if (window?.appWindow) {
          await window.appWindow.setTitle(title);
        }
      } catch (error) {
        // Tauri 不可用（Web 环境），忽略错误
        console.debug('Tauri window API 不可用，仅设置 document.title');
      }
    };

    setTauriTitle();
  }, [title]);
}
