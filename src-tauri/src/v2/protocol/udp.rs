//! UDP（over IPv4 over Ethernet）。完整帧 = 以太网(14)+IPv4(20)+UDP(8)+payload。
//!
//! 校验和：覆盖 [伪首部 + UDP 头(校验和位置置0) + payload]，伪首部 length 字段
//! = UDP 头(8) + payload。RFC 768 特例：算出 0 时传 0xFFFF（在 l4_checksum 内处理）。
//! v1 未算伪首部校验和——核心 bug。

use serde::{Deserialize, Serialize};
use specta::Type;

use super::ipv4::{build_ipv4_header, resolve_checksum};
use super::{
    l4_checksum, parse_hex, parse_ipv4, parse_mac, BuildError, ETHERTYPE_IPV4, IP_PROTO_UDP,
    MIN_ETHERNET_FRAME,
};

/// UDP 帧规格。IPv4 层同 TcpSpec 用固定默认，仅暴露 ttl/identification。
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct UdpSpec {
    // 以太网头
    pub dst_mac: String,
    pub src_mac: String,
    // IPv4 头（暴露的子集）
    pub ttl: u8,
    pub identification: u16,
    pub src_ip: String,
    pub dst_ip: String,
    // UDP 头
    pub src_port: u16,
    pub dst_port: u16,
    pub checksum: Option<u16>,
    pub payload_hex: String,
}

pub fn build_udp(spec: &UdpSpec) -> Result<Vec<u8>, BuildError> {
    let src_ip = parse_ipv4("src_ip", &spec.src_ip)?;
    let dst_ip = parse_ipv4("dst_ip", &spec.dst_ip)?;
    let payload = parse_hex(&spec.payload_hex)?;

    let udp_length = (8 + payload.len()) as u16;

    // 组装 UDP 段（头8 + payload），校验和先置 0。
    let mut segment = Vec::with_capacity(8 + payload.len());
    segment.extend_from_slice(&spec.src_port.to_be_bytes());
    segment.extend_from_slice(&spec.dst_port.to_be_bytes());
    segment.extend_from_slice(&udp_length.to_be_bytes());
    let checksum_pos = segment.len();
    segment.extend_from_slice(&[0x00, 0x00]); // checksum 占位
    segment.extend_from_slice(&payload);

    let checksum = resolve_checksum(spec.checksum, || {
        l4_checksum(src_ip, dst_ip, IP_PROTO_UDP, &segment)
    });
    segment[checksum_pos..checksum_pos + 2].copy_from_slice(&checksum.to_be_bytes());

    let total_len = (20 + segment.len()) as u16;
    let ip_header = build_ipv4_header(
        4,
        5,
        0,
        spec.identification,
        2, // DF
        0,
        spec.ttl,
        IP_PROTO_UDP,
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
    frame.extend_from_slice(&segment);

    if frame.len() < MIN_ETHERNET_FRAME {
        frame.resize(MIN_ETHERNET_FRAME, 0);
    }
    Ok(frame)
}

#[cfg(test)]
mod golden {
    use super::*;

    fn sample() -> UdpSpec {
        UdpSpec {
            dst_mac: "FF:FF:FF:FF:FF:FF".into(),
            src_mac: "00:11:22:33:44:55".into(),
            ttl: 64,
            identification: 0,
            src_ip: "192.168.1.100".into(),
            dst_ip: "192.168.1.1".into(),
            src_port: 12345,
            dst_port: 53,
            checksum: None,
            payload_hex: "DEADBEEF".into(),
        }
    }

    #[test]
    fn udp_full_frame_layout() {
        let frame = build_udp(&sample()).unwrap();
        // 14 + 20 + 8 + 4 = 46，补到 60。
        assert_eq!(frame.len(), 60);
        assert_eq!(frame[14 + 9], IP_PROTO_UDP); // IP protocol = 17
        let udp = &frame[34..42];
        assert_eq!(&udp[0..2], &[0x30, 0x39]); // src port 12345
        assert_eq!(&udp[2..4], &[0x00, 0x35]); // dst port 53
        assert_eq!(&udp[4..6], &[0x00, 0x0C]); // length 8+4=12
        assert_eq!(&frame[42..46], &[0xDE, 0xAD, 0xBE, 0xEF]); // payload
    }

    #[test]
    fn udp_checksum_self_validates() {
        let frame = build_udp(&sample()).unwrap();
        let udp_segment = &frame[34..46]; // 头8 + payload4 = 12
        let mut pseudo = Vec::new();
        pseudo.extend_from_slice(&[192, 168, 1, 100]);
        pseudo.extend_from_slice(&[192, 168, 1, 1]);
        pseudo.push(0);
        pseudo.push(IP_PROTO_UDP);
        pseudo.extend_from_slice(&(udp_segment.len() as u16).to_be_bytes());
        pseudo.extend_from_slice(udp_segment);
        assert_eq!(
            super::super::ones_complement_sum(&pseudo),
            0xFFFF,
            "UDP 伪首部校验和应自校验为 0xFFFF"
        );
    }

    #[test]
    fn udp_cross_check_with_etherparse() {
        use etherparse::{LaxPacketHeaders, TransportHeader};
        let frame = build_udp(&sample()).unwrap();
        let parsed = LaxPacketHeaders::from_ethernet(&frame).unwrap();
        match parsed.transport {
            Some(TransportHeader::Udp(udp)) => {
                assert_eq!(udp.source_port, 12345);
                assert_eq!(udp.destination_port, 53);
                assert_eq!(udp.length, 12);
            }
            other => panic!("期望 UDP 传输头，得到 {other:?}"),
        }
    }

    #[test]
    fn udp_user_checksum_override_used() {
        let mut spec = sample();
        spec.checksum = Some(0xCAFE);
        let frame = build_udp(&spec).unwrap();
        // UDP 校验和在 segment 内偏移 6 → 帧偏移 34+6=40。
        assert_eq!(&frame[40..42], &[0xCA, 0xFE]);
    }
}
