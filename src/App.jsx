import React from "react";

function App() {
  return (
    <main className="min-h-screen bg-gray-50 flex flex-col items-center py-10">
      <header className="mb-8">
        <h1 className="text-4xl font-bold text-blue-600 mb-2">比达发包器</h1>
        <p className="text-gray-500 text-lg">以太网报文编辑、发送与抓包工具</p>
      </header>
      <section className="w-full max-w-4xl bg-white rounded-lg shadow p-8 flex flex-col gap-8">
        {/* 报文编辑区 */}
        <div className="border-b pb-6">
          <h2 className="text-2xl font-semibold mb-4">报文编辑</h2>
          <div className="text-gray-400">（功能开发中...）</div>
        </div>
        {/* 报文发送与抓包区 */}
        <div className="border-b pb-6">
          <h2 className="text-2xl font-semibold mb-4">报文发送与抓包</h2>
          <div className="text-gray-400">（功能开发中...）</div>
        </div>
        {/* 配置管理区 */}
        <div>
          <h2 className="text-2xl font-semibold mb-4">配置管理</h2>
          <div className="text-gray-400">（功能开发中...）</div>
        </div>
      </section>
      <footer className="mt-10 text-gray-400 text-sm">© 2024 比达发包器 | 基于 Tauri + React + Tailwind CSS</footer>
    </main>
  );
}

export default App;
