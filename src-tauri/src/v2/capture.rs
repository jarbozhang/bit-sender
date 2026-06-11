//! v2 网口嗅探 + 准确统计（M4）。
//!
//! 根治 v1「每秒多少包算不准」的根因：
//!   • **捕获线程是唯一真值源**：total/bytes/每协议计数全量由捕获线程累加，
//!     绝不依赖前端拉取频率（v1 把统计塞进 `get_packets`，前端不拉就不更新，
//!     而且按累计平均算 pps，越跑越平、反映不了当前速率）；
//!   • **时间戳用 pcap 包头** `header.ts`（tv_sec/tv_usec），不用 `SystemTime::now()`——
//!     抓到的就是内核打的时间，重放/回灌也对得上；
//!   • **实时速率用滑动时间窗**：1 秒粒度环形桶，pps/bps = 最近一个「完整秒」桶的计数，
//!     反映「当前」速率而非累计平均；
//!   • **统计经 Tauri event 主动推送**（250ms 一次），前端只管渲染；
//!   • **包列表显式背压**：有界缓冲满即丢弃并累加 `dropped_for_display`，前端可见，绝不静默。

use serde::Serialize;
use specta::Type;
use std::collections::VecDeque;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::{AppHandle, Emitter};

/// 推送统计的 Tauri event 名。
pub const STATS_EVENT: &str = "capture://stats";

/// 包列表缓冲上限。满时丢弃最旧的并计入 `dropped_for_display`。
const PACKET_BUFFER_CAP: usize = 4096;

/// 滑动时间窗保留桶数（秒）。
const WINDOW_BUCKETS: u64 = 60;

/// 统计推送周期。
const STATS_INTERVAL: Duration = Duration::from_millis(250);

/// 捕获统计（真值，全量累计 + 实时速率）。经 event 推送给前端。
#[derive(Debug, Clone, Serialize, Type)]
pub struct CaptureStats {
    pub total_packets: u64,
    pub total_bytes: u64,
    /// 实时包速率（最近一个完整秒桶的包数）。
    pub pps: f64,
    /// 实时字节速率（最近一个完整秒桶的字节数）。
    pub bps: f64,
    pub tcp: u64,
    pub udp: u64,
    pub arp: u64,
    pub icmp: u64,
    pub other: u64,
    /// 因包列表缓冲满被丢弃的包数（不影响统计真值，仅影响前端可见列表）。
    pub dropped_for_display: u64,
}

impl Default for CaptureStats {
    fn default() -> Self {
        Self {
            total_packets: 0,
            total_bytes: 0,
            pps: 0.0,
            bps: 0.0,
            tcp: 0,
            udp: 0,
            arp: 0,
            icmp: 0,
            other: 0,
            dropped_for_display: 0,
        }
    }
}

/// 单个解析后的包，供前端列表展示。
#[derive(Debug, Clone, Serialize, Type)]
pub struct CapturedPacket {
    pub id: String,
    /// 包头时间戳（毫秒，UNIX epoch）。来自 pcap `header.ts`，非本地时钟。
    pub timestamp_ms: u64,
    pub protocol: String,
    pub src_mac: String,
    pub dst_mac: String,
    pub src_ip: Option<String>,
    pub dst_ip: Option<String>,
    pub src_port: Option<u16>,
    pub dst_port: Option<u16>,
    pub size: u64,
    pub info: String,
}

/// 一个秒桶：记录它代表的「秒」以及该秒内的包数/字节数。
#[derive(Clone, Copy, Default)]
struct Bucket {
    sec: u64,
    packets: u64,
    bytes: u64,
}

/// 滑动时间窗：环形 1 秒桶。按包头时间戳分桶，pps/bps 取最近一个完整秒。
///
/// 算法：桶下标 = `sec % WINDOW_BUCKETS`。写入时若该槽存的 `sec` 与目标不符，
/// 说明是上一轮（≥60 秒前）的陈旧桶，先清零再累加——环形复用，无需逐秒清扫。
struct SlidingWindow {
    buckets: [Bucket; WINDOW_BUCKETS as usize],
    /// 已观测到的最大秒（用于判断「当前」与「完整秒」）。
    latest_sec: u64,
}

impl SlidingWindow {
    fn new() -> Self {
        Self {
            buckets: [Bucket::default(); WINDOW_BUCKETS as usize],
            latest_sec: 0,
        }
    }

