//! v2 响应监控 / RTT（M6）。
//!
//! 根治 v1「RTT 不准」的根因：
//!   • v1 把测试包发出去后，靠**前端定时轮询** `get_captured_packets` 把抓到的包
//!     回灌给监控器才触发匹配——RTT = `start_time.elapsed()`，但这个 elapsed 取的是
//!     「前端这次轮询恰好处理到该包」的时刻，受前端轮询周期（几百 ms）支配，
//!     测出来的 RTT 实际上是「发包→前端下次轮询」的间隔，与真实链路 RTT 无关。
//!   • v2 **后端自己 pcap 抓包**，抓包线程拿到响应的瞬间就用 `Instant` 算
//!     收发时间差（now - 发包时记录的 Instant），完全不经前端、不依赖轮询频率。
//!
//! 引擎三线程：
//!   • 发送线程：按 interval 周期发 ICMP Echo / ARP 请求，发出即 `pending[seq]=Instant::now()`；
//!   • 抓包线程：pcap 抓该网卡的包，轻量解析 ICMP Echo Reply / ARP Reply，命中 pending → 算 RTT；
//!   • 超时线程：定期扫 pending，超 timeout 的判 timeout。
//!
//! 解析特意**自己实现**轻量版（只取匹配所需字段），不 import capture.rs——
//! capture 的 `parse_packet` 产出的是面向展示的 `CapturedPacket`，拿不到 ICMP id/seq。

use serde::{Deserialize, Serialize};
use specta::Type;
use std::collections::{HashMap, VecDeque};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use super::net::{list_interfaces, PacketSender};
use super::protocol::{ArpSpec, IcmpSpec, PacketSpec};

/// 结果环形缓冲上限。
const RESULTS_CAP: usize = 1000;

/// ICMP Echo 的 identifier（固定）。seq 递增，用于把响应对回发出的请求。
const ICMP_ID: u16 = 0x42BD; // 'B''D' 寓意 BitSender，纯标识无特殊含义

/// 超时线程扫描周期。
const TIMEOUT_SCAN_INTERVAL: Duration = Duration::from_millis(100);

/// 测试配置（前端下发）。
#[derive(Debug, Clone, Deserialize, Type)]
pub struct TestConfig {
    /// "ping" | "arp"。
    pub test_type: String,
    pub target_ip: String,
    pub interval_ms: u64,
    pub timeout_ms: u64,
    /// 发送总数；0 = 无限。
    pub count: u64,
}

/// 单次测试结果（推给前端）。
#[derive(Debug, Clone, Serialize, Type)]
pub struct TestResult {
    pub id: String,
    pub seq: u64,
    /// "success" | "timeout"。
    pub status: String,
    /// 成功时为 RTT 毫秒（收发 Instant 差），超时为 None。
    pub rtt_ms: Option<f64>,
    /// 结果产生时刻（UNIX 毫秒，仅供前端排序/展示）。
    pub timestamp_ms: u64,
}

/// 监控聚合统计。avg/min/max 仅对 success 的 rtt 累计。
#[derive(Debug, Clone, Serialize, Type)]
pub struct MonitorStats {
    pub total: u64,
    pub success: u64,
    pub timeout: u64,
    pub avg_rtt_ms: f64,
    pub min_rtt_ms: f64,
    pub max_rtt_ms: f64,
}

impl Default for MonitorStats {
    fn default() -> Self {
        Self {
            total: 0,
            success: 0,
            timeout: 0,
            avg_rtt_ms: 0.0,
            min_rtt_ms: 0.0,
            max_rtt_ms: 0.0,
        }
    }
}

impl MonitorStats {
    /// 计入一条结果，按 success/timeout 更新计数与 RTT 聚合。
    fn record(&mut self, result: &TestResult) {
        self.total += 1;
        match result.status.as_str() {
            "success" => {
                self.success += 1;
                if let Some(rtt) = result.rtt_ms {
                    // min：首个成功值直接置入（初值 0.0 不能参与 min 比较）。
                    if self.success == 1 || rtt < self.min_rtt_ms {
                        self.min_rtt_ms = rtt;
                    }
                    if rtt > self.max_rtt_ms {
                        self.max_rtt_ms = rtt;
                    }
                    // 增量平均：avg' = (avg*(n-1) + rtt) / n。
                    let prev = self.avg_rtt_ms * (self.success - 1) as f64;
                    self.avg_rtt_ms = (prev + rtt) / self.success as f64;
                }
            }
            _ => {
                self.timeout += 1;
            }
        }
    }
}

