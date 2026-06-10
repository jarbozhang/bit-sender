//! ICMP（over IPv4 over Ethernet）。完整帧 = 以太网(14)+IPv4(20)+ICMP(8+payload)。
//!
//! v1 核心 bug：ICMP 把裸 IP 当成 L2 帧（漏了以太网头）——v2 必须是完整以太网帧。
//! ICMP 校验和：覆盖 [ICMP 头(校验和位置置0) + payload]，不含 IP 伪首部。
//!
//! ICMP 头布局：type(1) + code(1) + checksum(2) + rest_of_header(4)。
//! 对 Echo Request/Reply，rest_of_header 高 16 位是 identifier、低 16 位是 sequence。
//! 这里用单个 u32 通用建模，回显数据放 payload_hex。

use serde::{Deserialize, Serialize};
use specta::Type;

use super::ipv4::build_ipv4_header;
use super::{
    icmp_checksum, parse_hex, parse_ipv4, parse_mac, BuildError, ETHERTYPE_IPV4, IP_PROTO_ICMP,
    MIN_ETHERNET_FRAME,
};

/// ICMP 帧规格。IPv4 层同 TcpSpec 用固定默认，仅暴露 ttl/identification。
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct IcmpSpec {
    // 以太网头
    pub dst_mac: String,
    pub src_mac: String,
    // IPv4 头（暴露的子集）
    pub ttl: u8,
    pub identification: u16,
    pub src_ip: String,
    pub dst_ip: String,
    // ICMP 头
    pub icmp_type: u8,
    pub icmp_code: u8,
    pub checksum: Option<u16>,
    /// ICMP 头第 5-8 字节。Echo 时 = (identifier << 16) | sequence。
    pub rest_of_header: u32,
    pub payload_hex: String,
}

pub fn build_icmp(spec: &IcmpSpec) -> Result<Vec<u8>, BuildError> {
    let src_ip = parse_ipv4("src_ip", &spec.src_ip)?;
    let dst_ip = parse_ipv4("dst_ip", &spec.dst_ip)?;
    let payload = parse_hex(&spec.payload_hex)?;

    // 组装 ICMP 消息（头8 + payload），校验和先置 0。
    let mut icmp = Vec::with_capacity(8 + payload.len());
    icmp.push(spec.icmp_type);
    icmp.push(spec.icmp_code);
    let checksum_pos = icmp.len();
    icmp.extend_from_slice(&[0x00, 0x00]); // checksum 占位
    icmp.extend_from_slice(&spec.rest_of_header.to_be_bytes());
    icmp.extend_from_slice(&payload);

    let checksum = match spec.checksum {
        Some(v) if v != 0 => v,
        _ => icmp_checksum(&icmp),
    };
    icmp[checksum_pos..checksum_pos + 2].copy_from_slice(&checksum.to_be_bytes());

    // IPv4 头：total_len = 20 + ICMP 消息。
    let total_len = (20 + icmp.len()) as u16;
    let ip_header = build_ipv4_header(
        4,
        5,
        0,
        spec.identification,
        2, // DF
        0,
        spec.ttl,
        IP_PROTO_ICMP,
        None,
        src_ip,
        dst_ip,
        total_len,
    );

    let mut frame = Vec::with_capacity(MIN_ETHERNET_FRAME);
    frame.extend_from_slice(&parse_mac("dst_mac", &spec.dst_mac)?);
    frame.extend_from_slice(&parse_mac("src_mac", &spec.src_mac)?);
    frame.extend_from_slice(&ETHERTYPE_IPV4.to_be_bytes());
    frame.extend_from_slice(&ip_header);
    frame.extend_from_slice(&icmp);

    if frame.len() < MIN_ETHERNET_FRAME {
        frame.resize(MIN_ETHERNET_FRAME, 0);
    }
    Ok(frame)
}

#[cfg(test)]
mod golden {
    use super::*;

