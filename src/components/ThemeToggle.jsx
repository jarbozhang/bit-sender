import React from 'react';
import { SunIcon, MoonIcon, ComputerDesktopIcon } from '@heroicons/react/24/outline';
import { useTheme } from '../hooks/useTheme';

const ThemeToggle = () => {
  const { theme, setTheme, effectiveTheme } = useTheme();

  const themes = [
    {
      key: 'light',
      label: '浅色模式',
      icon: SunIcon,
      description: '始终使用浅色主题'
    },
    {
      key: 'dark',
      label: '深色模式',
      icon: MoonIcon,
      description: '始终使用深色主题'
    },
    {
      key: 'system',
      label: '跟随系统',
      icon: ComputerDesktopIcon,
      description: '根据系统设置自动切换'
    }
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
          {effectiveTheme === 'dark' ? (
            <MoonIcon className="w-5 h-5 text-white" />
          ) : (
            <SunIcon className="w-5 h-5 text-white" />
          )}
        </div>
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            主题设置
          </h3>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            当前主题：{themes.find(t => t.key === theme)?.label}
            {theme === 'system' && ` (${effectiveTheme === 'dark' ? '深色' : '浅色'})`}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3">
        {themes.map((themeOption) => {
          const Icon = themeOption.icon;
          const isSelected = theme === themeOption.key;
          
          return (
            <button
              key={themeOption.key}
              onClick={() => setTheme(themeOption.key)}
              className={`
                flex items-center gap-4 p-4 rounded-lg border-2 transition-all duration-200
                ${isSelected 
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 dark:border-blue-400' 
                  : 'border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500 hover:bg-gray-50 dark:hover:bg-gray-700/50'
                }
              `}
            >
              <div className={`
                w-10 h-10 rounded-lg flex items-center justify-center transition-colors
                ${isSelected 
                  ? 'bg-blue-100 dark:bg-blue-800 text-blue-600 dark:text-blue-300' 
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
                }
              `}>
                <Icon className="w-5 h-5" />
              </div>
              
              <div className="flex-1 text-left">
                <div className={`font-medium ${isSelected ? 'text-blue-700 dark:text-blue-300' : 'text-gray-900 dark:text-gray-100'}`}>
                  {themeOption.label}
                </div>
                <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  {themeOption.description}
                </div>
              </div>
              
              {isSelected && (
                <div className="w-5 h-5 rounded-full bg-blue-500 flex items-center justify-center">
                  <div className="w-2 h-2 rounded-full bg-white"></div>
                </div>
              )}
            </button>
          );
        })}
      </div>

      <div className="mt-6 p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
        <div className="flex items-start gap-3">
          <div className="w-5 h-5 rounded-full bg-blue-100 dark:bg-blue-900/50 flex items-center justify-center flex-shrink-0 mt-0.5">
            <div className="w-2 h-2 rounded-full bg-blue-500"></div>
          </div>
          <div className="text-sm text-gray-600 dark:text-gray-400">
            <p className="font-medium text-gray-700 dark:text-gray-300 mb-1">主题设置说明</p>
            <ul className="space-y-1 text-xs">
              <li>• <strong>浅色模式</strong>：界面始终保持明亮的配色方案</li>
              <li>• <strong>深色模式</strong>：界面始终保持暗色的配色方案，护眼且省电</li>
              <li>• <strong>跟随系统</strong>：自动根据操作系统的主题设置进行切换</li>
            </ul>
            <p className="mt-2 text-xs text-gray-500 dark:text-gray-500">
              设置会自动保存，下次启动时会保持您的选择。
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ThemeToggle;