/// 一条待匹配的请求：发出时刻 + 类型。
struct Pending {
    sent_at: Instant,
    test_type: TestType,
}

#[derive(Clone, Copy, PartialEq)]
enum TestType {
    Ping,
    Arp,
}

impl TestType {
    fn parse(s: &str) -> Result<Self, String> {
        match s {
            "ping" => Ok(TestType::Ping),
            "arp" => Ok(TestType::Arp),
            other => Err(format!("不支持的 test_type: {other}（仅 ping/arp）")),
        }
    }
}

/// 收发匹配后的共享真值。发送/抓包/超时线程共享。
struct Shared {
    /// seq → 发出时刻。命中或超时后移除。
    pending: HashMap<u64, Pending>,
    results: VecDeque<TestResult>,
    stats: MonitorStats,
}

impl Shared {
    fn new() -> Self {
        Self {
            pending: HashMap::new(),
            results: VecDeque::with_capacity(RESULTS_CAP),
            stats: MonitorStats::default(),
        }
    }

    /// 落一条结果：入环形缓冲（最新在后，超限丢最旧）+ 更新统计。
    fn push_result(&mut self, result: TestResult) {
        self.stats.record(&result);
        if self.results.len() >= RESULTS_CAP {
            self.results.pop_front();
        }
        self.results.push_back(result);
    }
}

/// Tauri 托管状态：运行标志 + 共享真值 + 线程句柄。
pub struct MonitorState {
    running: Arc<AtomicBool>,
    shared: Arc<Mutex<Shared>>,
    handles: Mutex<Vec<std::thread::JoinHandle<()>>>,
}

impl Default for MonitorState {
    fn default() -> Self {
        Self {
            running: Arc::new(AtomicBool::new(false)),
            shared: Arc::new(Mutex::new(Shared::new())),
            handles: Mutex::new(Vec::new()),
        }
    }
}

