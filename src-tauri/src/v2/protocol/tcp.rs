//! TCP（over IPv4 over Ethernet）。完整帧 = 以太网(14)+IPv4(20)+TCP(20)+payload。
//!
//! 校验和：覆盖 [伪首部 + TCP 头(校验和位置置0) + payload]。伪首部 =
//! src_ip(4)+dst_ip(4)+zero(1)+protocol(1)+tcp_length(2)，其中 tcp_length 是
//! TCP 头 + payload 的字节数。v1 完全没算这个伪首部校验和——这是核心 bug。

use serde::{Deserialize, Serialize};
use specta::Type;

use super::ipv4::{build_ipv4_header, resolve_checksum};
use super::{
    l4_checksum, parse_hex, parse_ipv4, parse_mac, BuildError, ETHERTYPE_IPV4, IP_PROTO_TCP,
    MIN_ETHERNET_FRAME,
};

/// TCP 帧规格。以太网头 + IPv4 头(常用子集) + TCP 头(20B, 无选项) + payload。
/// IPv4 层用固定默认（version 4 / ihl 5 / dscp 0 / flags DF / offset 0 / 自动算 IP 校验和），
/// 仅暴露 ttl 与 identification 供调整；如需精细控制 IPv4 头请直接用 Ipv4Spec。
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct TcpSpec {
    // 以太网头
    pub dst_mac: String,
    pub src_mac: String,
    // IPv4 头（暴露的子集）
    pub ttl: u8,
    pub identification: u16,
    pub src_ip: String,
    pub dst_ip: String,
    // TCP 头
    pub src_port: u16,
    pub dst_port: u16,
    pub seq: u32,
    pub ack: u32,
    /// 数据偏移（以 4 字节为单位），无选项时为 5。会被 clamp 到 [5,15]。
    pub data_offset: u8,
    pub flag_urg: bool,
    pub flag_ack: bool,
    pub flag_psh: bool,
    pub flag_rst: bool,
    pub flag_syn: bool,
    pub flag_fin: bool,
    pub window_size: u16,
    pub checksum: Option<u16>,
    pub urgent_pointer: u16,
    pub payload_hex: String,
}