    /// 记录一个包（按其包头秒分桶）。
    fn record(&mut self, sec: u64, bytes: u64) {
        let idx = (sec % WINDOW_BUCKETS) as usize;
        let b = &mut self.buckets[idx];
        if b.sec != sec {
            // 陈旧桶（环形复用到了新的一秒），重置。
            b.sec = sec;
            b.packets = 0;
            b.bytes = 0;
        }
        b.packets += 1;
        b.bytes += bytes;
        if sec > self.latest_sec {
            self.latest_sec = sec;
        }
    }

    /// 读取最近一个「完整秒」的 (pps, bps)。
    ///
    /// 取 `latest_sec - 1`：正在进行中的那一秒（latest_sec）数据不全，
    /// 直接报会在每秒开头被低估；取上一整秒更稳更准。
    /// 若该桶已被环形覆盖（即对应秒已不在窗口内），返回 0。
    fn rate(&self) -> (f64, f64) {
        if self.latest_sec == 0 {
            return (0.0, 0.0);
        }
        let target = self.latest_sec - 1;
        let idx = (target % WINDOW_BUCKETS) as usize;
        let b = &self.buckets[idx];
        if b.sec == target {
            (b.packets as f64, b.bytes as f64)
        } else {
            (0.0, 0.0)
        }
    }
}

/// 捕获过程的共享状态（真值源）。捕获线程写，命令/推送线程读。
struct Shared {
    // 累计真值（持锁更新；250ms 推送 + 解析在同线程，锁竞争极低）。
    total_packets: u64,
    total_bytes: u64,
    tcp: u64,
    udp: u64,
    arp: u64,
    icmp: u64,
    other: u64,
    dropped_for_display: u64,
    window: SlidingWindow,
    /// 包列表缓冲（显式有界，满时丢最旧）。
    buffer: VecDeque<CapturedPacket>,
}

impl Shared {
    fn new() -> Self {
        Self {
            total_packets: 0,
            total_bytes: 0,
            tcp: 0,
            udp: 0,
            arp: 0,
            icmp: 0,
            other: 0,
            dropped_for_display: 0,
            window: SlidingWindow::new(),
            buffer: VecDeque::with_capacity(PACKET_BUFFER_CAP),
        }
    }

    fn snapshot(&self) -> CaptureStats {
        let (pps, bps) = self.window.rate();
        CaptureStats {
            total_packets: self.total_packets,
            total_bytes: self.total_bytes,
            pps,
            bps,
            tcp: self.tcp,
            udp: self.udp,
            arp: self.arp,
            icmp: self.icmp,
            other: self.other,
            dropped_for_display: self.dropped_for_display,
        }
    }
}

/// Tauri 托管状态：持有运行标志、共享真值、线程句柄。
pub struct CaptureState {
    running: Arc<AtomicBool>,
    shared: Arc<Mutex<Shared>>,
    /// 捕获线程 + 推送线程句柄，stop 时 join。
    handles: Mutex<Vec<std::thread::JoinHandle<()>>>,
}

impl Default for CaptureState {
    fn default() -> Self {
        Self {
            running: Arc::new(AtomicBool::new(false)),
            shared: Arc::new(Mutex::new(Shared::new())),
            handles: Mutex::new(Vec::new()),
        }
    }
}

