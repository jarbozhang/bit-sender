# 比达发包器（bit-sender）

## 下载地址

> 进入 [Releases 页面](../../releases/latest) 后，选择最新版本，下载对应平台的安装包即可。


### Windows 用户安装依赖（Npcap）

- Windows11及以上 用户需提前安装 [Npcap](https://nmap.org/npcap/)（推荐，安装时请勾选"WinPcap API 兼容模式"），否则运行时会提示"找不到 wpcap.dll"。
- Windows10及以下 用户需提前安装 [WinPcap](https://www.winpcap.org/)，否则运行时会提示"找不到 wpcap.dll"。
- Npcap 是网络抓包/发包的底层驱动，WinPcap 已不再维护，建议优先选择 Npcap。
- Npcap下载地址：[https://npcap.com/#download](https://npcap.com/#download)
- WinPcap下载地址：[https://www.winpcap.org/install/](https://www.winpcap.org/install/)

### macOS 用户安装后处理

如果是 macOS 用户，安装完成后需要执行以下命令来移除应用的安全限制：

```bash
xattr -cr /Applications/bit-sender.app
# 或者你下载的路径
xattr -cr /path/to/bit-sender.app
```


---

基于 **Tauri + React** 的跨平台高性能网络发包工具，支持自定义协议编辑、批量发送、网卡选择、实时流量统计，并集成自动化构建与多平台分发。

---

## 项目特性

- **跨平台支持**：一套代码，支持 Windows、macOS（原生应用）、Linux（如依赖满足）。
- **现代前端**：采用 React + Tailwind CSS，界面美观，交互流畅。
- **协议灵活编辑**：支持以太网、ARP、IPv4、UDP、TCP 等多种协议字段自定义填写，自动生成报文内容。
- **报文内容预览**：实时预览报文的 16 进制内容，便于调试和验证。
- **网卡选择与流量图**：全局唯一网卡选择，支持弹窗选择和流量实时展示，所有发包操作共用同一网卡。
- **测试发送与批量发送**：
  - 测试发送：编辑内容后可先测试，成功后才能批量发送。
  - 批量发送：支持设置每秒发送次数，后端高性能实现，实时统计发送速率、总数、开始时间，可随时终止任务。
- **高性能后端**：Rust 实现，批量任务只 open 一次网卡设备，极大提升性能。
- **全局状态管理**：React Context 管理网卡选择、Toast 通知等全局状态。
- **自动化构建**：内置 GitHub Actions 工作流，支持一键打包三平台应用，自动上传构建产物。
- **安全与权限**：仅在本地运行，无需上传数据，发包需管理员权限。

---

## 使用方式

### 1. 安装依赖

建议使用 [pnpm](https://pnpm.io/)：

```bash
pnpm install
```

### 2. 本地开发

```bash
pnpm tauri dev
```
或分别运行前端和 Tauri 后端：

```bash
pnpm dev         # 启动前端
pnpm tauri       # 启动 Tauri 后端
```

### 3. 打包构建

```bash
pnpm tauri build
```
构建产物在 `src-tauri/target/release/bundle/` 目录下。

### 4. 使用管理员权限运行（启用网卡独占功能）

**macOS 用户**：
```bash
# 使用管理员权限运行构建的应用
sudo ./src-tauri/target/release/bundle/macos/bit-sender.app/Contents/MacOS/bit-sender

# 或在开发模式下测试
sudo pnpm tauri dev
```

**Windows 用户**：
- 右键点击应用，选择"以管理员身份运行"
- 或在 PowerShell 中以管理员身份运行

**Linux 用户**：
```bash
# 使用 sudo 运行
sudo ./bit-sender
```

### 5. 主要功能入口

- **报文编辑**：主界面填写协议字段，实时预览报文内容。
- **网卡选择**：右上角"当前网卡"按钮，弹窗选择并显示流量图。
- **测试发送**：填写完毕后点击"测试发送"，成功后可批量发送。
- **批量发送**：设置发送频率，实时统计，支持终止任务。

### 6. 自动化发布

**一键发布脚本**：
```bash
# 自动递增minor版本并发布
pnpm release

# 指定版本类型
pnpm release:patch   # 修复版本 (0.1.0 -> 0.1.1)
pnpm release:minor   # 功能版本 (0.1.0 -> 0.2.0)
pnpm release:major   # 重大版本 (0.1.0 -> 1.0.0)

# 指定具体版本
./scripts/release.sh 1.2.3
```

**功能特点**：
- 自动更新 package.json 和 Cargo.toml 版本号
- 创建 Git 标签并推送到远程仓库
- 触发 GitHub Actions 自动构建和发布
- 支持语义化版本管理
- 完整的安全检查和确认流程

详细使用说明请查看 [`scripts/README.md`](scripts/README.md)

### 7. CI/CD 自动化

- 推送 tag 或手动触发 workflow，会自动为 macOS、Windows（如解开注释可支持 Linux）构建应用并上传产物。
- 相关配置见 `.github/workflows/tauri.yml`。

---

## 依赖说明

- **前端**：React 18、Tailwind CSS、@tauri-apps/api
- **后端**：Tauri 2.x、Rust、pcap、tokio、serde
- **构建工具**：pnpm、vite

---

## 注意事项

- **管理员权限**：发包操作需管理员/root 权限，部分平台需手动授权。
- **macOS 签名**：如需正式分发，需配置 Apple 证书并签名、公证。

---

## ⚠️ 关于 Ubuntu/Linux 构建支持

> **注意：** 由于 Tauri v2 依赖的 `libsoup-3.0`、`javascriptcoregtk-4.1` 等系统库在 Ubuntu 22.04/24.04 官方仓库缺失，当前暂不支持在 Ubuntu/Linux 平台自动构建。如需 Linux 支持，建议关注 Tauri 官方后续适配进展，或尝试手动安装相关依赖、降级 Tauri 版本。

---

## 目录结构简述

- `src/`：前端 React 代码
  - `components/`：通用 UI 组件
  - `features/packetEditor/`：报文编辑核心功能
  - `contexts/`：全局状态管理
  - `hooks/`：自定义 hooks
- `src-tauri/`：Tauri Rust 后端
  - `network/`：网卡、发包、批量任务等核心逻辑
- `.github/workflows/`：CI/CD 自动化配置

---

## TODO List

短期优化（代码层面）
批量发包时去除 sleep，或每次 sleep 更长时间、每次 burst 多个包。
只在主线程统计速率，发包线程尽量无锁。
允许用户自定义“最大速率”模式（即尽快发包）。
中期优化（平台相关）
Linux/macOS 下可考虑 raw socket 或 libnet。
Windows 下 Npcap 性能有限，极限提升空间不大。
长期优化（极限性能）
研究 DPDK、PF_RING、XDP 等高性能方案，但需牺牲跨平台性和开发复杂度。

---

## 开发&贡献

欢迎提交 issue 和 PR，完善更多协议、抓包、流量分析等功能！