    fn sample() -> IcmpSpec {
        IcmpSpec {
            dst_mac: "FF:FF:FF:FF:FF:FF".into(),
            src_mac: "00:11:22:33:44:55".into(),
            ttl: 64,
            identification: 0,
            src_ip: "192.168.1.100".into(),
            dst_ip: "192.168.1.1".into(),
            icmp_type: 8, // Echo Request
            icmp_code: 0,
            checksum: None,
            rest_of_header: 0x0001_0001, // id=1, seq=1
            payload_hex: "6162636465".into(), // "abcde" 5 字节（奇）
        }
    }

    #[test]
    fn icmp_is_full_ethernet_frame_not_bare_ip() {
        // 这是修复 v1 的关键断言：帧前 14 字节必须是以太网头，第 14 字节起才是 IP。
        let frame = build_icmp(&sample()).unwrap();
        assert_eq!(&frame[0..6], &[0xFF; 6], "前 6 字节应为目标 MAC");
        assert_eq!(&frame[6..12], &[0x00, 0x11, 0x22, 0x33, 0x44, 0x55]);
        assert_eq!(&frame[12..14], &[0x08, 0x00], "ether_type 应为 IPv4");
        assert_eq!(frame[14], 0x45, "第 14 字节应是 IP 头首字节(0x45)");
        assert_eq!(frame[14 + 9], IP_PROTO_ICMP, "IP protocol 应为 1");
    }

    #[test]
    fn icmp_echo_request_layout() {
        let frame = build_icmp(&sample()).unwrap();
        let icmp = &frame[34..]; // 头8 + payload5 = 13
        assert_eq!(icmp[0], 8); // type
        assert_eq!(icmp[1], 0); // code
        assert_eq!(&icmp[4..8], &[0x00, 0x01, 0x00, 0x01]); // id=1 seq=1
        assert_eq!(&icmp[8..13], &[0x61, 0x62, 0x63, 0x64, 0x65]); // "abcde"
    }

    #[test]
    fn icmp_checksum_self_validates() {
        // ICMP 头(含校验和) + payload 反码求和应为 0xFFFF。
        // 按 IP total-length 精确切出 ICMP 消息，排除以太网补 0（否则若补 0 非 0 会漏检）。
        let frame = build_icmp(&sample()).unwrap();
        let ip_total = u16::from_be_bytes([frame[16], frame[17]]) as usize;
        let icmp = &frame[34..14 + ip_total];
        assert_eq!(
            super::super::ones_complement_sum(icmp),
            0xFFFF,
            "ICMP 校验和应自校验为 0xFFFF"
        );
    }

    #[test]
    fn icmp_ip_total_length_correct() {
        let frame = build_icmp(&sample()).unwrap();
        // total length = 20(IP) + 8(ICMP头) + 5(payload) = 33 = 0x21。
        assert_eq!(&frame[16..18], &[0x00, 0x21]);
    }

    #[test]
    fn icmp_cross_check_with_etherparse() {
        use etherparse::{Icmpv4Type, LaxPacketHeaders, TransportHeader};
        let frame = build_icmp(&sample()).unwrap();
        let parsed = LaxPacketHeaders::from_ethernet(&frame).unwrap();
        match parsed.transport {
            Some(TransportHeader::Icmpv4(icmp)) => match icmp.icmp_type {
                Icmpv4Type::EchoRequest(echo) => {
                    assert_eq!(echo.id, 1);
                    assert_eq!(echo.seq, 1);
                }
                other => panic!("期望 EchoRequest，得到 {other:?}"),
            },
            other => panic!("期望 ICMPv4 传输头，得到 {other:?}"),
        }
    }

    #[test]
    fn icmp_invalid_dst_ip_rejected() {
        let mut spec = sample();
        spec.dst_ip = "1.2.3".into();
        assert!(matches!(build_icmp(&spec), Err(BuildError::InvalidIp { .. })));
    }
}
