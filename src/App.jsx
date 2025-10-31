import React, { useState, useEffect } from "react";
import PacketEditor from "./features/packetEditor";
import NetworkSniffer from "./features/networkSniffer/NetworkSniffer";
// import ResponseMonitor from "./features/responseMonitor/ResponseMonitor"; // 临时隐藏
import { CubeTransparentIcon } from "@heroicons/react/24/outline";
import { useTheme } from "./hooks/useTheme";
import { useWindowTitle } from "./hooks/useWindowTitle";
import { ToastContainer } from "./components/Toast";
import ErrorDialog from "./components/ErrorDialog";
import ThemeToggle from "./components/ThemeToggle";
import LanguageToggle from "./components/LanguageToggle";
import { useLanguage } from "./hooks/useLanguage";
import { useTranslation } from "./locales";
import { useToast, ToastProvider } from "./contexts/ToastContext";
import { NetworkInterfaceProvider, useNetworkInterface } from "./contexts/NetworkInterfaceContext";
import { BatchTaskProvider, useBatchTask } from "./contexts/BatchTaskContext";
import packageJson from '../package.json';

function AppContent() {
  useTheme(); // 初始化主题系统
  const { language } = useLanguage();
  const { t } = useTranslation(language);
  
  // 动态设置窗口标题
  useWindowTitle(t('common.appTitle'));
  const { toasts, removeToast, errorDialog, closeErrorDialog } = useToast();
  const { selectedInterface, setShowSelectModal } = useNetworkInterface();
  const { hasIsolatedTasks, stopAllTasks, getIsolatedTasks } = useBatchTask();
  const [activeTab, setActiveTab] = useState('packet-editor');
  const [showTabSwitchConfirm, setShowTabSwitchConfirm] = useState(false);
  const [pendingTab, setPendingTab] = useState(null);
  const [platform, setPlatform] = useState(null);

  // 检测平台
  useEffect(() => {
    try {
      const userAgent = navigator.userAgent;
      if (userAgent.includes('Mac')) {
        setPlatform('macos');
      } else if (userAgent.includes('Win')) {
        setPlatform('windows');
      } else if (userAgent.includes('Linux')) {
        setPlatform('linux');
      } else {
        setPlatform('unknown');
      }
    } catch (error) {
      console.warn('平台检测失败:', error);
      setPlatform('unknown');
    }
  }, []);

  // 处理页面切换
  const handleTabSwitch = async (newTab) => {
    if (newTab === activeTab) return;

    // 如果有网卡隔离任务正在运行，需要用户确认（Windows 平台跳过）
    if (platform !== 'windows' && hasIsolatedTasks()) {
      setPendingTab(newTab);
      setShowTabSwitchConfirm(true);
      return;
    }

    setActiveTab(newTab);
  };

  // 确认切换并停止任务
  const confirmTabSwitch = async () => {
    try {
      await stopAllTasks();
      setActiveTab(pendingTab);
      setShowTabSwitchConfirm(false);
      setPendingTab(null);
    } catch (error) {
      console.error('停止批量任务失败:', error);
    }
  };

  // 取消切换
  const cancelTabSwitch = () => {
    setShowTabSwitchConfirm(false);
    setPendingTab(null);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-gray-100 flex flex-col text-gray-800 dark:bg-gray-900 dark:text-gray-200">
      {/* Tailwind UI 导航栏 */}
      <nav className="bg-white border-b border-blue-100 shadow-sm dark:bg-gray-800 dark:border-gray-700">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between">
            <div className="flex items-center gap-2">
              <CubeTransparentIcon className="h-8 w-8 text-blue-600" />
              <span className="text-2xl font-bold text-blue-700 tracking-tight">{t('common.appTitle')}</span>
            </div>
            <div className="hidden md:flex gap-8">
              <button 
                onClick={() => handleTabSwitch('packet-editor')}
                className={`inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium focus:outline-none transition ${
                  activeTab === 'packet-editor' 
                    ? 'border-blue-600 text-blue-700 dark:text-blue-300 dark:border-blue-400' 
                    : 'border-transparent text-gray-600 hover:border-blue-300 hover:text-blue-600 dark:text-gray-300 dark:hover:text-blue-400 dark:hover:border-blue-400'
                }`}
              >
                {t('nav.packetEditor')}
              </button>
              <button 
                onClick={() => handleTabSwitch('network-sniffer')}
                className={`inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium focus:outline-none transition ${
                  activeTab === 'network-sniffer' 
                    ? 'border-blue-600 text-blue-700 dark:text-blue-300 dark:border-blue-400' 
                    : 'border-transparent text-gray-600 hover:border-blue-300 hover:text-blue-600 dark:text-gray-300 dark:hover:text-blue-400 dark:hover:border-blue-400'
                }`}
              >
                {t('nav.networkSniffer')}
              </button>
{/* 响应监控页面临时隐藏，后续启用 */}
              {/* <button 
                onClick={() => setActiveTab('response-monitor')}
                className={`inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium focus:outline-none transition ${
                  activeTab === 'response-monitor' 
                    ? 'border-blue-600 text-blue-700 dark:text-blue-300 dark:border-blue-400' 
                    : 'border-transparent text-gray-600 hover:border-blue-300 hover:text-blue-600 dark:text-gray-300 dark:hover:text-blue-400 dark:hover:border-blue-400'
                }`}
              >
                响应监控
              </button> */}
              <button 
                onClick={() => handleTabSwitch('config-manager')}
                className={`inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium focus:outline-none transition ${
                  activeTab === 'config-manager' 
                    ? 'border-blue-600 text-blue-700 dark:text-blue-300 dark:border-blue-400' 
                    : 'border-transparent text-gray-600 hover:border-blue-300 hover:text-blue-600 dark:text-gray-300 dark:hover:text-blue-400 dark:hover:border-blue-400'
                }`}
              >
                {t('nav.configManager')}
              </button>
            </div>
            {/* 新增网卡选择入口 */}
            <button
              className="ml-4 px-3 py-1 rounded border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-800 dark:text-gray-100 hover:bg-blue-100 dark:hover:bg-blue-900 transition"
              onClick={() => setShowSelectModal(true)}
            >
              {t('nav.currentInterface')}：{selectedInterface?.description || selectedInterface?.name || t('common.notSelected', '未选择')}
            </button>
            {/* 移动端菜单可后续补充 */}
          </div>
        </div>
      </nav>
      {/* 主内容区 */}
      <main className="flex-1 flex flex-col items-center py-10 dark:bg-gray-900 dark:text-gray-200">
        <section className="w-full max-w-6xl flex flex-col gap-8">
          {activeTab === 'packet-editor' && (
            <div className="bg-white rounded-2xl shadow-lg border border-blue-100 p-8 mb-4 dark:bg-gray-800 dark:border-gray-700">
              <h2 className="text-2xl font-semibold mb-6 text-blue-700 flex items-center gap-2 dark:text-blue-300">
                <CubeTransparentIcon className="h-6 w-6 text-blue-400" />
                {t('nav.packetEditor')}
              </h2>
              <PacketEditor />
            </div>
          )}

          {activeTab === 'network-sniffer' && (
            <div className="bg-white rounded-2xl shadow-lg border border-blue-100 p-8 mb-4 dark:bg-gray-800 dark:border-gray-700">
              <h2 className="text-2xl font-semibold mb-6 text-blue-700 flex items-center gap-2 dark:text-blue-300">
                <CubeTransparentIcon className="h-6 w-6 text-blue-400" />
                {t('nav.networkSniffer')}
              </h2>
              <NetworkSniffer />
            </div>
          )}

{/* 响应监控内容区域临时隐藏 */}
          {/* {activeTab === 'response-monitor' && (
            <div className="bg-white rounded-2xl shadow-lg border border-blue-100 p-8 mb-4 dark:bg-gray-800 dark:border-gray-700">
              <h2 className="text-2xl font-semibold mb-6 text-blue-700 flex items-center gap-2 dark:text-blue-300">
                <CubeTransparentIcon className="h-6 w-6 text-blue-400" />
                响应监控
              </h2>
              <ResponseMonitor />
            </div>
          )} */}

          {activeTab === 'config-manager' && (
            <div className="bg-white rounded-2xl shadow-lg border border-blue-100 p-8 mb-4 dark:bg-gray-800 dark:border-gray-700">
              <h2 className="text-2xl font-semibold mb-6 text-blue-700 flex items-center gap-2 dark:text-blue-300">
                <CubeTransparentIcon className="h-6 w-6 text-blue-400" />
                {t('config.title')}
              </h2>
              
              <div className="space-y-6">
                {/* 外观设置 */}
                <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4">
                  <h3 className="text-base font-medium text-gray-800 dark:text-gray-200 mb-4">{t('config.appearance')}</h3>
                  <div className="space-y-4">
                    <ThemeToggle />
                  </div>
                </div>

                {/* 语言设置 */}
                <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4">
                  <h3 className="text-base font-medium text-gray-800 dark:text-gray-200 mb-4">{t('config.language')}</h3>
                  <div className="space-y-4">
                    <LanguageToggle />
                  </div>
                </div>

                {/* 软件版本显示 */}
                <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4 flex items-center">
                  <span className="text-base font-medium text-gray-800 dark:text-gray-200 mr-2">{t('config.versionLabel')}</span>
                  <span className="text-sm text-blue-600 dark:text-blue-300">{packageJson.version}</span>
                </div>
              </div>
            </div>
          )}
        </section>
      </main>
      {/* 底部版权 */}
      <footer className="bg-white border-t border-blue-100 py-4 text-center text-gray-400 text-sm shadow-inner dark:bg-gray-900 dark:border-gray-700 dark:text-gray-500">
        {t('footer.copyright')}
      </footer>
      
      {/* Toast 通知容器 */}
      <ToastContainer toasts={toasts} removeToast={removeToast} />
      
      {/* 错误详情对话框 */}
      <ErrorDialog
        isOpen={errorDialog.isOpen}
        onClose={closeErrorDialog}
        title={errorDialog.title}
        message={errorDialog.message}
        details={errorDialog.details}
      />
      
      {/* 切换确认对话框 */}
      {showTabSwitchConfirm && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 min-w-[400px] max-w-[500px]">
            <h3 className="text-lg font-bold mb-4 text-gray-800 dark:text-gray-100">
              确认页面切换
            </h3>
            <div className="mb-4 text-sm text-gray-700 dark:text-gray-300">
              {platform !== 'windows' ? (
                <>
                  <p className="mb-2">检测到您有正在运行的网卡隔离批量发送任务：</p>
                  <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-700 rounded p-2">
                    {getIsolatedTasks().map(task => (
                      <div key={task.taskId} className="text-xs text-orange-600 dark:text-orange-400">
                        🔒 网卡 {task.interfaceName} 正在隔离模式下发送数据包
                      </div>
                    ))}
                  </div>
                  <p className="mt-2">切换页面将会：</p>
                  <ul className="list-disc list-inside ml-2 text-xs text-gray-600 dark:text-gray-400">
                    <li>停止所有正在运行的批量发送任务</li>
                    <li>自动恢复被隔离的网卡配置</li>
                    <li>确保网络连接正常</li>
                  </ul>
                </>
              ) : (
                <>
                  <p className="mb-2">检测到您有正在运行的批量发送任务：</p>
                  <p className="mt-2">切换页面将会：</p>
                  <ul className="list-disc list-inside ml-2 text-xs text-gray-600 dark:text-gray-400">
                    <li>停止所有正在运行的批量发送任务</li>
                  </ul>
                </>
              )}
            </div>
            <div className="flex justify-end gap-2">
              <button 
                className="px-4 py-1 rounded border hover:bg-gray-50 dark:hover:bg-gray-700"
                onClick={cancelTabSwitch}
              >
                取消
              </button>
              <button 
                className="bg-red-500 hover:bg-red-600 text-white px-4 py-1 rounded"
                onClick={confirmTabSwitch}
              >
                确认切换
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function App() {
  return (
    <ToastProvider>
      <NetworkInterfaceProvider>
        <BatchTaskProvider>
          <AppContent />
        </BatchTaskProvider>
      </NetworkInterfaceProvider>
    </ToastProvider>
  );
}

export default App;
