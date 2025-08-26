import React, { useState } from "react";
import PacketEditor from "./features/packetEditor";
import NetworkSniffer from "./features/networkSniffer/NetworkSniffer";
import ResponseMonitor from "./features/responseMonitor/ResponseMonitor";
import { CubeTransparentIcon } from "@heroicons/react/24/outline";
import { useSystemTheme } from "./hooks/useSystemTheme";
import { ToastContainer } from "./components/Toast";
import { useToast, ToastProvider } from "./contexts/ToastContext";
import { NetworkInterfaceProvider, useNetworkInterface } from "./contexts/NetworkInterfaceContext";

function AppContent() {
  useSystemTheme();
  const { toasts, removeToast } = useToast();
  const { selectedInterface, setShowSelectModal } = useNetworkInterface();
  const [activeTab, setActiveTab] = useState('packet-editor');

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-gray-100 flex flex-col text-gray-800 dark:bg-gray-900 dark:text-gray-200">
      {/* Tailwind UI 导航栏 */}
      <nav className="bg-white border-b border-blue-100 shadow-sm dark:bg-gray-800 dark:border-gray-700">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between">
            <div className="flex items-center gap-2">
              <CubeTransparentIcon className="h-8 w-8 text-blue-600" />
              <span className="text-2xl font-bold text-blue-700 tracking-tight">比达发包器</span>
            </div>
            <div className="hidden md:flex gap-8">
              <button 
                onClick={() => setActiveTab('packet-editor')}
                className={`inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium focus:outline-none transition ${
                  activeTab === 'packet-editor' 
                    ? 'border-blue-600 text-blue-700 dark:text-blue-300 dark:border-blue-400' 
                    : 'border-transparent text-gray-600 hover:border-blue-300 hover:text-blue-600 dark:text-gray-300 dark:hover:text-blue-400 dark:hover:border-blue-400'
                }`}
              >
                发送报文
              </button>
              <button 
                onClick={() => setActiveTab('network-sniffer')}
                className={`inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium focus:outline-none transition ${
                  activeTab === 'network-sniffer' 
                    ? 'border-blue-600 text-blue-700 dark:text-blue-300 dark:border-blue-400' 
                    : 'border-transparent text-gray-600 hover:border-blue-300 hover:text-blue-600 dark:text-gray-300 dark:hover:text-blue-400 dark:hover:border-blue-400'
                }`}
              >
                网口嗅探
              </button>
              <button 
                onClick={() => setActiveTab('response-monitor')}
                className={`inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium focus:outline-none transition ${
                  activeTab === 'response-monitor' 
                    ? 'border-blue-600 text-blue-700 dark:text-blue-300 dark:border-blue-400' 
                    : 'border-transparent text-gray-600 hover:border-blue-300 hover:text-blue-600 dark:text-gray-300 dark:hover:text-blue-400 dark:hover:border-blue-400'
                }`}
              >
                响应监控
              </button>
              <button 
                onClick={() => setActiveTab('config-manager')}
                className={`inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium focus:outline-none transition ${
                  activeTab === 'config-manager' 
                    ? 'border-blue-600 text-blue-700 dark:text-blue-300 dark:border-blue-400' 
                    : 'border-transparent text-gray-600 hover:border-blue-300 hover:text-blue-600 dark:text-gray-300 dark:hover:text-blue-400 dark:hover:border-blue-400'
                }`}
              >
                配置管理
              </button>
            </div>
            {/* 新增网卡选择入口 */}
            <button
              className="ml-4 px-3 py-1 rounded border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-800 dark:text-gray-100 hover:bg-blue-100 dark:hover:bg-blue-900 transition"
              onClick={() => setShowSelectModal(true)}
            >
              当前网卡：{selectedInterface?.description || selectedInterface?.name || "未选择"}
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
                报文编辑
              </h2>
              <PacketEditor />
            </div>
          )}

          {activeTab === 'network-sniffer' && (
            <div className="bg-white rounded-2xl shadow-lg border border-blue-100 p-8 mb-4 dark:bg-gray-800 dark:border-gray-700">
              <h2 className="text-2xl font-semibold mb-6 text-blue-700 flex items-center gap-2 dark:text-blue-300">
                <CubeTransparentIcon className="h-6 w-6 text-blue-400" />
                网口嗅探
              </h2>
              <NetworkSniffer />
            </div>
          )}

          {activeTab === 'response-monitor' && (
            <div className="bg-white rounded-2xl shadow-lg border border-blue-100 p-8 mb-4 dark:bg-gray-800 dark:border-gray-700">
              <h2 className="text-2xl font-semibold mb-6 text-blue-700 flex items-center gap-2 dark:text-blue-300">
                <CubeTransparentIcon className="h-6 w-6 text-blue-400" />
                响应监控
              </h2>
              <ResponseMonitor />
            </div>
          )}

          {activeTab === 'config-manager' && (
            <div className="bg-white rounded-2xl shadow-lg border border-blue-100 p-8 mb-4 dark:bg-gray-800 dark:border-gray-700">
              <h2 className="text-2xl font-semibold mb-6 text-blue-700 flex items-center gap-2 dark:text-blue-300">
                <CubeTransparentIcon className="h-6 w-6 text-blue-400" />
                配置管理
              </h2>
              <div className="text-center py-12 text-gray-500 dark:text-gray-400">
                <p className="text-lg">配置管理功能即将到来...</p>
                <p className="text-sm mt-2">用于管理网络配置、模板设置和应用偏好等</p>
              </div>
            </div>
          )}
        </section>
      </main>
      {/* 底部版权 */}
      <footer className="bg-white border-t border-blue-100 py-4 text-center text-gray-400 text-sm shadow-inner dark:bg-gray-900 dark:border-gray-700 dark:text-gray-500">
        © 2025 比达发包器 | 基于 Tauri + React + Tailwind CSS
      </footer>
      
      {/* Toast 通知容器 */}
      <ToastContainer toasts={toasts} removeToast={removeToast} />
    </div>
  );
}

function App() {
  return (
    <ToastProvider>
      <NetworkInterfaceProvider>
        <AppContent />
      </NetworkInterfaceProvider>
    </ToastProvider>
  );
}

export default App;
