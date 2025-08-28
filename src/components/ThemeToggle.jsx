import React from 'react';
import { SunIcon, MoonIcon, ComputerDesktopIcon } from '@heroicons/react/24/outline';
import { useTheme } from '../hooks/useTheme';
import { useLanguage } from '../hooks/useLanguage';
import { useTranslation } from '../locales';

const ThemeToggle = () => {
  const { theme, setTheme } = useTheme();
  const { language } = useLanguage();
  const { t } = useTranslation(language);

  const themes = [
    { key: 'light', label: t('theme.light'), icon: SunIcon },
    { key: 'dark', label: t('theme.dark'), icon: MoonIcon },
    { key: 'system', label: t('theme.system'), icon: ComputerDesktopIcon }
  ];

  return (
    <div className="flex items-center justify-between">
      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{t('config.theme')}</span>
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