import React from "react";
import PacketEditor from "./features/packetEditor";
import { CubeTransparentIcon } from "@heroicons/react/24/outline";

function App() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-gray-100 flex flex-col">
      {/* Tailwind UI 导航栏 */}
      <nav className="bg-white border-b border-blue-100 shadow-sm">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between">
            <div className="flex items-center gap-2">
              <CubeTransparentIcon className="h-8 w-8 text-blue-600" />
              <span className="text-2xl font-bold text-blue-700 tracking-tight">比达发包器</span>
            </div>
            <div className="hidden md:flex gap-8">
              <a href="#" className="inline-flex items-center px-1 pt-1 border-b-2 border-blue-600 text-sm font-medium text-blue-700 focus:outline-none">报文编辑</a>
              <a href="#" className="inline-flex items-center px-1 pt-1 border-b-2 border-transparent text-sm font-medium text-gray-600 hover:border-blue-300 hover:text-blue-600 transition">发送与抓包</a>
              <a href="#" className="inline-flex items-center px-1 pt-1 border-b-2 border-transparent text-sm font-medium text-gray-600 hover:border-blue-300 hover:text-blue-600 transition">配置管理</a>
            </div>
            {/* 移动端菜单可后续补充 */}
          </div>
        </div>
      </nav>
      {/* 主内容区 */}
      <main className="flex-1 flex flex-col items-center py-10">
        <section className="w-full max-w-4xl flex flex-col gap-8">
          {/* 报文编辑区 */}
          <div className="bg-white rounded-2xl shadow-lg border border-blue-100 p-8 mb-4">
            <h2 className="text-2xl font-semibold mb-6 text-blue-700 flex items-center gap-2">
              <CubeTransparentIcon className="h-6 w-6 text-blue-400" />
              报文编辑
            </h2>
            <PacketEditor />
          </div>
        </section>
      </main>
      {/* 底部版权 */}
      <footer className="bg-white border-t border-blue-100 py-4 text-center text-gray-400 text-sm shadow-inner">
        © 2025 比达发包器 | 基于 Tauri + React + Tailwind CSS
      </footer>
    </div>
  );
}

export default App;
