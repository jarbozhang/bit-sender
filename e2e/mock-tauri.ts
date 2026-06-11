import type { Page } from "@playwright/test";

/**
 * 仿真 Tauri IPC：在页面脚本运行前注入 window.__TAURI_INTERNALS__。
 * bindings.ts 里 TAURI_INVOKE(cmd, args) 直接透传到这里，返回裸数据即可
 * （specta 的 Result 包装发生在 bindings 内部）。
 */

// 黄金 TCP 帧（与 Rust 测试同构）：eth14 + ipv4 20 + tcp 20 + payload "Hello,BIT!" = 64B
export const TCP_FRAME =
  "FFFFFFFFFFFF0011223344550800" + // eth
  "450000341234400040060000C0A80164C0A80101" + // ipv4
  "D431005000000000000000005002200000000000" + // tcp
  "48656C6C6F2C42495421"; // "Hello,BIT!"

export const MOCK_NIC = {
  name: "en0",
  description: "Wi-Fi (en0)",
  mac: "AA:BB:CC:00:11:22",
  addresses: ["192.168.1.34"],
};

export async function installTauriMock(page: Page): Promise<void> {
  await page.addInitScript(
    ({ tcpFrame, nic }) => {
      // 固定主题/语言，让断言确定。init script 在 reload 时也会执行，
      // 只补缺省、不覆盖，否则会破坏"设置持久化"类断言。
      if (!localStorage.getItem("bitSender-theme")) localStorage.setItem("bitSender-theme", "dark");
      if (!localStorage.getItem("bitsender-v2-lang")) localStorage.setItem("bitsender-v2-lang", "zh-CN");

      const handlers: Record<string, (args: any) => unknown> = {
        list_interfaces_v2: () => [nic],
        build_packet_preview_v2: () => tcpFrame,
        send_packet_v2: (args: any) => ({ bytes: 64, interface: args.interfaceName }),
        "plugin:event|listen": () => 0,
        "plugin:event|unlisten": () => null,
      };

      (window as any).__TAURI_INTERNALS__ = {
        invoke: (cmd: string, args: any) => {
          const h = handlers[cmd];
          if (!h) return Promise.reject(`e2e mock: unmocked command ${cmd}`);
          return Promise.resolve(h(args));
        },
        transformCallback: (cb: unknown) => cb,
      };
    },
    { tcpFrame: TCP_FRAME, nic: MOCK_NIC },
  );
}