impl CaptureState {
    /// 启动捕获。幂等：已在跑先停。启动即验证网卡可打开，失败 Err。
    pub fn start(&self, interface_name: String, app: AppHandle) -> Result<(), String> {
        // 幂等：先停掉旧的（并 join，确保旧线程已退出、状态干净）。
        self.stop()?;

        // 启动即验证网卡可打开（修 v1 静默失败）。
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
            .buffer_size(4 * 1024 * 1024)
            .open()
            .map_err(|e| {
                format!(
                    "打开网卡 {interface_name} 失败：通常是权限问题。\n解决：\n  • macOS/Linux: sudo 运行，或 sudo setcap cap_net_raw+ep <程序>\n  • Windows: 安装 Npcap 并以管理员运行\n原始错误: {e}"
                )
            })?;

        // 重置共享真值到干净状态。
        {
            let mut s = self.shared.lock().unwrap();
            *s = Shared::new();
        }
        self.running.store(true, Ordering::Relaxed);

        let mut handles = self.handles.lock().unwrap();

        // 捕获线程：抓包 → 解析 → 更新真值 + 入缓冲。
        {
            let running = self.running.clone();
            let shared = self.shared.clone();
            handles.push(std::thread::spawn(move || {
                while running.load(Ordering::Relaxed) {
                    match cap.next_packet() {
                        Ok(packet) => {
                            let sec = ts_secs(&packet.header.ts);
                            let ms = ts_millis(&packet.header.ts);
                            // 用包头记录的真实帧长 len（可能 > caplen，统计要算真长）。
                            let size = packet.header.len as u64;
                            let parsed = parse_packet(packet.data, ms, size);

                            let mut s = shared.lock().unwrap();
                            s.total_packets += 1;
                            s.total_bytes += size;
                            s.window.record(sec, size);
                            match parsed.protocol.as_str() {
                                "tcp" => s.tcp += 1,
                                "udp" => s.udp += 1,
                                "arp" => s.arp += 1,
                                "icmp" => s.icmp += 1,
                                _ => s.other += 1,
                            }
                            // 显式背压：满则丢最旧并计数（前端可见）。
                            if s.buffer.len() >= PACKET_BUFFER_CAP {
                                s.buffer.pop_front();
                                s.dropped_for_display += 1;
                            }
                            s.buffer.push_back(parsed);
                        }
                        Err(pcap::Error::TimeoutExpired) => continue,
                        Err(_) => {
                            // 偶发错误不退出，稍等再试。
                            std::thread::sleep(Duration::from_millis(50));
                            continue;
                        }
                    }
                }
            }));
        }

        // 推送线程：每 250ms emit 一次统计。
        {
            let running = self.running.clone();
            let shared = self.shared.clone();
            handles.push(std::thread::spawn(move || {
                while running.load(Ordering::Relaxed) {
                    std::thread::sleep(STATS_INTERVAL);
                    let stats = shared.lock().unwrap().snapshot();
                    let _ = app.emit(STATS_EVENT, &stats);
                }
            }));
        }

        Ok(())
    }

    /// 停止捕获并 join 线程，回到可重启的干净状态。
    pub fn stop(&self) -> Result<(), String> {
        self.running.store(false, Ordering::Relaxed);
        let handles: Vec<_> = self.handles.lock().unwrap().drain(..).collect();
        for h in handles {
            let _ = h.join();
        }
        Ok(())
    }

    /// 当前统计快照（无捕获时也返回默认零值的 Some，便于前端统一渲染）。
    pub fn stats(&self) -> Option<CaptureStats> {
        Some(self.shared.lock().unwrap().snapshot())
    }

    /// 拉取最新的若干包（最新在前）。默认 100。拉取不影响统计真值。
    pub fn packets(&self, max_count: Option<u32>) -> Vec<CapturedPacket> {
        let max = max_count.unwrap_or(100) as usize;
        let s = self.shared.lock().unwrap();
        s.buffer.iter().rev().take(max).cloned().collect()
    }
}

/// pcap 包头 timeval → UNIX 秒。tv_sec/tv_usec 在不同平台宽度不一，统一转 i64 再取。
fn ts_secs(ts: &libc::timeval) -> u64 {
    ts.tv_sec.max(0) as u64
}

/// pcap 包头 timeval → UNIX 毫秒。
fn ts_millis(ts: &libc::timeval) -> u64 {
    let secs = ts.tv_sec.max(0) as u64;
    // tv_usec 在 macOS 为 i32、Linux 为 i64：Linux 上此转换"多余"但 macOS 必需
    #[allow(clippy::unnecessary_cast)]
    let usecs = (ts.tv_usec as i64).max(0) as u64;
    secs * 1000 + usecs / 1000
}

