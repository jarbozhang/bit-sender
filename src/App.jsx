import React, { useState } from "react";
import PacketEditor from "./features/packetEditor";
import { CubeTransparentIcon } from "@heroicons/react/24/outline";
import { useSystemTheme } from "./hooks/useSystemTheme";
import Button from "./components/Button";
import { ToastContainer } from "./components/Toast";
import { useToast } from "./hooks/useToast";
import { useNetwork } from "./hooks/useNetwork";

function App() {
  useSystemTheme();
  const { toasts, removeToast, showSuccess, showError, showInfo } = useToast();
  const { sendPacket } = useNetwork();
  const [isTestSending, setIsTestSending] = useState(false);

  const handleTestSend = async () => {
    setIsTestSending(true);
    try {
      // 获取当前报文编辑区的数据
      // TODO: 从 PacketEditor 组件获取当前数据
      const packetData = {
        protocol: "ethernet",
        fields: {
          dst_mac: "00:11:22:33:44:55",
          src_mac: "AA:BB:CC:DD:EE:FF",
          ether_type: "0800"
        },
        payload: "48656C6C6F20576F726C64" // "Hello World" in hex
      };

      const result = await sendPacket(packetData);
      showSuccess(result.message);
    } catch (error) {
      showError(error.message);
    } finally {
      setIsTestSending(false);
    }
  };

  const handleBatchSend = () => {
    // TODO: 跳转到发送与抓包页面
    showInfo("即将跳转到发送与抓包页面...");
  };

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
              <a href="#" className="inline-flex items-center px-1 pt-1 border-b-2 border-blue-600 text-sm font-medium text-blue-700 focus:outline-none dark:text-blue-300 dark:border-blue-400">报文编辑</a>
              <a href="#" className="inline-flex items-center px-1 pt-1 border-b-2 border-transparent text-sm font-medium text-gray-600 hover:border-blue-300 hover:text-blue-600 transition dark:text-gray-300 dark:hover:text-blue-400 dark:hover:border-blue-400">发送与抓包</a>
              <a href="#" className="inline-flex items-center px-1 pt-1 border-b-2 border-transparent text-sm font-medium text-gray-600 hover:border-blue-300 hover:text-blue-600 transition dark:text-gray-300 dark:hover:text-blue-400 dark:hover:border-blue-400">配置管理</a>
            </div>
            {/* 移动端菜单可后续补充 */}
          </div>
        </div>
      </nav>
      {/* 主内容区 */}
      <main className="flex-1 flex flex-col items-center py-10 dark:bg-gray-900 dark:text-gray-200">
        <section className="w-full max-w-4xl flex flex-col gap-8">
          {/* 报文编辑区 */}
          <div className="bg-white rounded-2xl shadow-lg border border-blue-100 p-8 mb-4 dark:bg-gray-800 dark:border-gray-700">
            <h2 className="text-2xl font-semibold mb-6 text-blue-700 flex items-center gap-2 dark:text-blue-300">
              <CubeTransparentIcon className="h-6 w-6 text-blue-400" />
              报文编辑
            </h2>
            <PacketEditor />
            
            {/* 操作按钮区域 */}
            <div className="mt-8 pt-6 border-t border-gray-200 dark:border-gray-700">
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Button
                  variant="primary"
                  size="lg"
                  loading={isTestSending}
                  onClick={handleTestSend}
                  className="flex-1 sm:flex-none"
                >
                  {isTestSending ? "发送中..." : "测试发送"}
                </Button>
                <Button
                  variant="secondary"
                  size="lg"
                  onClick={handleBatchSend}
                  className="flex-1 sm:flex-none"
                >
                  批量发送
                </Button>
              </div>
            </div>
          </div>
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

export default App;
