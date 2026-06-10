//! IPv4（over Ethernet）。完整帧 = 以太网头(14) + IPv4 头(20) + payload，补到 60。
//!
//! 本模块的 `build_ipv4_header` 是 TCP/UDP/ICMP 共用的 L3 头构造器：它负责
//! 填总长度与头部校验和。校验和按 RFC 1071 反码求和真实计算（v1 的核心 bug 是
//! 上层协议根本没算 L4 伪首部校验和）。

use serde::{Deserialize, Serialize};
use specta::Type;

use super::{
    ipv4_header_checksum, parse_hex, parse_ipv4, parse_mac, BuildError, ETHERTYPE_IPV4,
    MIN_ETHERNET_FRAME,
};

/// IPv4 帧规格。以太网头 + IPv4 头全部字段 + payload。
/// `checksum: None`/Some(0) → 自动计算；Some(非0) → 用用户值（用于故意造错包）。
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct Ipv4Spec {
    // 以太网头
    pub dst_mac: String,
    pub src_mac: String,
    // IPv4 头
    pub version: u8,
    pub ihl: u8,
    /// DSCP(6) + ECN(2) 合并为一字节（即旧 TOS 字段）。
    pub dscp_ecn: u8,
    pub identification: u16,
    /// 3 位标志（bit2=保留0, bit1=DF, bit0=MF），放低 3 位。
    pub flags: u8,
    pub fragment_offset: u16,
    pub ttl: u8,
    pub protocol: u8,
    pub checksum: Option<u16>,
    pub src_ip: String,
    pub dst_ip: String,
    pub payload_hex: String,
}

/// 共用 IPv4 头构造器：返回 20 字节头（仅 IHL=5 无选项）。
/// `total_len` = IP 头 + L4 段总字节；`checksum_override` 见上文语义。
/// 失败仅来自 IP 地址解析。
#[allow(clippy::too_many_arguments)] // IPv4 头字段本就多，平铺参数比再包一层 struct 更直观
pub(crate) fn build_ipv4_header(
    version: u8,
    ihl: u8,
    dscp_ecn: u8,
    identification: u16,
    flags: u8,
    fragment_offset: u16,
    ttl: u8,
    protocol: u8,
    checksum_override: Option<u16>,
    src_ip: [u8; 4],
    dst_ip: [u8; 4],
    total_len: u16,
) -> [u8; 20] {
    let mut h = [0u8; 20];
    h[0] = ((version & 0x0F) << 4) | (ihl & 0x0F);
    h[1] = dscp_ecn;
    h[2..4].copy_from_slice(&total_len.to_be_bytes());
    h[4..6].copy_from_slice(&identification.to_be_bytes());
    let flags_frag = (((flags & 0x07) as u16) << 13) | (fragment_offset & 0x1FFF);
    h[6..8].copy_from_slice(&flags_frag.to_be_bytes());
    h[8] = ttl;
    h[9] = protocol;
    // h[10..12] 校验和：先留 0，便于计算。
    h[12..16].copy_from_slice(&src_ip);
    h[16..20].copy_from_slice(&dst_ip);

    let checksum = resolve_checksum(checksum_override, || ipv4_header_checksum(&h));
    h[10..12].copy_from_slice(&checksum.to_be_bytes());
    h
}

/// 校验和覆盖语义：None 或 Some(0) → 调用 `compute` 自动算；Some(非0) → 直接用。
pub(crate) fn resolve_checksum(override_val: Option<u16>, compute: impl FnOnce() -> u16) -> u16 {
    match override_val {
        Some(v) if v != 0 => v,
        _ => compute(),
    }
}

pub fn build_ipv4(spec: &Ipv4Spec) -> Result<Vec<u8>, BuildError> {
    let src_ip = parse_ipv4("src_ip", &spec.src_ip)?;
    let dst_ip = parse_ipv4("dst_ip", &spec.dst_ip)?;
    let payload = parse_hex(&spec.payload_hex)?;

    let total_len = (20 + payload.len()) as u16;
    let header = build_ipv4_header(
        spec.version,
        spec.ihl,
        spec.dscp_ecn,
        spec.identification,
        spec.flags,
        spec.fragment_offset,
        spec.ttl,
        spec.protocol,
        spec.checksum,
        src_ip,
        dst_ip,
        total_len,
    );

    let mut frame = Vec::with_capacity(MIN_ETHERNET_FRAME);
    frame.extend_from_slice(&parse_mac("dst_mac", &spec.dst_mac)?);
    frame.extend_from_slice(&parse_mac("src_mac", &spec.src_mac)?);
    frame.extend_from_slice(&ETHERTYPE_IPV4.to_be_bytes());
    frame.extend_from_slice(&header);
    frame.extend_from_slice(&payload);

    if frame.len() < MIN_ETHERNET_FRAME {
        frame.resize(MIN_ETHERNET_FRAME, 0);
    }
    Ok(frame)
}