/// 解析以太网帧 → CapturedPacket。`size`/`timestamp_ms` 由调用方（用包头）给出。
///
/// 干净重写，不 import v1。识别 IPv4(TCP/UDP/ICMP)、ARP，其余归 other。
fn parse_packet(data: &[u8], timestamp_ms: u64, size: u64) -> CapturedPacket {
    let id = uuid::Uuid::new_v4().to_string();
    let mut pkt = CapturedPacket {
        id,
        timestamp_ms,
        protocol: "other".to_string(),
        src_mac: String::new(),
        dst_mac: String::new(),
        src_ip: None,
        dst_ip: None,
        src_port: None,
        dst_port: None,
        size,
        info: String::new(),
    };

    if data.len() < 14 {
        pkt.info = "短帧（不足以太网头）".to_string();
        return pkt;
    }

    pkt.dst_mac = mac_str(&data[0..6]);
    pkt.src_mac = mac_str(&data[6..12]);
    let ether_type = u16::from_be_bytes([data[12], data[13]]);

    match ether_type {
        0x0800 => parse_ipv4(&data[14..], &mut pkt),
        0x0806 => parse_arp(&data[14..], &mut pkt),
        _ => {
            pkt.info = format!("EtherType 0x{ether_type:04X}");
        }
    }
    pkt
}

fn mac_str(b: &[u8]) -> String {
    format!(
        "{:02x}:{:02x}:{:02x}:{:02x}:{:02x}:{:02x}",
        b[0], b[1], b[2], b[3], b[4], b[5]
    )
}

fn parse_ipv4(data: &[u8], pkt: &mut CapturedPacket) {
    if data.len() < 20 {
        pkt.protocol = "other".to_string();
        pkt.info = "短 IPv4 头".to_string();
        return;
    }
    let ihl = ((data[0] & 0x0f) as usize) * 4;
    let ttl = data[8];
    let proto = data[9];
    let src_ip = format!("{}.{}.{}.{}", data[12], data[13], data[14], data[15]);
    let dst_ip = format!("{}.{}.{}.{}", data[16], data[17], data[18], data[19]);
    pkt.src_ip = Some(src_ip);
    pkt.dst_ip = Some(dst_ip);

    let l4 = if data.len() > ihl { &data[ihl..] } else { &[] };
    match proto {
        6 => {
            pkt.protocol = "tcp".to_string();
            if l4.len() >= 20 {
                let sp = u16::from_be_bytes([l4[0], l4[1]]);
                let dp = u16::from_be_bytes([l4[2], l4[3]]);
                pkt.src_port = Some(sp);
                pkt.dst_port = Some(dp);
                let flags = l4[13];
                let mut fl = Vec::new();
                if flags & 0x02 != 0 {
                    fl.push("SYN");
                }
                if flags & 0x10 != 0 {
                    fl.push("ACK");
                }
                if flags & 0x01 != 0 {
                    fl.push("FIN");
                }
                if flags & 0x04 != 0 {
                    fl.push("RST");
                }
                if flags & 0x08 != 0 {
                    fl.push("PSH");
                }
                if flags & 0x20 != 0 {
                    fl.push("URG");
                }
                let fs = if fl.is_empty() {
                    String::new()
                } else {
                    format!(" [{}]", fl.join(", "))
                };
                pkt.info = format!("{sp} → {dp}{fs}");
            } else {
                pkt.info = "TCP（短头）".to_string();
            }
        }
        17 => {
            pkt.protocol = "udp".to_string();
            if l4.len() >= 8 {
                let sp = u16::from_be_bytes([l4[0], l4[1]]);
                let dp = u16::from_be_bytes([l4[2], l4[3]]);
                let len = u16::from_be_bytes([l4[4], l4[5]]);
                pkt.src_port = Some(sp);
                pkt.dst_port = Some(dp);
                pkt.info = format!("{} → {} Len={}", sp, dp, len.saturating_sub(8));
            } else {
                pkt.info = "UDP（短头）".to_string();
            }
        }
        1 => {
            pkt.protocol = "icmp".to_string();
            if l4.len() >= 2 {
                let t = l4[0];
                let c = l4[1];
                pkt.info = match t {
                    0 => "Echo reply".to_string(),
                    8 => "Echo request".to_string(),
                    3 => format!("Destination unreachable (code {c})"),
                    11 => format!("Time exceeded (TTL={ttl})"),
                    _ => format!("Type {t} Code {c}"),
                };
            } else {
                pkt.info = "ICMP（短头）".to_string();
            }
        }
        _ => {
            pkt.protocol = "other".to_string();
            pkt.info = format!("IPv4 proto {proto} TTL={ttl}");
        }
    }
}

