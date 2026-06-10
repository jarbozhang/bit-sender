//! IPv6（over Ethernet）。完整帧 = 以太网(14) + IPv6 固定头(40) + payload，补到 60。
//!
//! M7 扩展协议示范：复用 M1 的解析/补帧/golden 模式，新增一个协议只需一个文件
//! + 一个 PacketSpec 枚举分支。IPv6 地址解析直接用 std::net::Ipv6Addr（支持 :: 缩写）。

use serde::{Deserialize, Serialize};
use specta::Type;

use super::{parse_hex, parse_mac, BuildError, MIN_ETHERNET_FRAME};

pub(crate) const ETHERTYPE_IPV6: u16 = 0x86DD;

/// IPv6 帧规格。以太网头 + IPv6 固定头(40) + payload。
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct Ipv6Spec {
    pub dst_mac: String,
    pub src_mac: String,
    /// 流量类别（8 位）。
    pub traffic_class: u8,
    /// 流标签（低 20 位有效）。
    pub flow_label: u32,
    /// 下一个头部（59=无, 58=ICMPv6, 6=TCP, 17=UDP）。
    pub next_header: u8,
    pub hop_limit: u8,
    pub src_ip: String,
    pub dst_ip: String,
    pub payload_hex: String,
}

fn parse_ipv6(field: &str, ip: &str) -> Result<[u8; 16], BuildError> {
    ip.trim()
        .parse::<std::net::Ipv6Addr>()
        .map(|a| a.octets())
        .map_err(|_| BuildError::InvalidIp {
            field: field.to_string(),
            value: ip.to_string(),
        })
}

pub fn build_ipv6(spec: &Ipv6Spec) -> Result<Vec<u8>, BuildError> {
    let src = parse_ipv6("src_ip", &spec.src_ip)?;
    let dst = parse_ipv6("dst_ip", &spec.dst_ip)?;
    let payload = parse_hex(&spec.payload_hex)?;

    let mut frame = Vec::with_capacity(MIN_ETHERNET_FRAME);
    frame.extend_from_slice(&parse_mac("dst_mac", &spec.dst_mac)?);
    frame.extend_from_slice(&parse_mac("src_mac", &spec.src_mac)?);
    frame.extend_from_slice(&ETHERTYPE_IPV6.to_be_bytes());

    // 第 1 个 32 位字：version(4) | traffic_class(8) | flow_label(20)。
    let vtf =
        (6u32 << 28) | ((spec.traffic_class as u32) << 20) | (spec.flow_label & 0x000F_FFFF);
    frame.extend_from_slice(&vtf.to_be_bytes());
    // payload length（不含固定头；扩展头未建模，简化为 payload 字节数）。
    frame.extend_from_slice(&(payload.len() as u16).to_be_bytes());
    frame.push(spec.next_header);
    frame.push(spec.hop_limit);
    frame.extend_from_slice(&src);
    frame.extend_from_slice(&dst);
    frame.extend_from_slice(&payload);

    if frame.len() < MIN_ETHERNET_FRAME {
        frame.resize(MIN_ETHERNET_FRAME, 0);
    }
    Ok(frame)
}

#[cfg(test)]
mod golden {
    use super::*;

    fn sample() -> Ipv6Spec {
        Ipv6Spec {
            dst_mac: "33:33:00:00:00:01".into(),
            src_mac: "00:11:22:33:44:55".into(),
            traffic_class: 0,
            flow_label: 0,
            next_header: 59, // No Next Header
            hop_limit: 64,
            src_ip: "2001:db8::1".into(),
            dst_ip: "2001:db8::2".into(),
            payload_hex: "DEADBEEF".into(),
        }
    }

    #[test]
    fn ipv6_full_frame_golden() {
        let frame = build_ipv6(&sample()).unwrap();
        assert_eq!(&frame[12..14], &[0x86, 0xDD], "ether_type 应为 IPv6");
        assert_eq!(frame[14] >> 4, 6, "version 应为 6");
        assert_eq!(&frame[18..20], &[0x00, 0x04], "payload length = 4");
        assert_eq!(frame[20], 59, "next header");
        assert_eq!(frame[21], 64, "hop limit");
        // src 2001:db8::1 = 2001:0db8:0:0:0:0:0:1
        assert_eq!(&frame[22..38], &[0x20, 0x01, 0x0d, 0xb8, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1]);
        assert_eq!(&frame[38..54], &[0x20, 0x01, 0x0d, 0xb8, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2]);
        assert_eq!(&frame[54..58], &[0xDE, 0xAD, 0xBE, 0xEF]);
    }

    #[test]
    fn ipv6_cross_check_with_etherparse() {
        use etherparse::{LaxPacketHeaders, NetHeaders};
        let frame = build_ipv6(&sample()).unwrap();
        let parsed = LaxPacketHeaders::from_ethernet(&frame).unwrap();
        match parsed.net {
            Some(NetHeaders::Ipv6(ip, _)) => {
                assert_eq!(ip.source, std::net::Ipv6Addr::new(0x2001, 0xdb8, 0, 0, 0, 0, 0, 1).octets());
                assert_eq!(ip.hop_limit, 64);
            }
            other => panic!("期望 IPv6 网络头，得到 {other:?}"),
        }
    }

    #[test]
    fn ipv6_invalid_addr_rejected() {
        let mut spec = sample();
        spec.dst_ip = "not-an-ipv6".into();
        assert!(matches!(build_ipv6(&spec), Err(BuildError::InvalidIp { .. })));
    }
}
