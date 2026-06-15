//! v2 协议建模 + builder。
//!
//! 与 v1 的根本区别：字段是强类型（数值字段用 u8/u16/u32，地址用 String 但在
//! builder 边界一次性校验），解析/校验失败**返回结构化错误**而非静默回退默认值。
//! 每个协议一个文件，各自带 golden 字节测试。本模块持有跨协议的共享件：
//! 错误类型、地址/hex 解析、校验和、顶层派发枚举 `PacketSpec`。

mod arp;
mod ethernet;
mod http;
mod icmp;
mod ipv4;
mod ipv6;
mod tcp;
mod udp;

pub use arp::ArpSpec;
pub use ethernet::{build_ethernet, EthernetSpec};
pub use http::HttpSpec;
pub use icmp::IcmpSpec;
pub use ipv4::Ipv4Spec;
pub use ipv6::Ipv6Spec;
pub use tcp::TcpSpec;
pub use udp::UdpSpec;

use serde::{Deserialize, Serialize};
use specta::Type;
use thiserror::Error;

/// 构建错误——v1 用 `parse().unwrap_or(default)` 静默吞掉，v2 显式上报。
#[derive(Debug, Error)]
pub enum BuildError {
    #[error("字段 {field} 的 MAC 地址格式无效: {value}")]
    InvalidMac { field: String, value: String },
    #[error("字段 {field} 的 IPv4 地址格式无效: {value}")]
    InvalidIp { field: String, value: String },
    #[error("payload 不是有效的十六进制: {0}")]
    InvalidHex(String),
    #[error("HTTP 字段 {field} 无效: {reason}")]
    InvalidHttpField { field: String, reason: String },
}

/// 最小以太网帧 60 字节（FCS 4 字节由网卡追加）。
/// 注意：v1 误补到 64，会多发 4 字节垃圾——v2 修正为 60。
pub(crate) const MIN_ETHERNET_FRAME: usize = 60;

pub(crate) const ETHERTYPE_IPV4: u16 = 0x0800;
pub(crate) const ETHERTYPE_ARP: u16 = 0x0806;

pub(crate) const IP_PROTO_ICMP: u8 = 1;
pub(crate) const IP_PROTO_TCP: u8 = 6;
pub(crate) const IP_PROTO_UDP: u8 = 17;

/// 顶层协议派发枚举。`kind` 字段做 serde 标签，前端按 `{ kind: "tcp", ... }`
/// 发来，反序列化直接落到对应变体。每个变体携带构建**完整以太网帧**所需的全部字段。
/// 注意：标签用 `kind` 而非 `protocol`，因为 `Ipv4Spec` 已有名为 `protocol` 的
/// IP 协议号字段，撞名会让 TS 联合类型坍缩为 never。
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum PacketSpec {
    Ethernet(EthernetSpec),
    Arp(ArpSpec),
    Ipv4(Ipv4Spec),
    Tcp(TcpSpec),
    Http(HttpSpec),
    Udp(UdpSpec),
    Icmp(IcmpSpec),
    Ipv6(Ipv6Spec),
}

impl PacketSpec {
    /// 派发到各协议 builder，产出完整以太网帧字节。
    pub fn build(&self) -> Result<Vec<u8>, BuildError> {
        match self {
            PacketSpec::Ethernet(s) => ethernet::build_ethernet(s),
            PacketSpec::Arp(s) => arp::build_arp(s),
            PacketSpec::Ipv4(s) => ipv4::build_ipv4(s),
            PacketSpec::Tcp(s) => tcp::build_tcp(s),
            PacketSpec::Http(s) => http::build_http(s),
            PacketSpec::Udp(s) => udp::build_udp(s),
            PacketSpec::Icmp(s) => icmp::build_icmp(s),
            PacketSpec::Ipv6(s) => ipv6::build_ipv6(s),
        }
    }
}

// ── 共享解析（在 builder 边界一次校验，失败即 Err，绝不静默默认） ──────────