pub fn build_tcp(spec: &TcpSpec) -> Result<Vec<u8>, BuildError> {
    let src_ip = parse_ipv4("src_ip", &spec.src_ip)?;
    let dst_ip = parse_ipv4("dst_ip", &spec.dst_ip)?;
    let payload = parse_hex(&spec.payload_hex)?;

    // 先组装 TCP 段（头 + payload），校验和位置先置 0。
    let mut segment = Vec::with_capacity(20 + payload.len());
    segment.extend_from_slice(&spec.src_port.to_be_bytes());
    segment.extend_from_slice(&spec.dst_port.to_be_bytes());
    segment.extend_from_slice(&spec.seq.to_be_bytes());
    segment.extend_from_slice(&spec.ack.to_be_bytes());

    let data_offset = spec.data_offset.clamp(5, 15);
    // 第 12 字节：data_offset(4) | reserved(3=0) | NS(1=0)。
    segment.push((data_offset & 0x0F) << 4);
    // 第 13 字节：CWR ECE URG ACK PSH RST SYN FIN（CWR/ECE 不开放，置 0）。
    let flags = ((spec.flag_urg as u8) << 5)
        | ((spec.flag_ack as u8) << 4)
        | ((spec.flag_psh as u8) << 3)
        | ((spec.flag_rst as u8) << 2)
        | ((spec.flag_syn as u8) << 1)
        | (spec.flag_fin as u8);
    segment.push(flags);
    segment.extend_from_slice(&spec.window_size.to_be_bytes());
    let checksum_pos = segment.len();
    segment.extend_from_slice(&[0x00, 0x00]); // checksum 占位
    segment.extend_from_slice(&spec.urgent_pointer.to_be_bytes());
    segment.extend_from_slice(&payload);

    // 计算/覆盖 TCP 校验和（伪首部覆盖整个 segment）。
    let checksum = resolve_checksum(spec.checksum, || {
        l4_checksum(src_ip, dst_ip, IP_PROTO_TCP, &segment)
    });
    segment[checksum_pos..checksum_pos + 2].copy_from_slice(&checksum.to_be_bytes());

    // IPv4 头：total_len = 20(IP头) + segment。
    let total_len = (20 + segment.len()) as u16;
    let ip_header = build_ipv4_header(
        4,
        5,
        0,
        spec.identification,
        2, // DF
        0,
        spec.ttl,
        IP_PROTO_TCP,
        None, // IP 头校验和始终自动算
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

    fn sample() -> TcpSpec {
        TcpSpec {
            dst_mac: "FF:FF:FF:FF:FF:FF".into(),
            src_mac: "00:11:22:33:44:55".into(),
            ttl: 64,
            identification: 0,
            src_ip: "192.168.1.100".into(),
            dst_ip: "192.168.1.1".into(),
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
        }
    }

    #[test]
    fn tcp_syn_full_frame_layout() {
        let frame = build_tcp(&sample()).unwrap();
        // 14 eth + 20 ip + 20 tcp = 54，补到 60。
        assert_eq!(frame.len(), 60);
        assert_eq!(&frame[12..14], &[0x08, 0x00]); // IPv4
        assert_eq!(frame[14 + 9], IP_PROTO_TCP); // IP protocol = 6
        let tcp = &frame[34..54];
        assert_eq!(&tcp[0..2], &[0x30, 0x39]); // src port 12345
        assert_eq!(&tcp[2..4], &[0x00, 0x50]); // dst port 80
        assert_eq!(tcp[12], 0x50); // data_offset 5 << 4
        assert_eq!(tcp[13], 0x02); // SYN
        assert_eq!(&tcp[14..16], &[0x20, 0x00]); // window 8192
    }

    /// 从完整帧里按 IPv4 total-length 字段切出真实 L4 段（排除以太网补 0），
    /// 拼伪首部做反码求和。正确的校验和应使其等于 0xFFFF。
    fn l4_self_check_sum(frame: &[u8]) -> u16 {
        let ip_total = u16::from_be_bytes([frame[16], frame[17]]) as usize;
        let segment = &frame[34..14 + ip_total]; // 14 eth + ip_total = IP 段尾
        let mut pseudo = Vec::new();
        pseudo.extend_from_slice(&frame[26..30]); // src ip
        pseudo.extend_from_slice(&frame[30..34]); // dst ip
        pseudo.push(0);
        pseudo.push(frame[14 + 9]); // protocol
        pseudo.extend_from_slice(&(segment.len() as u16).to_be_bytes());
        pseudo.extend_from_slice(segment);
        super::super::ones_complement_sum(&pseudo)
    }

    #[test]
    fn tcp_checksum_self_validates() {
        // 正确的 TCP 校验和：伪首部 + TCP段 反码求和应为 0xFFFF。
        let frame = build_tcp(&sample()).unwrap();
        assert_eq!(l4_self_check_sum(&frame), 0xFFFF, "TCP 伪首部校验和应自校验为 0xFFFF");
    }

    #[test]
    fn tcp_checksum_self_validates_with_payload() {
        let mut spec = sample();
        spec.payload_hex = "48656C6C6F21".into(); // "Hello!" 6 字节（偶）
        let frame = build_tcp(&spec).unwrap();
        assert_eq!(l4_self_check_sum(&frame), 0xFFFF);
    }

    #[test]
    fn tcp_odd_payload_checksum_self_validates() {
        // 奇数 payload：校验和计算末尾补 0，自校验仍应为 0xFFFF。
        let mut spec = sample();
        spec.payload_hex = "ABCDEF".into(); // 3 字节（奇）
        let frame = build_tcp(&spec).unwrap();
        assert_eq!(l4_self_check_sum(&frame), 0xFFFF);
    }

    #[test]
    fn tcp_cross_check_with_etherparse() {
        use etherparse::{LaxPacketHeaders, TransportHeader};
        let mut spec = sample();
        spec.payload_hex = "48656C6C6F21".into();
        let frame = build_tcp(&spec).unwrap();
        let parsed = LaxPacketHeaders::from_ethernet(&frame).unwrap();
        match parsed.transport {
            Some(TransportHeader::Tcp(tcp)) => {
                assert_eq!(tcp.source_port, 12345);
                assert_eq!(tcp.destination_port, 80);
                assert!(tcp.syn);
                assert!(!tcp.ack);
            }
            other => panic!("期望 TCP 传输头，得到 {other:?}"),
        }
    }

    #[test]
    fn tcp_user_checksum_override_used() {
        let mut spec = sample();
        spec.checksum = Some(0x1A2B);
        let frame = build_tcp(&spec).unwrap();
        // TCP 校验和在 segment 内偏移 16 → 帧偏移 34+16=50。
        assert_eq!(&frame[50..52], &[0x1A, 0x2B]);
    }
}