impl MonitorState {
    /// 启动监控。幂等：先停旧的。启动即验证网卡可打开 + 能取到本机 ip/mac，失败 Err。
    pub fn start(&self, interface_name: String, config: TestConfig) -> Result<(), String> {
        self.stop()?;

        let test_type = TestType::parse(&config.test_type)?;

        // 校验目标 IP 合法（提前失败，避免线程里反复构建失败）。
        let _ = parse_ipv4_str(&config.target_ip)
            .ok_or_else(|| format!("target_ip 格式无效: {}", config.target_ip))?;

        // 取本机出口地址：从网卡列表找到该网卡的 MAC + 一个 IPv4 地址。
        let local = LocalAddr::resolve(&interface_name)?;

        // 启动即验证网卡可打开（pcap 发送句柄）。
        drop(PacketSender::open(&interface_name)?);

        // 重置共享真值。
        {
            let mut s = self.shared.lock().unwrap();
            *s = Shared::new();
        }
        self.running.store(true, Ordering::Relaxed);

        let mut handles = self.handles.lock().unwrap();

        // 发送线程：按 interval 发包，记录 pending[seq]=now。
        {
            let running = self.running.clone();
            let shared = self.shared.clone();
            let iface = interface_name.clone();
            let local = local.clone();
            let config = config.clone();
            handles.push(std::thread::spawn(move || {
                let mut sender = match PacketSender::open(&iface) {
                    Ok(s) => s,
                    Err(_) => {
                        running.store(false, Ordering::Relaxed);
                        return;
                    }
                };
                let interval = Duration::from_millis(config.interval_ms.max(1));
                let mut seq: u64 = 0;
                while running.load(Ordering::Relaxed) {
                    if config.count > 0 && seq >= config.count {
                        // 发完目标数量：不再发，但保持 running 让抓包/超时线程把
                        // 在途请求收尾。stop 由前端显式调用。
                        std::thread::sleep(interval);
                        continue;
                    }
                    let bytes = match build_probe(test_type, &local, &config.target_ip, seq) {
                        Ok(b) => b,
                        Err(_) => {
                            running.store(false, Ordering::Relaxed);
                            return;
                        }
                    };
                    // 先登记 pending 再发：避免「发出极快收到响应」时抓包线程找不到 pending。
                    {
                        let mut s = shared.lock().unwrap();
                        s.pending.insert(
                            seq,
                            Pending {
                                sent_at: Instant::now(),
                                test_type,
                            },
                        );
                    }
                    let _ = sender.send(&bytes);
                    seq += 1;
                    std::thread::sleep(interval);
                }
            }));
        }

        // 抓包线程：pcap 抓包 → 轻量解析 → 命中 pending → 算 RTT。
        {
            let running = self.running.clone();
            let shared = self.shared.clone();
            let device = pcap::Device::list()
                .map_err(|e| format!("枚举网卡失败: {e}"))?
                .into_iter()
                .find(|d| d.name == interface_name)
                .ok_or_else(|| format!("未找到网卡: {interface_name}"))?;
            let mut cap = pcap::Capture::from_device(device)
                .map_err(|e| format!("创建捕获实例失败: {e}"))?
                .promisc(true)
                .snaplen(65535)
                .timeout(250)
                .open()
                .map_err(|e| format!("打开网卡 {interface_name} 失败: {e}"))?;
            let target_ip = config.target_ip.clone();
            handles.push(std::thread::spawn(move || {
                while running.load(Ordering::Relaxed) {
                    match cap.next_packet() {
                        Ok(packet) => {
                            let now = Instant::now();
                            if let Some(resp) = parse_response(packet.data, &target_ip) {
                                let mut s = shared.lock().unwrap();
                                if let Some((seq, sent_at)) = take_match(&mut s.pending, &resp) {
                                    let rtt = now.duration_since(sent_at).as_secs_f64() * 1000.0;
                                    s.push_result(TestResult {
                                        id: uuid::Uuid::new_v4().to_string(),
                                        seq,
                                        status: "success".to_string(),
                                        rtt_ms: Some(rtt),
                                        timestamp_ms: now_millis(),
                                    });
                                }
                            }
                        }
                        Err(pcap::Error::TimeoutExpired) => continue,
                        Err(_) => {
                            std::thread::sleep(Duration::from_millis(50));
                            continue;
                        }
                    }
                }
            }));
        }

        // 超时线程：扫 pending，超 timeout → timeout 结果。
        {
            let running = self.running.clone();
            let shared = self.shared.clone();
            let timeout = Duration::from_millis(config.timeout_ms.max(1));
            handles.push(std::thread::spawn(move || {
                while running.load(Ordering::Relaxed) {
                    std::thread::sleep(TIMEOUT_SCAN_INTERVAL);
                    let mut s = shared.lock().unwrap();
                    let now = Instant::now();
                    let expired = collect_expired(&mut s.pending, now, timeout);
                    for seq in expired {
                        s.push_result(TestResult {
                            id: uuid::Uuid::new_v4().to_string(),
                            seq,
                            status: "timeout".to_string(),
                            rtt_ms: None,
                            timestamp_ms: now_millis(),
                        });
                    }
                }
            }));
        }

        Ok(())
    }

    /// 停止监控并 join 线程，回到可重启的干净状态。
    pub fn stop(&self) -> Result<(), String> {
        self.running.store(false, Ordering::Relaxed);
        let handles: Vec<_> = self.handles.lock().unwrap().drain(..).collect();
        for h in handles {
            let _ = h.join();
        }
        Ok(())
    }

    /// 最新若干条结果（最新在前）。默认 50。
    pub fn results(&self, max_count: Option<u32>) -> Vec<TestResult> {
        let max = max_count.unwrap_or(50) as usize;
        let s = self.shared.lock().unwrap();
        s.results.iter().rev().take(max).cloned().collect()
    }

    /// 当前统计快照。
    pub fn stats(&self) -> Option<MonitorStats> {
        Some(self.shared.lock().unwrap().stats.clone())
    }
}

/// 本机出口地址：从网卡列表解析出的 MAC + IPv4。
#[derive(Clone)]
struct LocalAddr {
    mac: String,
    ip: String,
}

