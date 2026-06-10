# BitSender v2 全量重写规划

> 状态：草案，待 boss review。本规划基于对 v1 全部代码（89 文件 / ~13k 行）的分析与四项决策：
> **全量重写 · TypeScript+单一Schema · 正确性优先 · 砍网卡隔离/保留监控·扩展协议·回环自测**。

---

## 1. 目标与非目标

### 重写要达成的（成功标准，按优先级）
1. **正确性可信（第一优先级）**：发出的字节 == 用户所填，校验和真实计算，golden 字节测试 + 回环自测 + CI 全程兜底。"发包工具发出的不是你填的"这一类问题彻底消除。
2. **嗅探统计准确**：每秒包数/字节数、总计数在任意流量下都准，且"列表显示"与"统计真值"语义分离、不再打架（v1 痛点，重点攻关，见 §5）。
3. **契约不再漂移**：协议字段以强类型建模，前后端共用一份 Schema 自动生成的类型，编译期即可抓字段错位。
4. **可演进**：新增一个协议 = 加一个 enum 分支 + 一份 golden，成本可控。

### 明确不做的（非目标，砍掉）
- **网卡隔离功能整体移除**：v1 它在 Windows 会损坏网卡配置、崩溃即永久丢失配置，价值低风险高。连带移除隔离任务追踪、Tab 切换守卫的隔离分支、相关 i18n 与权限模拟。
- 不引入路由库、Redux/Zustand 等重型状态管理（现有 Context 模式够用，避免过度工程化）。
- 不做 monorepo、不做插件系统、不做协议 DSL。

---

## 2. 技术栈

| 层 | v1 | v2 |
|---|---|---|
| 桌面框架 | Tauri 2 | Tauri 2（保留） |
| 后端 | Rust + pcap，`HashMap<String,String>` 字段 | Rust + pcap，**强类型协议模型** |
| 类型契约 | 无，靠字符串 key 约定 | **specta + tauri-specta 自动生成 TS 类型与类型安全 invoke 绑定** |
| 前端 | React 18 + JSX | React 18 + **TypeScript** + Vite + Tailwind |
| 前后端通信 | 全部 `invoke` 轮询 | 命令用生成的绑定；**嗅探统计走 Tauri event 推送** |
| 测试 | 仅纯函数（87 绿，核心 0 覆盖） | golden 字节 + 回环自测 + 组件测试 + 契约测试 |
| CI | Node18/pnpm8，只 build 不测 | Node22/pnpm10 frozen，**test job（cargo test + clippy + vitest + 回环）** |

### 需新增的依赖（待 boss 批准）
- 后端：`specta`、`tauri-specta`、`pnet`/`etherparse`（用于解析与校验和的成熟库，替代手写）、`pcap`（保留）。
- 前端：`typescript`、`@types/react`、`@types/react-dom`、`vitest` 类型支持。
- CI：GitHub Actions runner 上跑回环自测可能需 `CAP_NET_RAW` 或专用 job。

> ⚠️ 这些是新外部依赖，按项目约定需你点头后才会引入。`etherparse`/`pnet` 是否引入可单独决定——也可坚持手写 builder 但用它们做 golden 的参考实现。

---

## 3. 核心设计：根治字段契约

### 3.1 协议强类型建模（替代 `HashMap<String,String>`）
v1 所有字段是字符串，靠 `parse::<u8>().unwrap_or(default)` 静默回退——这是 A1 及一连串 bug 的总根源。v2 用 Rust 枚举 + 强类型 struct：

```rust
// protocol/spec.rs（示意）
pub enum PacketSpec {
    Ethernet(EthernetSpec),
    Arp(ArpSpec),
    Ipv4 { ip: Ipv4Spec, payload: L4Spec },
    Icmp(IcmpSpec),
    // 后续扩展：Ipv6, Vlan ...
}

#[derive(Serialize, Deserialize, specta::Type)]
pub struct EthernetSpec {
    pub dst_mac: MacAddr,   // 不是 String
    pub src_mac: MacAddr,
    pub ether_type: u16,
    pub payload: HexBytes,
}
```

- 解析/校验只在**输入边界**做一次（前端表单 → 命令层），核心 builder 只跟强类型打交道，**不可能"读不到字段"或静默回退**。
- 字段命名在 struct 里定死，serde + specta 保证前后端一致。

### 3.2 单一事实来源 → 自动生成 TS
- `tauri-specta` 在 build 时把所有命令签名 + `PacketSpec` 等类型导出为 `src/api/bindings.ts`。
- 前端 import 生成的类型和 `commands.sendPacket(spec)` 绑定，**字段拼错 = TS 编译失败**，契约漂移在编译期被拦截。