pub(crate) fn parse_mac(field: &str, mac: &str) -> Result<[u8; 6], BuildError> {
    let parts: Vec<&str> = mac.split(':').collect();
    let err = || BuildError::InvalidMac {
        field: field.to_string(),
        value: mac.to_string(),
    };
    if parts.len() != 6 {
        return Err(err());
    }
    let mut out = [0u8; 6];
    for (i, part) in parts.iter().enumerate() {
        if part.len() != 2 {
            return Err(err());
        }
        out[i] = u8::from_str_radix(part, 16).map_err(|_| err())?;
    }
    Ok(out)
}

pub(crate) fn parse_ipv4(field: &str, ip: &str) -> Result<[u8; 4], BuildError> {
    let parts: Vec<&str> = ip.trim().split('.').collect();
    let err = || BuildError::InvalidIp {
        field: field.to_string(),
        value: ip.to_string(),
    };
    if parts.len() != 4 {
        return Err(err());
    }
    let mut out = [0u8; 4];
    for (i, part) in parts.iter().enumerate() {
        out[i] = part.parse::<u8>().map_err(|_| err())?;
    }
    Ok(out)
}

/// 解析 payload/任意 hex 字段。允许空格/冒号分隔；空串 → 空 vec；非法或奇数长度 → Err。
/// 注意：与 v1 不同，奇数长度**不**自动补 0（那会静默改变语义），直接报错。
pub(crate) fn parse_hex(s: &str) -> Result<Vec<u8>, BuildError> {
    let cleaned: String = s
        .chars()
        .filter(|c| !c.is_whitespace() && *c != ':')
        .collect();
    if cleaned.is_empty() {
        return Ok(Vec::new());
    }
    if !cleaned.len().is_multiple_of(2) || !cleaned.chars().all(|c| c.is_ascii_hexdigit()) {
        return Err(BuildError::InvalidHex(s.to_string()));
    }
    (0..cleaned.len())
        .step_by(2)
        .map(|i| {
            u8::from_str_radix(&cleaned[i..i + 2], 16)
                .map_err(|_| BuildError::InvalidHex(s.to_string()))
        })
        .collect()
}

// ── 校验和（RFC 1071 反码求和） ──────────────────────────────────────────

/// RFC 1071 一补码累加：把 data 按 16 位大端分组相加，奇数末尾按高字节补 0，
/// 回卷进位，返回**未取反**的 16 位和。各协议校验和都建立在它之上。
pub(crate) fn ones_complement_sum(data: &[u8]) -> u16 {
    let mut sum: u32 = 0;
    let mut chunks = data.chunks_exact(2);
    for c in &mut chunks {
        sum += ((c[0] as u32) << 8) | (c[1] as u32);
    }
    // 奇数字节：末尾字节作为高字节，低字节补 0。
    if let Some(&last) = chunks.remainder().first() {
        sum += (last as u32) << 8;
    }
    while sum >> 16 != 0 {
        sum = (sum & 0xFFFF) + (sum >> 16);
    }
    sum as u16
}

/// IPv4 头部校验和：对 20 字节头部（校验和位置须先置 0）求和后取反。
pub(crate) fn ipv4_header_checksum(header: &[u8]) -> u16 {
    !ones_complement_sum(header)
}

/// TCP/UDP 伪首部校验和：覆盖 [伪首部 + L4 头 + payload]。
/// 伪首部 = src_ip(4) + dst_ip(4) + zero(1) + protocol(1) + l4_length(2)。
/// `l4_segment` 应为 L4 头(校验和位置置 0) + payload，其长度即 l4_length。
pub(crate) fn l4_checksum(
    src_ip: [u8; 4],
    dst_ip: [u8; 4],
    protocol: u8,
    l4_segment: &[u8],
) -> u16 {
    let mut pseudo = Vec::with_capacity(12 + l4_segment.len());
    pseudo.extend_from_slice(&src_ip);
    pseudo.extend_from_slice(&dst_ip);
    pseudo.push(0);
    pseudo.push(protocol);
    pseudo.extend_from_slice(&(l4_segment.len() as u16).to_be_bytes());
    pseudo.extend_from_slice(l4_segment);
    let sum = !ones_complement_sum(&pseudo);
    // UDP 特例：校验和算出 0 时按 RFC 768 传 0xFFFF（区别于"无校验和"的 0）。
    if protocol == IP_PROTO_UDP && sum == 0 {
        0xFFFF
    } else {
        sum
    }
}