impl LocalAddr {
    /// 从 `list_interfaces` 找到目标网卡，取其 MAC 与首个 IPv4 地址。
    /// 任一缺失即 Err——发 ARP/ICMP 必须有合法源地址，否则响应无法路由回来。
    fn resolve(interface_name: &str) -> Result<Self, String> {
        let ifaces = list_interfaces()?;
        let iface = ifaces
            .into_iter()
            .find(|i| i.name == interface_name)
            .ok_or_else(|| format!("未找到网卡: {interface_name}"))?;
        let mac = iface
            .mac
            .ok_or_else(|| format!("网卡 {interface_name} 无 MAC 地址，无法发送测试包"))?;
        // addresses 里可能混有 IPv6（addr.to_string()），筛出第一个能解析为 IPv4 的。
        let ip = iface
            .addresses
            .into_iter()
            .find(|a| parse_ipv4_str(a).is_some())
            .ok_or_else(|| format!("网卡 {interface_name} 无 IPv4 地址，无法发送测试包"))?;
        Ok(Self { mac, ip })
    }
}

/// 解析后的响应：与某条 pending 匹配所需的最小信息。
#[derive(Debug, PartialEq)]
enum Response {
    /// ICMP Echo Reply：携带 id + seq（来自 rest_of_header 高/低 16 位）。
    IcmpReply { id: u16, seq: u16 },
    /// ARP Reply：sender_ip 已确认 == target_ip（解析时过滤）。
    ArpReply,
}

/// 在 pending 中找到与响应匹配的项，命中即移除并返回 (seq, sent_at)。
///   • ICMP：按 seq 精确命中（同时校验 id 一致，过滤无关 ping）。
///   • ARP：无序号，取最早发出的未完成 ARP pending（最小 seq）做 FIFO 匹配。
fn take_match(pending: &mut HashMap<u64, Pending>, resp: &Response) -> Option<(u64, Instant)> {
    match resp {
        Response::IcmpReply { id, seq } => {
            if *id != ICMP_ID {
                return None;
            }
            let key = *seq as u64;
            match pending.get(&key) {
                Some(p) if p.test_type == TestType::Ping => {
                    let sent_at = p.sent_at;
                    pending.remove(&key);
                    Some((key, sent_at))
                }
                _ => None,
            }
        }
        Response::ArpReply => {
            let key = pending
                .iter()
                .filter(|(_, p)| p.test_type == TestType::Arp)
                .min_by_key(|(k, _)| **k)
                .map(|(k, _)| *k)?;
            let sent_at = pending.get(&key)?.sent_at;
            pending.remove(&key);
            Some((key, sent_at))
        }
    }
}

/// 扫出所有已超时的 pending seq 并从表中移除。
fn collect_expired(
    pending: &mut HashMap<u64, Pending>,
    now: Instant,
    timeout: Duration,
) -> Vec<u64> {
    let expired: Vec<u64> = pending
        .iter()
        .filter(|(_, p)| now.duration_since(p.sent_at) >= timeout)
        .map(|(k, _)| *k)
        .collect();
    for seq in &expired {
        pending.remove(seq);
    }
    expired
}

/// 构建一个测试探测包（完整以太网帧字节）。
fn build_probe(
    test_type: TestType,
    local: &LocalAddr,
    target_ip: &str,
    seq: u64,
) -> Result<Vec<u8>, String> {
    let spec = match test_type {
        TestType::Ping => PacketSpec::Icmp(IcmpSpec {
            // 目标 MAC 未知时填广播：链路上目标主机会收到并回 Echo Reply。
            dst_mac: "FF:FF:FF:FF:FF:FF".into(),
            src_mac: local.mac.clone(),
            ttl: 64,
            identification: 0,
            src_ip: local.ip.clone(),
            dst_ip: target_ip.to_string(),
            icmp_type: 8, // Echo Request
            icmp_code: 0,
            checksum: None,
            // rest_of_header = (id << 16) | seq（取 seq 低 16 位）。
            rest_of_header: ((ICMP_ID as u32) << 16) | (seq as u16 as u32),
            payload_hex: String::new(),
        }),
        TestType::Arp => PacketSpec::Arp(ArpSpec {
            dst_mac: "FF:FF:FF:FF:FF:FF".into(),
            src_mac: local.mac.clone(),
            hw_type: 1,
            proto_type: 0x0800,
            hw_size: 6,
            proto_size: 4,
            opcode: 1, // request
            sender_mac: local.mac.clone(),
            sender_ip: local.ip.clone(),
            target_mac: "00:00:00:00:00:00".into(),
            target_ip: target_ip.to_string(),
            payload_hex: String::new(),
        }),
    };
    spec.build().map_err(|e| e.to_string())
}

