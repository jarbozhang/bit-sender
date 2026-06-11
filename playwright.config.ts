import { defineConfig } from "@playwright/test";

// e2e：headless 浏览器跑 Vite 页面，Tauri IPC 由 e2e/mock-tauri.ts 仿真。
// Rust 后端正确性由 cargo 黄金字节测试覆盖，这里只验 UI 全流程。
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:1420",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "pnpm dev",
    port: 1420,
    reuseExistingServer: true,
    timeout: 30_000,
  },
});