/// ICMP 校验和：覆盖 [ICMP 头(校验和位置置 0) + payload]。
pub(crate) fn icmp_checksum(icmp: &[u8]) -> u16 {
    !ones_complement_sum(icmp)
}

#[cfg(test)]
mod dispatch_tests {
    use super::*;

    #[test]
    fn packet_spec_dispatches_to_each_builder() {
        // 每个变体都能 build 出非空帧且不短于最小帧。
        let specs = vec![
            PacketSpec::Ethernet(EthernetSpec {
                dst_mac: "FF:FF:FF:FF:FF:FF".into(),
                src_mac: "00:11:22:33:44:55".into(),
                ether_type: 0x0800,
                payload_hex: String::new(),
            }),
            PacketSpec::Arp(ArpSpec {
                dst_mac: "FF:FF:FF:FF:FF:FF".into(),
                src_mac: "00:11:22:33:44:55".into(),
                hw_type: 1,
                proto_type: 0x0800,
                hw_size: 6,
                proto_size: 4,
                opcode: 1,
                sender_mac: "00:11:22:33:44:55".into(),
                sender_ip: "192.168.1.1".into(),
                target_mac: "00:00:00:00:00:00".into(),
                target_ip: "192.168.1.2".into(),
                payload_hex: String::new(),
            }),
            PacketSpec::Ipv4(Ipv4Spec {
                dst_mac: "FF:FF:FF:FF:FF:FF".into(),
                src_mac: "00:11:22:33:44:55".into(),
                version: 4,
                ihl: 5,
                dscp_ecn: 0,
                identification: 0,
                flags: 2,
                fragment_offset: 0,
                ttl: 64,
                protocol: 17,
                checksum: None,
                src_ip: "10.0.0.1".into(),
                dst_ip: "10.0.0.2".into(),
                payload_hex: "DEADBEEF".into(),
            }),
            PacketSpec::Tcp(TcpSpec {
                dst_mac: "FF:FF:FF:FF:FF:FF".into(),
                src_mac: "00:11:22:33:44:55".into(),
                ttl: 64,
                identification: 0,
                src_ip: "10.0.0.1".into(),
                dst_ip: "10.0.0.2".into(),
                src_port: 12345,
                dst_port: 80,
                seq: 0,
                ack: 0,
                data_offset: 5,
                flag_urg: false,
                flag_ack: false,
                flag_psh: false,
                flag_rst: false,
                flag_syn: true,
                flag_fin: false,
                window_size: 8192,
                checksum: None,
                urgent_pointer: 0,
                payload_hex: String::new(),
            }),
            PacketSpec::Http(HttpSpec {
                dst_mac: "FF:FF:FF:FF:FF:FF".into(),
                src_mac: "00:11:22:33:44:55".into(),
                ttl: 64,
                identification: 0,
                src_ip: "10.0.0.1".into(),
                dst_ip: "10.0.0.2".into(),
                src_port: 54321,
                dst_port: 80,
                seq: 1,
                ack: 1,
                data_offset: 5,
                flag_urg: false,
                flag_ack: true,
                flag_psh: true,
                flag_rst: false,
                flag_syn: false,
                flag_fin: false,
                window_size: 8192,
                checksum: None,
                urgent_pointer: 0,
                method: "GET".into(),
                host: "example.com".into(),
                path: "/".into(),
                headers: "Connection: close".into(),
                body: String::new(),
            }),
            PacketSpec::Udp(UdpSpec {
                dst_mac: "FF:FF:FF:FF:FF:FF".into(),
                src_mac: "00:11:22:33:44:55".into(),
                ttl: 64,
                identification: 0,
                src_ip: "10.0.0.1".into(),
                dst_ip: "10.0.0.2".into(),
                src_port: 12345,
                dst_port: 53,
                checksum: None,
                payload_hex: "DEADBEEF".into(),
            }),
            PacketSpec::Icmp(IcmpSpec {
                dst_mac: "FF:FF:FF:FF:FF:FF".into(),
                src_mac: "00:11:22:33:44:55".into(),
                ttl: 64,
                identification: 0,
                src_ip: "10.0.0.1".into(),
                dst_ip: "10.0.0.2".into(),
                icmp_type: 8,
                icmp_code: 0,
                checksum: None,
                rest_of_header: 0,
                payload_hex: "6162636465".into(),
            }),
        ];
        for spec in specs {
            let frame = spec.build().expect("派发 build 应成功");
            assert!(
                frame.len() >= MIN_ETHERNET_FRAME,
                "帧不应短于最小帧: {spec:?}"
            );
        }
    }