/// 轻量解析一帧，仅提取匹配响应所需信息。非目标响应返回 None。
///
/// 自实现（不复用 capture.rs）：只关心 ICMP Echo Reply 的 id/seq 与 ARP Reply 的 sender_ip。
fn parse_response(data: &[u8], target_ip: &str) -> Option<Response> {
    if data.len() < 14 {
        return None;
    }
    let ether_type = u16::from_be_bytes([data[12], data[13]]);
    match ether_type {
        0x0800 => parse_icmp_reply(&data[14..]),
        0x0806 => parse_arp_reply(&data[14..], target_ip),
        _ => None,
    }
}

/// IPv4 → ICMP Echo Reply(type=0)，取 rest_of_header 的 id/seq。
fn parse_icmp_reply(ip: &[u8]) -> Option<Response> {
    if ip.len() < 20 {
        return None;
    }
    // 仅 IPv4 + ICMP。
    if (ip[0] >> 4) != 4 || ip[9] != 1 {
        return None;
    }
    let ihl = ((ip[0] & 0x0f) as usize) * 4;
    if ihl < 20 || ip.len() < ihl + 8 {
        return None;
    }
    let icmp = &ip[ihl..];
    // type=0 Echo Reply；其余 ICMP（如 type=8 自己发的请求被回环看到）忽略。
    if icmp[0] != 0 {
        return None;
    }
    // rest_of_header = icmp[4..8]，高 16 位 id、低 16 位 seq。
    let id = u16::from_be_bytes([icmp[4], icmp[5]]);
    let seq = u16::from_be_bytes([icmp[6], icmp[7]]);
    Some(Response::IcmpReply { id, seq })
}

/// ARP Reply(opcode=2) 且 sender_ip == target_ip。
fn parse_arp_reply(arp: &[u8], target_ip: &str) -> Option<Response> {
    if arp.len() < 28 {
        return None;
    }
    let opcode = u16::from_be_bytes([arp[6], arp[7]]);
    if opcode != 2 {
        return None;
    }
    let sender_ip = format!("{}.{}.{}.{}", arp[14], arp[15], arp[16], arp[17]);
    if sender_ip == target_ip {
        Some(Response::ArpReply)
    } else {
        None
    }
}

/// 解析点分十进制 IPv4；非法返回 None（用于校验配置/筛选本机 IPv4 地址）。
fn parse_ipv4_str(s: &str) -> Option<[u8; 4]> {
    let parts: Vec<&str> = s.trim().split('.').collect();
    if parts.len() != 4 {
        return None;
    }
    let mut out = [0u8; 4];
    for (i, p) in parts.iter().enumerate() {
        out[i] = p.parse::<u8>().ok()?;
    }
    Some(out)
}