fn parse_arp(data: &[u8], pkt: &mut CapturedPacket) {
    pkt.protocol = "arp".to_string();
    if data.len() < 28 {
        pkt.info = "短 ARP".to_string();
        return;
    }
    let oper = u16::from_be_bytes([data[6], data[7]]);
    let sender_ip = format!("{}.{}.{}.{}", data[14], data[15], data[16], data[17]);
    let target_ip = format!("{}.{}.{}.{}", data[24], data[25], data[26], data[27]);
    pkt.src_ip = Some(sender_ip.clone());
    pkt.dst_ip = Some(target_ip.clone());
    pkt.info = match oper {
        1 => format!("Who has {target_ip}? Tell {sender_ip}"),
        2 => format!("{} is at {}", sender_ip, pkt.src_mac),
        _ => format!("ARP op {oper} {sender_ip} -> {target_ip}"),
    };
}

#[cfg(test)]
mod tests {
    use super::*;

    // ===== 包解析单元测试：构造已知字节，断言解析结果 =====

    fn eth_header(dst: [u8; 6], src: [u8; 6], ethertype: u16) -> Vec<u8> {
        let mut v = Vec::new();
        v.extend_from_slice(&dst);
        v.extend_from_slice(&src);
        v.extend_from_slice(&ethertype.to_be_bytes());
        v
    }

    /// 最小 IPv4 头（20 字节，IHL=5），proto 与地址可指定。
    fn ipv4_header(proto: u8, src: [u8; 4], dst: [u8; 4]) -> Vec<u8> {
        let mut v = vec![0u8; 20];
        v[0] = 0x45; // version 4, IHL 5
        v[8] = 64; // TTL
        v[9] = proto;
        v[12..16].copy_from_slice(&src);
        v[16..20].copy_from_slice(&dst);
        v
    }

    #[test]
    fn parse_tcp_over_ipv4() {
        let mut data = eth_header([0xaa; 6], [0xbb; 6], 0x0800);
        data.extend(ipv4_header(6, [192, 168, 1, 10], [192, 168, 1, 20]));
        // TCP 头：src=0x1F90(8080) dst=0x0050(80)，flags=SYN|ACK
        let mut tcp = vec![0u8; 20];
        tcp[0..2].copy_from_slice(&8080u16.to_be_bytes());
        tcp[2..4].copy_from_slice(&80u16.to_be_bytes());
        tcp[13] = 0x12; // SYN(0x02) | ACK(0x10)
        data.extend(tcp);

        let p = parse_packet(&data, 1_700_000_000_000, data.len() as u64);
        assert_eq!(p.protocol, "tcp");
        assert_eq!(p.src_mac, "bb:bb:bb:bb:bb:bb");
        assert_eq!(p.dst_mac, "aa:aa:aa:aa:aa:aa");
        assert_eq!(p.src_ip.as_deref(), Some("192.168.1.10"));
        assert_eq!(p.dst_ip.as_deref(), Some("192.168.1.20"));
        assert_eq!(p.src_port, Some(8080));
        assert_eq!(p.dst_port, Some(80));
        assert!(p.info.contains("SYN"), "info 应含 SYN: {}", p.info);
        assert!(p.info.contains("ACK"), "info 应含 ACK: {}", p.info);
    }

    #[test]
    fn parse_udp_over_ipv4() {
        let mut data = eth_header([0x01; 6], [0x02; 6], 0x0800);
        data.extend(ipv4_header(17, [10, 0, 0, 1], [10, 0, 0, 2]));
        let mut udp = vec![0u8; 8];
        udp[0..2].copy_from_slice(&53u16.to_be_bytes());
        udp[2..4].copy_from_slice(&1234u16.to_be_bytes());
        udp[4..6].copy_from_slice(&16u16.to_be_bytes()); // udp len = 8 头 + 8 数据
        data.extend(udp);
        data.extend_from_slice(&[0u8; 8]); // payload

        let p = parse_packet(&data, 0, data.len() as u64);
        assert_eq!(p.protocol, "udp");
        assert_eq!(p.src_port, Some(53));
        assert_eq!(p.dst_port, Some(1234));
        assert_eq!(p.src_ip.as_deref(), Some("10.0.0.1"));
        assert!(p.info.contains("Len=8"), "info 应含 Len=8: {}", p.info);
    }

