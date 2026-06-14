[English](./README.md) · 中文

# 比达发包器（BitSender）

基于 **Tauri 2 + React 18 + TypeScript + Rust** 的跨平台网络报文构建 / 发送 / 抓包工具。
原始 L2 帧由 Rust 强类型构建，经 libpcap（Windows 为 Npcap）直接发送。

> 当前 `main` 为 **v2 全量重写**版本；v1 历史代码保留在 [`legacy/v1`](../../tree/legacy/v1) 分支。
> 重写背后的故事：[一个周末用 Claude Code 重写 BitSender](./docs/blog/rewriting-bitsender-with-claude.md)。

---

## 下载地址

> 进入 [Releases 页面](../../releases/latest) 后，选择最新版本，下载对应平台的安装包即可。

### Windows 用户安装依赖（Npcap）

- Windows 11 及以上用户需提前安装 [Npcap](https://npcap.com/#download)（安装时请勾选“WinPcap API 兼容模式”），否则运行时会提示“找不到 wpcap.dll”。
- Windows 10 及以下用户可使用 [WinPcap](https://www.winpcap.org/install/)，但其已停止维护，建议优先选择 Npcap。

### macOS 用户安装后处理

安装完成后需要执行以下命令移除应用的安全限制：

```bash
xattr -cr /Applications/BitSender.app
```

发包/抓包需要管理员权限（root 才能写 `/dev/bpf*`）。

### Linux 用户

需要系统依赖 `libpcap` 与 webkit2gtk 运行库；发包需 root 或 `CAP_NET_RAW`。

---

## 功能特性

- **L2–L7 强类型构建**：Ethernet II / ARP / IPv4 / IPv6 / TCP / UDP / ICMP，并支持 HTTP/1.1 明文请求作为 TCP payload 构造；全部字段可编辑，真实校验和（RFC 1071 IP 校验和、TCP/UDP 伪首部校验和、RFC 768 UDP 全零回避）。
- **报文编辑器**：右侧示波器风格实时 hex 预览，按协议层着色（以太头/网络层/传输层/应用层/载荷）；支持 Wireshark 风格 hex dump 的导入与导出。HTTP 仅构造 TCP payload 中的明文请求字节，不等同于完整 HTTP 客户端或 HTTPS/TLS。
- **测试发送 / 批量发送**：单发验证后可批量；支持设定频率，按时长 / 包数 / 手动三种停止条件，原子预扣计数保证精确发送数。
- **网口嗅探**：实时抓包列表 + 统计（pps 采用滑动窗口按“上一完整秒”计算，pcap 头时间戳，有界缓冲并显示丢弃数）。
- **序列发送**：多步报文按既定延迟依次发出，支持循环；启动前全部预构建并校验。
- **响应监控**：后端发送 ICMP / ARP 探测并用独立 pcap 匹配应答，测量 RTT。
- **模板库**：当前报文配置可存为模板（localStorage），一键加载回编辑器。
- **双语界面**（简体中文 / English）与**深浅主题**切换，均持久化。

## 技术架构（v2 核心）

**类型安全契约**：Rust 侧定义强类型 `PacketSpec`（serde tagged enum），由 [tauri-specta](https://github.com/specta-rs/tauri-specta) 在 `cargo test` 时把所有类型与命令导出为 `src/api/bindings.ts`。前端直接消费生成类型——字段或类型不匹配会在 **TypeScript 编译期**报错，根治了 v1 依赖 `HashMap<String,String>` 与静默默认值的“字段契约靠运气”问题。

```
src-tauri/src/v2/          Rust 后端
├── protocol/              每协议一个文件：*Spec + builder + 黄金字节测试
├── net.rs                 网卡枚举 + PacketSender
├── sender.rs              批量发送引擎
├── capture.rs             嗅探（捕获线程为唯一事实源，250ms 推送统计）
├── monitor.rs             响应监控（探测 + RTT）
├── sequence.rs            序列发送
└── commands.rs            全部 Tauri 命令（_v2 后缀）

src/                       React 18 + TypeScript 前端
├── api/bindings.ts        specta 生成（勿手改，cargo test 再生）
├── lib/                   api 门面 / 协议字段元数据 / hexdump / i18n / 模板
├── contexts/              network / editor / i18n / theme
└── features/              packet-editor / sniffer / sequence / monitor / templates / config
```

---

## 开发

环境要求：Node 22+、pnpm 11+、Rust stable。

```bash
pnpm install               # esbuild 构建白名单见 pnpm-workspace.yaml
pnpm tauri dev             # 完整开发（发包需 sudo：sudo pnpm tauri dev）
pnpm dev                   # 仅前端，端口 1420
pnpm tauri build           # 发布构建 → src-tauri/target/release/bundle/
```

### 测试矩阵

| 命令 | 覆盖 |
|---|---|
| `pnpm typecheck` | TypeScript 编译期契约检查 |
| `pnpm test` | vitest 前端单测 |
| `pnpm test:e2e` | Playwright UI 全流程（mock Tauri IPC；首次需 `pnpm exec playwright install chromium`） |
| `cd src-tauri && cargo test` | Rust 黄金字节测试（逐字节比对 RFC 手算参考帧）+ 重新生成 bindings.ts |
| `cd src-tauri && cargo clippy --all-targets -- -D warnings` | 零告警门禁 |

字节级正确性由 cargo 黄金测试保证，UI 流程由 e2e 保证；真实网卡收发需真机 root 手测。

---

## 发布

```bash
pnpm release            # 自动递增 minor 版本：更新版本号 → 打 tag → 推送
pnpm release:patch      # 0.1.0 -> 0.1.1
pnpm release:major      # 0.1.0 -> 1.0.0
```

推送 `v*.*.*` tag 后，GitHub Actions（`.github/workflows/tauri.yml`）自动为 macOS（Intel/ARM）、Windows、Linux 构建并发布；日常 push 由 `ci.yml` 跑 Rust 测试、clippy、前端 typecheck 与单测。

---

## 注意事项

- **管理员权限**：发包/抓包需管理员（root）权限。
- **macOS 签名**：正式分发需配置 Apple 证书签名与公证。

欢迎提交 issue 和 PR。
