import React from 'react';
import { SunIcon, MoonIcon, ComputerDesktopIcon } from '@heroicons/react/24/outline';
import { useTheme } from '../hooks/useTheme';

const ThemeToggle = () => {
  const { theme, setTheme } = useTheme();

  const themes = [
    { key: 'light', label: '浅色', icon: SunIcon },
    { key: 'dark', label: '深色', icon: MoonIcon },
    { key: 'system', label: '跟随系统', icon: ComputerDesktopIcon }
  ];

  return (
    <div className="flex items-center justify-between">
      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">主题模式</span>
      <div className="flex items-center gap-2">
        {themes.map((themeOption) => {
          const Icon = themeOption.icon;
          const isSelected = theme === themeOption.key;
          
          return (
            <button
              key={themeOption.key}
              onClick={() => setTheme(themeOption.key)}
              className={`
                flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs transition-all duration-200
                ${isSelected 
                  ? 'bg-blue-500 text-white shadow-sm' 
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
                }
              `}
              title={themeOption.label}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{themeOption.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default ThemeToggle;