### 3.3 输入校验层
- MAC/IP/hex/端口等解析集中在一处，失败**返回结构化错误**（字段名 + 原因），前端高亮对应输入框——而非 v1 的静默默认值。

---

## 4. 正确性保障体系（第一优先级的兑现方式）

1. **golden 字节测试**：每协议 × 每典型配置，断言**完整帧字节**，参考值用 scapy/Wireshark 离线生成并固化。立刻钉死 ICMP 缺以太网头（B1）、TCP 校验和不算（B4）这类问题。
2. **校验和真实计算**：IP 头、TCP/UDP 伪首部校验和默认正确计算；UI 不再出现"设 0 自动计算"却没算的欺骗性文案。
3. **回环自测（loopback self-check）**：在 `lo`/Npcap loopback 上自发自收，断言收到的帧 == 发出的帧。标 `#[ignore]`，由专用 CI job / 本地带权限运行。
4. **契约测试**：前端协议集 ⊆ 后端 builder 接受集；出厂模板协议 ⊆ 编辑器协议集（拦截 v1 的 `eth`/`ethernet`、`ipv4` 模板断裂，B2/B5）。
5. **CI test job**：`cargo test` + `cargo clippy -D warnings` + `vitest run` + 回环 job。**没有绿测试不能合并**——这是后续一切不回退的前提。

---

## 5. 重点攻关：嗅探速率/计数准确（v1 痛点）

### 根因（v1）
- 前端 800ms 轮询、每次最多取 100 包 → **前端拉取速率成了吞吐瓶颈**（~125 pps 上限），超出部分被环形缓存静默挤掉。
- pps/bps 用"累计包数 / 总耗时"的**历史平均**，看不出实时速率。
- 时间戳用 `SystemTime::now()`，不是 pcap 包头时间，高负载下时序失真。
- 统计与列表是两条独立路径 → **同屏两套对不上的数字**；缓存满静默丢弃、无任何反馈。

### v2 方案
1. **捕获线程是唯一真相源**：用 pcap 包头时间戳（`ts_sec/ts_usec`）；维护原子计数器（总包/总字节/每协议）。**这些是全量真值，永不受前端是否拉取影响。**
2. **实时速率用滑动时间窗**：环形时间桶（1 秒粒度 × 保留 N 桶）计算最近 1s/5s 的 pps/bps，反映"当前"而非历史平均。
3. **统计与列表分两条通道**：
   - 统计：后端每 ~250ms 通过 **Tauri event 主动推送**（小负载、高频），前端订阅即可，不再轮询。
   - 列表：独立有界通道；UI 明确区分"**统计真值 N 包**"与"**列表展示最近 M 包**"，两个数字语义不同、不再打架。
4. **背压显式化**：列表通道满时丢弃并累加 `dropped_for_display` 计数，UI 显示"为显示已采样/丢弃 X 条，统计不受影响"——不再静默。
5. （可选）**高吞吐仅计数模式**：极高速率下后端只计数不逐包传输，进一步解耦显示与统计。

> 验收：构造已知速率的流量（如用自身批量发送以固定 pps 打 loopback），断言后端统计 pps 与设定值误差在阈值内，且列表数字与统计数字语义一致。

---

## 6. 目录结构（v2）

```
src-tauri/src/
  lib.rs              # 仅 Builder 注册 + setup，瘦
  commands/           # 命令层：薄，收强类型 PacketSpec，调 core，统一错误
  protocol/           # 协议建模(spec) + builder + 校验 + golden 测试
  capture/            # 嗅探：捕获线程、滑窗统计、event 推送、背压
  sender/             # 单发 + 批量引擎(修竞态/错误上报) + 序列引擎
  monitor/            # 响应监控：后端主动收包匹配，RTT 用收发时间戳
  export.rs           # specta 类型导出
src/
  api/                # tauri-specta 生成的 bindings + 封装
  features/{packetEditor, sniffer, sequence, monitor, templates}/
  components/ contexts/ hooks/ locales/
  types/              # 后端生成的 TS 类型
```

对比 v1：消灭 847 行的 lib.rs 上帝文件，引擎从命令里搬进 `sender/`（让模块名实归一）；删除 v1 全部死代码（TemplateManager.jsx、ResponseMonitor.jsx 旧版、孤儿 hooks、PacketSniffer 旧结构体等 ~1200 行不重写）。

---

## 7. 里程碑（垂直切片，每片端到端可验证）

> 采用"垂直切片"而非"先写完后端再写前端"：每个里程碑都交付一个可运行、可验收的能力闭环，契合正确性优先（早验证、早暴露）。时间为粗估，单人投入。