fn now_millis() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ping_pending(seq: u64, sent_at: Instant) -> (u64, Pending) {
        (
            seq,
            Pending {
                sent_at,
                test_type: TestType::Ping,
            },
        )
    }

    // ① RTT 匹配：pending[seq] 喂入一个匹配的 ICMP Echo Reply → success + rtt>0。
    #[test]
    fn icmp_reply_matches_pending_and_computes_rtt() {
        let mut pending = HashMap::new();
        // 发出时刻设为 5ms 前，制造可测的正 RTT。
        let sent_at = Instant::now() - Duration::from_millis(5);
        let (seq, p) = ping_pending(7, sent_at);
        pending.insert(seq, p);

        let resp = Response::IcmpReply {
            id: ICMP_ID,
            seq: 7,
        };
        let now = Instant::now();
        let m = take_match(&mut pending, &resp).expect("应命中 seq=7 的 pending");
        assert_eq!(m.0, 7);
        let rtt = now.duration_since(m.1).as_secs_f64() * 1000.0;
        assert!(rtt > 0.0, "RTT 应为正，得到 {rtt}");
        assert!(pending.is_empty(), "命中后应从 pending 移除");
    }

    #[test]
    fn icmp_reply_wrong_id_does_not_match() {
        let mut pending = HashMap::new();
        let (seq, p) = ping_pending(1, Instant::now());
        pending.insert(seq, p);
        // id 不是本机 ICMP_ID → 视为无关 ping，不匹配。
        let resp = Response::IcmpReply { id: 0x0001, seq: 1 };
        assert!(take_match(&mut pending, &resp).is_none());
        assert_eq!(pending.len(), 1, "未命中不应移除 pending");
    }

    #[test]
    fn arp_reply_matches_earliest_pending_fifo() {
        let mut pending = HashMap::new();
        let t0 = Instant::now() - Duration::from_millis(20);
        let t1 = Instant::now() - Duration::from_millis(10);
        pending.insert(
            5,
            Pending {
                sent_at: t1,
                test_type: TestType::Arp,
            },
        );
        pending.insert(
            3,
            Pending {
                sent_at: t0,
                test_type: TestType::Arp,
            },
        );
        // ARP reply 无序号 → 取最小 seq（最早发出）= 3。
        let m = take_match(&mut pending, &Response::ArpReply).expect("应命中最早 ARP pending");
        assert_eq!(m.0, 3);
        assert_eq!(m.1, t0);
        assert!(pending.contains_key(&5), "只应移除被匹配的那条");
    }

    // ② 超时：pending 超时 → 被 collect_expired 收走。
    #[test]
    fn pending_past_timeout_is_collected() {
        let mut pending = HashMap::new();
        let now = Instant::now();
        // 一条 200ms 前发出（超 100ms 超时），一条刚发出（未超时）。
        pending.insert(
            1,
            Pending {
                sent_at: now - Duration::from_millis(200),
                test_type: TestType::Ping,
            },
        );
        pending.insert(
            2,
            Pending {
                sent_at: now,
                test_type: TestType::Ping,
            },
        );
        let expired = collect_expired(&mut pending, now, Duration::from_millis(100));
        assert_eq!(expired, vec![1], "只有超时的 seq=1 被收走");
        assert!(pending.contains_key(&2), "未超时的应保留");
        assert!(!pending.contains_key(&1), "超时的应从 pending 移除");
    }

    #[test]
    fn timeout_produces_timeout_result_via_shared() {
        let mut shared = Shared::new();
        shared.push_result(TestResult {
            id: "x".into(),
            seq: 1,
            status: "timeout".into(),
            rtt_ms: None,
            timestamp_ms: 0,
        });
        assert_eq!(shared.stats.total, 1);
        assert_eq!(shared.stats.timeout, 1);
        assert_eq!(shared.stats.success, 0);
        assert_eq!(shared.results.len(), 1);
    }

    // ③ stats 聚合：喂若干 success rtt，断言 avg/min/max。
    #[test]
    fn stats_aggregate_avg_min_max_over_success_only() {
        let mut stats = MonitorStats::default();
        for rtt in [10.0_f64, 30.0, 20.0] {
            stats.record(&TestResult {
                id: "x".into(),
                seq: 0,
                status: "success".into(),
                rtt_ms: Some(rtt),
                timestamp_ms: 0,
            });
        }
        // 再来一条 timeout，不应影响 RTT 聚合，但计入 total/timeout。
        stats.record(&TestResult {
            id: "x".into(),
            seq: 0,
            status: "timeout".into(),
            rtt_ms: None,
            timestamp_ms: 0,
        });

        assert_eq!(stats.total, 4);
        assert_eq!(stats.success, 3);
        assert_eq!(stats.timeout, 1);
        assert_eq!(stats.min_rtt_ms, 10.0);
        assert_eq!(stats.max_rtt_ms, 30.0);
        assert!(
            (stats.avg_rtt_ms - 20.0).abs() < 1e-9,
            "avg 应为 20.0，得到 {}",
            stats.avg_rtt_ms
        );
    }

    // 解析层：构造已知字节，断言能解析出正确的 Response。
    #[test]
    fn parse_icmp_echo_reply_extracts_id_seq() {
        let mut frame = Vec::new();
        frame.extend_from_slice(&[0xaa; 6]); // dst mac
        frame.extend_from_slice(&[0xbb; 6]); // src mac
        frame.extend_from_slice(&0x0800u16.to_be_bytes()); // IPv4
        let mut ip = vec![0u8; 20];
        ip[0] = 0x45; // v4 ihl5
        ip[9] = 1; // ICMP
        frame.extend_from_slice(&ip);
        // ICMP: type=0(reply) code=0 cksum=0 id=0x42BD seq=0x0009
        frame.extend_from_slice(&[0x00, 0x00, 0x00, 0x00, 0x42, 0xBD, 0x00, 0x09]);

        let r = parse_response(&frame, "1.2.3.4").expect("应解析出 ICMP reply");
        assert_eq!(
            r,
            Response::IcmpReply {
                id: 0x42BD,
                seq: 9
            }
        );
    }

    #[test]
    fn parse_icmp_echo_request_is_ignored() {
        // type=8（请求）不是响应，应返回 None（避免把自己发的请求当响应）。
        let mut frame = Vec::new();
        frame.extend_from_slice(&[0xaa; 6]);
        frame.extend_from_slice(&[0xbb; 6]);
        frame.extend_from_slice(&0x0800u16.to_be_bytes());
        let mut ip = vec![0u8; 20];
        ip[0] = 0x45;
        ip[9] = 1;
        frame.extend_from_slice(&ip);
        frame.extend_from_slice(&[0x08, 0x00, 0x00, 0x00, 0x42, 0xBD, 0x00, 0x01]);
        assert!(parse_response(&frame, "1.2.3.4").is_none());
    }

    #[test]
    fn parse_arp_reply_matches_target_ip_only() {
        let build = |sender_ip: [u8; 4]| {
            let mut frame = Vec::new();
            frame.extend_from_slice(&[0xaa; 6]);
            frame.extend_from_slice(&[0xbb; 6]);
            frame.extend_from_slice(&0x0806u16.to_be_bytes()); // ARP
            let mut arp = vec![0x00, 0x01, 0x08, 0x00, 0x06, 0x04, 0x00, 0x02]; // opcode=2 reply
            arp.extend_from_slice(&[0xbb; 6]); // sender mac
            arp.extend_from_slice(&sender_ip); // sender ip
            arp.extend_from_slice(&[0xaa; 6]); // target mac
            arp.extend_from_slice(&[192, 168, 1, 1]); // target ip
            frame.extend_from_slice(&arp);
            frame
        };
        // sender_ip == target → 匹配。
        assert_eq!(
            parse_response(&build([192, 168, 1, 254]), "192.168.1.254"),
            Some(Response::ArpReply)
        );
        // sender_ip != target → 不匹配。
        assert!(parse_response(&build([192, 168, 1, 99]), "192.168.1.254").is_none());
    }

    #[test]
    fn build_probe_ping_is_valid_frame() {
        let local = LocalAddr {
            mac: "00:11:22:33:44:55".into(),
            ip: "192.168.1.100".into(),
        };
        let bytes = build_probe(TestType::Ping, &local, "192.168.1.1", 42).expect("应能构建");
        // 以太网(14)+IP(20)+ICMP(8) 起码 42，补到 60。
        assert!(bytes.len() >= 60);
        assert_eq!(&bytes[12..14], &[0x08, 0x00], "ether_type 应为 IPv4");
        // ICMP type 在第 34 字节。
        assert_eq!(bytes[34], 8, "应为 Echo Request");
        // rest_of_header 高 16 = ICMP_ID, 低 16 = seq=42。
        assert_eq!(&bytes[38..40], &ICMP_ID.to_be_bytes());
        assert_eq!(&bytes[40..42], &42u16.to_be_bytes());
    }

    #[test]
    fn build_probe_arp_is_valid_frame() {
        let local = LocalAddr {
            mac: "00:11:22:33:44:55".into(),
            ip: "192.168.1.100".into(),
        };
        let bytes = build_probe(TestType::Arp, &local, "192.168.1.1", 0).expect("应能构建");
        assert_eq!(&bytes[12..14], &[0x08, 0x06], "ether_type 应为 ARP");
        assert_eq!(&bytes[20..22], &[0x00, 0x01], "opcode 应为 request");
    }
}