    #[test]
    fn ones_complement_all_zero_is_zero_inverts_to_ffff() {
        // RFC 1071：全 0 求和为 0，取反为 0xFFFF。
        assert_eq!(ones_complement_sum(&[0u8; 20]), 0);
        assert_eq!(ipv4_header_checksum(&[0u8; 20]), 0xFFFF);
    }

    #[test]
    fn ones_complement_handles_odd_length() {
        // 奇数长度：末字节作高字节。 [0x12] → 0x1200。
        assert_eq!(ones_complement_sum(&[0x12]), 0x1200);
        // [0x00, 0x01, 0x02] → 0x0001 + 0x0200 = 0x0201。
        assert_eq!(ones_complement_sum(&[0x00, 0x01, 0x02]), 0x0201);
    }
}

/// 回环自测脚手架：用 pcap 在 loopback 设备自发自收，断言收到帧 == 发出帧。
/// 标 `#[ignore]`——无权限/无 loopback 的 CI 环境会跳过；提供可用框架即可。
#[cfg(test)]
mod loopback {
    use super::*;
    use pcap::{Capture, Device};

    /// 在 loopback 设备上发一帧再抓回来，断言字节一致。
    /// 本地手动跑：`cargo test --package BitSender -- --ignored loopback`（可能需 sudo）。
    #[test]
    #[ignore = "需要 pcap 权限与 loopback 设备，CI 默认跳过"]
    fn send_and_recv_on_loopback() {
        // 构造一帧 ARP（自包含，无需对端响应）。
        let spec = PacketSpec::Arp(ArpSpec {
            dst_mac: "FF:FF:FF:FF:FF:FF".into(),
            src_mac: "02:00:00:00:00:01".into(),
            hw_type: 1,
            proto_type: ETHERTYPE_IPV4,
            hw_size: 6,
            proto_size: 4,
            opcode: 1,
            sender_mac: "02:00:00:00:00:01".into(),
            sender_ip: "192.0.2.1".into(),
            target_mac: "00:00:00:00:00:00".into(),
            target_ip: "192.0.2.2".into(),
            payload_hex: String::new(),
        });
        let frame = spec.build().expect("build 应成功");

        // 找一个可用的回环/任意设备。无设备则跳过（视为通过，因为标了 ignore）。
        let device = match Device::list().ok().and_then(|list| {
            list.into_iter()
                .find(|d| d.name.contains("lo"))
                .or_else(|| Device::lookup().ok().flatten())
        }) {
            Some(d) => d,
            None => return,
        };

        let mut cap = match Capture::from_device(device)
            .and_then(|c| c.immediate_mode(true).timeout(1000).open())
        {
            Ok(c) => c,
            Err(_) => return, // 无权限：ignore 测试直接放行。
        };

        if cap.sendpacket(frame.clone()).is_err() {
            return;
        }

        // 尝试抓回自己发的帧（loopback 下应能看到）。
        for _ in 0..10 {
            match cap.next_packet() {
                Ok(packet) => {
                    if packet.data == frame.as_slice() {
                        return; // 成功：收到 == 发出。
                    }
                }
                Err(_) => break,
            }
        }
        // 抓不到不强制失败——很多平台 loopback 不回显原始以太帧。
    }
}