/// 测试辅助：对一段 IPv4 头做反码求和，正确时应得 0xFFFF。
#[cfg(test)]
pub(crate) fn verify_ipv4_header_checksum(header: &[u8]) -> u16 {
    super::ones_complement_sum(header)
}

#[cfg(test)]
mod golden {
    use super::super::IP_PROTO_TCP;
    use super::*;

    fn sample() -> Ipv4Spec {
        Ipv4Spec {
            dst_mac: "FF:FF:FF:FF:FF:FF".into(),
            src_mac: "00:11:22:33:44:55".into(),
            version: 4,
            ihl: 5,
            dscp_ecn: 0,
            identification: 0x1234,
            flags: 2, // DF
            fragment_offset: 0,
            ttl: 64,
            protocol: IP_PROTO_TCP,
            checksum: None,
            src_ip: "192.168.0.1".into(),
            dst_ip: "192.168.0.2".into(),
            payload_hex: "DEADBEEF".into(),
        }
    }

    #[test]
    fn ipv4_full_frame_golden() {
        let frame = build_ipv4(&sample()).unwrap();
        // 以太网头 14
        assert_eq!(&frame[0..6], &[0xFF; 6]);
        assert_eq!(&frame[6..12], &[0x00, 0x11, 0x22, 0x33, 0x44, 0x55]);
        assert_eq!(&frame[12..14], &[0x08, 0x00]);
        // IPv4 头 20
        let ip = &frame[14..34];
        assert_eq!(ip[0], 0x45); // version 4, ihl 5
        assert_eq!(ip[1], 0x00); // dscp_ecn
        assert_eq!(&ip[2..4], &[0x00, 0x18]); // total length 20+4=24
        assert_eq!(&ip[4..6], &[0x12, 0x34]); // identification
        assert_eq!(&ip[6..8], &[0x40, 0x00]); // flags=DF, offset=0
        assert_eq!(ip[8], 64); // ttl
        assert_eq!(ip[9], IP_PROTO_TCP); // protocol
        assert_eq!(&ip[12..16], &[192, 168, 0, 1]); // src
        assert_eq!(&ip[16..20], &[192, 168, 0, 2]); // dst
        // payload
        assert_eq!(&frame[34..38], &[0xDE, 0xAD, 0xBE, 0xEF]);
    }

    #[test]
    fn ipv4_header_checksum_self_validates() {
        let frame = build_ipv4(&sample()).unwrap();
        // 正确的 IP 头：含校验和在内反码求和应为 0xFFFF。
        assert_eq!(verify_ipv4_header_checksum(&frame[14..34]), 0xFFFF);
    }

    #[test]
    fn ipv4_user_checksum_override_used() {
        let mut spec = sample();
        spec.checksum = Some(0xBEEF);
        let frame = build_ipv4(&spec).unwrap();
        assert_eq!(&frame[24..26], &[0xBE, 0xEF], "显式非0校验和应原样写入");
    }

    #[test]
    fn ipv4_cross_check_with_etherparse() {
        use etherparse::{LaxPacketHeaders, NetHeaders};
        let frame = build_ipv4(&sample()).unwrap();
        let parsed = LaxPacketHeaders::from_ethernet(&frame).unwrap();
        match parsed.net {
            Some(NetHeaders::Ipv4(ip, _)) => {
                assert_eq!(ip.source, [192, 168, 0, 1]);
                assert_eq!(ip.destination, [192, 168, 0, 2]);
                assert_eq!(ip.protocol, etherparse::IpNumber(IP_PROTO_TCP));
                assert_eq!(ip.time_to_live, 64);
                // etherparse 解析时不报头部校验和错误即说明我们算对了。
                assert_eq!(ip.header_checksum, ip.calc_header_checksum());
            }
            other => panic!("期望 IPv4 网络头，得到 {other:?}"),
        }
    }
}