    #[test]
    fn parse_icmp_echo_request() {
        let mut data = eth_header([0x01; 6], [0x02; 6], 0x0800);
        data.extend(ipv4_header(1, [1, 1, 1, 1], [2, 2, 2, 2]));
        data.extend_from_slice(&[8, 0, 0, 0, 0, 0, 0, 1]); // type=8 echo request
        let p = parse_packet(&data, 0, data.len() as u64);
        assert_eq!(p.protocol, "icmp");
        assert_eq!(p.info, "Echo request");
        assert_eq!(p.src_ip.as_deref(), Some("1.1.1.1"));
    }

    #[test]
    fn parse_arp_request() {
        let mut data = eth_header([0xff; 6], [0x11; 6], 0x0806);
        // ARP: htype=1 ptype=0x0800 hlen=6 plen=4 oper=1(request)
        let mut arp = vec![0x00, 0x01, 0x08, 0x00, 0x06, 0x04, 0x00, 0x01];
        arp.extend_from_slice(&[0x11; 6]); // sender mac
        arp.extend_from_slice(&[192, 168, 0, 1]); // sender ip
        arp.extend_from_slice(&[0x00; 6]); // target mac
        arp.extend_from_slice(&[192, 168, 0, 254]); // target ip
        data.extend(arp);

        let p = parse_packet(&data, 0, data.len() as u64);
        assert_eq!(p.protocol, "arp");
        assert_eq!(p.src_ip.as_deref(), Some("192.168.0.1"));
        assert_eq!(p.dst_ip.as_deref(), Some("192.168.0.254"));
        assert!(
            p.info.contains("Who has 192.168.0.254"),
            "info 应是 ARP request: {}",
            p.info
        );
    }

    #[test]
    fn parse_unknown_ethertype_is_other() {
        let data = eth_header([0x01; 6], [0x02; 6], 0x86dd); // IPv6，未实现 → other
        let p = parse_packet(&data, 0, data.len() as u64);
        assert_eq!(p.protocol, "other");
        assert!(p.info.contains("86DD"), "info: {}", p.info);
    }

    #[test]
    fn parse_short_frame_is_other_not_panic() {
        let p = parse_packet(&[0x01, 0x02, 0x03], 0, 3);
        assert_eq!(p.protocol, "other");
    }

    // ===== 滑窗 pps 单元测试：喂已知时间戳序列，断言 pps =====

    #[test]
    fn sliding_window_reports_last_complete_second() {
        let mut w = SlidingWindow::new();
        // 第 100 秒喂 5 个包，每个 100 字节。
        for _ in 0..5 {
            w.record(100, 100);
        }
        // 此时 latest_sec=100，最近完整秒是 99（无数据）→ 0。
        assert_eq!(w.rate(), (0.0, 0.0));

        // 推进到第 101 秒喂 3 个包，每个 200 字节。
        for _ in 0..3 {
            w.record(101, 200);
        }
        // latest_sec=101，最近完整秒是 100：5 包 / 500 字节。
        assert_eq!(w.rate(), (5.0, 500.0));
    }

    #[test]
    fn sliding_window_isolates_per_second() {
        let mut w = SlidingWindow::new();
        w.record(10, 64);
        w.record(11, 64);
        w.record(11, 64);
        w.record(12, 64); // latest=12，完整秒=11 → 2 包
        assert_eq!(w.rate(), (2.0, 128.0));
    }

    #[test]
    fn sliding_window_recycles_stale_bucket() {
        let mut w = SlidingWindow::new();
        // 第 5 秒灌一堆，应在 60 秒后被环形复用清掉。
        for _ in 0..99 {
            w.record(5, 1);
        }
        // 同一槽位（5 % 60 == 65 % 60）在第 65 秒复用，旧值必须清零。
        w.record(65, 7);
        w.record(66, 7); // latest=66，完整秒=65 → 1 包（不是 100）
        assert_eq!(w.rate(), (1.0, 7.0));
    }

    #[test]
    fn sliding_window_empty_is_zero() {
        let w = SlidingWindow::new();
        assert_eq!(w.rate(), (0.0, 0.0));
    }

    #[test]
    fn ts_millis_combines_sec_and_usec() {
        let tv = libc::timeval {
            tv_sec: 1_700_000_000 as _,
            tv_usec: 500_000 as _,
        };
        assert_eq!(ts_millis(&tv), 1_700_000_000_500);
        assert_eq!(ts_secs(&tv), 1_700_000_000);
    }
}