| 里程碑 | 内容 | 验收标准 | 估时 |
|---|---|---|---|
| **M0 地基** | 新分支 `rewrite/v2`；Tauri 2 + Vite + TS 骨架；specta/tauri-specta 打通"一个样例命令端到端类型安全"；CI（含 test job）立起来 | 样例命令前后端类型安全调用；CI 绿 | ~1 周 |
| **M1 协议核心 + 正确性体系** ⭐ | 强类型 `PacketSpec`（Eth/ARP/IPv4/TCP/UDP/ICMP）+ builder + 校验层 + golden 测试 + 回环自测 + 校验和正确计算 | 每协议 golden 通过；回环 self-check 通过；校验和经 Wireshark 校对 | ~2 周 |
| **M2 单发 + 预览** | PacketEditor(TS) + `build_packet_preview` + `send_packet` + hex 预览/导入导出 | 填字段→预览字节 == 发送字节 == golden | ~1 周 |
| **M3 批量发送** | 批量引擎：修 count 多线程超发竞态、打开网卡失败明确上报、任务结束清理 Map（无隔离） | count 精确不超发；失败有结构化报错；无任务句柄泄漏 | ~1 周 |
| **M4 嗅探 + 准确统计** ⭐ | 捕获线程 + 包头时间戳 + 滑窗 pps/bps + event 推送 + 背压 + 虚拟列表 | 已知速率流量下统计误差 < 阈值；列表与统计语义一致不打架 | ~1.5 周 |
| **M5 序列发送 + 模板** | 序列引擎（修 0 延迟被改 100ms、协议名统一）+ 模板（旧 localStorage 迁移或出厂重做） | 序列按设定时序发出；模板加载不退化 | ~1 周 |
| **M6 响应监控/RTT** | 后端主动收包匹配，RTT 用收发时间戳（不依赖前端轮询）；上架到 UI | ping/ARP RTT 与系统 ping 量级一致 | ~1 周 |
| **M7 扩展协议** | 受益于 M1 框架，新增 IPv6/VLAN/ICMPv6 等（按需取舍） | 每新增协议附 golden | 按需 |
| **M8 收尾** | i18n 双语 key 校验脚本、文档对齐、发布脚本、删残留、CSP/Cargo 元数据 | 双语 key 同步；release 三文件同步；文档真实 | ~0.5 周 |

⭐ = 与"正确性""统计准确"两大首要标准直接对应的关键里程碑。

---

## 8. 迁移与并存策略

- **新分支推进，旧版不动**：v1 仍可用（旧 release/旧分支），v2 在 `rewrite/v2` 推进，到 **M5 功能追平**后再切主干。重写期间用户始终有可用产物。
- **模板兼容**：v1 localStorage 模板用了不一致协议名（`ipv4`/`eth`）与字符串字段。决策点：
  - 方案 A（推荐）：出厂模板用 v2 强类型重做，旧自定义模板提供一次性迁移函数（协议名归一 + 字段映射）。
  - 方案 B：不兼容旧模板，首次启动清空并提示。
- **localStorage key** 沿用 `packet-templates`/`app-language`/`bitSender-theme`，避免用户配置丢失。

---

## 9. 风险与应对

| 风险 | 应对 |
|---|---|
| specta/tauri-specta 学习与集成成本 | M0 专门花时间打通最小闭环，验证可行再铺开 |
| 回环自测在 CI 需要 CAP_NET_RAW/特定 runner | 标 `#[ignore]`，单独 job；本地必跑，CI 尽力跑 |
| 全量重写周期长、中途烂尾 | 垂直切片，每里程碑可独立验收/可演示；旧版兜底 |
| 协议解析/校验和细节出错 | 用 etherparse/scapy 作参考实现交叉验证 golden |
| 重写期间需求漂移 | 本文档为基线，变更走 review |

---

## 10. 立即可开工的下一步（M0 清单）

1. 建分支 `rewrite/v2`（不动 `main`）。
2. 初始化 Tauri 2 + Vite + **TypeScript** 项目骨架（保留 Tailwind 配置）。
3. 接入 `specta` + `tauri-specta`，导出 `src/api/bindings.ts`，用一个 `ping(spec)` 样例命令验证"前端字段拼错 → TS 报错"。
4. 立 CI：Node 22 + pnpm10 frozen + `cargo test`/`cargo clippy`/`vitest run` 四件套，先让空测试跑绿。
5. 写第一个 golden 测试脚手架（哪怕只测一个 Ethernet 帧），确立 §4 的工作模式。

完成 M0 即证明"类型安全契约 + CI 兜底"这套地基成立，后续里程碑在其上展开。
