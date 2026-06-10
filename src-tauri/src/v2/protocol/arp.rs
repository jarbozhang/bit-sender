//! ARP（over Ethernet）。完整帧 = 以太网头(14) + ARP 报文(28) + 补 0 到 60。

use serde::{Deserialize, Serialize};
use specta::Type;

use super::{parse_hex, parse_ipv4, parse_mac, BuildError, ETHERTYPE_ARP, MIN_ETHERNET_FRAME};

/// ARP 帧规格。以太网头部 + ARP 报文全部字段。
/// 注意：以太网层 src/dst MAC 与 ARP 层 sender/target MAC 分开建模——二者可不同。
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct ArpSpec {
    // 以太网头
    pub dst_mac: String,
    pub src_mac: String,
    // ARP 报文
    pub hw_type: u16,
    pub proto_type: u16,
    pub hw_size: u8,
    pub proto_size: u8,
    pub opcode: u16,
    pub sender_mac: String,
    pub sender_ip: String,
    pub target_mac: String,
    pub target_ip: String,
    pub payload_hex: String,
}

pub fn build_arp(spec: &ArpSpec) -> Result<Vec<u8>, BuildError> {
    let mut frame = Vec::with_capacity(MIN_ETHERNET_FRAME);

    // 以太网头：ARP 的 ether_type 恒为 0x0806，不开放给用户写错。
    frame.extend_from_slice(&parse_mac("dst_mac", &spec.dst_mac)?);
    frame.extend_from_slice(&parse_mac("src_mac", &spec.src_mac)?);
    frame.extend_from_slice(&ETHERTYPE_ARP.to_be_bytes());

    // ARP 报文
    frame.extend_from_slice(&spec.hw_type.to_be_bytes());
    frame.extend_from_slice(&spec.proto_type.to_be_bytes());
    frame.push(spec.hw_size);
    frame.push(spec.proto_size);
    frame.extend_from_slice(&spec.opcode.to_be_bytes());
    frame.extend_from_slice(&parse_mac("sender_mac", &spec.sender_mac)?);
    frame.extend_from_slice(&parse_ipv4("sender_ip", &spec.sender_ip)?);
    frame.extend_from_slice(&parse_mac("target_mac", &spec.target_mac)?);
    frame.extend_from_slice(&parse_ipv4("target_ip", &spec.target_ip)?);

    frame.extend_from_slice(&parse_hex(&spec.payload_hex)?);

    if frame.len() < MIN_ETHERNET_FRAME {
        frame.resize(MIN_ETHERNET_FRAME, 0);
    }
    Ok(frame)
}

#[cfg(test)]
mod golden {
    use super::*;

    fn sample() -> ArpSpec {
        ArpSpec {
            dst_mac: "FF:FF:FF:FF:FF:FF".into(),
            src_mac: "00:11:22:33:44:55".into(),
            hw_type: 1,
            proto_type: 0x0800,
            hw_size: 6,
            proto_size: 4,
            opcode: 1, // request
            sender_mac: "00:11:22:33:44:55".into(),
            sender_ip: "192.168.1.10".into(),
            target_mac: "00:00:00:00:00:00".into(),
            target_ip: "192.168.1.1".into(),
            payload_hex: String::new(),
        }
    }

    #[test]
    fn arp_request_full_frame() {
        let frame = build_arp(&sample()).unwrap();
        let mut expected = vec![
            // 以太网头
            0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, // dst
            0x00, 0x11, 0x22, 0x33, 0x44, 0x55, // src
            0x08, 0x06, // ether_type ARP
            // ARP 报文
            0x00, 0x01, // hw_type Ethernet
            0x08, 0x00, // proto_type IPv4
            0x06, // hw_size
            0x04, // proto_size
            0x00, 0x01, // opcode request
            0x00, 0x11, 0x22, 0x33, 0x44, 0x55, // sender mac
            192, 168, 1, 10, // sender ip
            0x00, 0x00, 0x00, 0x00, 0x00, 0x00, // target mac
            192, 168, 1, 1, // target ip
        ];
        expected.resize(60, 0); // 42 字节补到 60
        assert_eq!(frame, expected, "ARP 完整帧字节必须与 golden 一致");
        assert_eq!(frame.len(), 60);
    }

    #[test]
    fn arp_padded_to_60_not_64() {
        // v1 误补到 64；v2 必须是 60。
        let frame = build_arp(&sample()).unwrap();
        assert_eq!(frame.len(), 60, "ARP 最小帧必须是 60 字节");
    }

    #[test]
    fn arp_invalid_sender_ip_rejected() {
        let mut spec = sample();
        spec.sender_ip = "999.1.1.1".into();
        assert!(matches!(build_arp(&spec), Err(BuildError::InvalidIp { .. })));
    }

    /// 用 etherparse 交叉验证 ARP 报文段（以太网头 + ARP）能被正确解析回原值。
    #[test]
    fn arp_cross_check_with_etherparse() {
        use etherparse::{LaxPacketHeaders, LinkHeader};
        let frame = build_arp(&sample()).unwrap();
        let parsed = LaxPacketHeaders::from_ethernet(&frame).expect("etherparse 应能解析以太网头");
        match parsed.link {
            Some(LinkHeader::Ethernet2(eth)) => {
                assert_eq!(eth.source, [0x00, 0x11, 0x22, 0x33, 0x44, 0x55]);
                assert_eq!(eth.destination, [0xFF; 6]);
                assert_eq!(u16::from(eth.ether_type), 0x0806);
            }
            other => panic!("期望 Ethernet2 链路头，得到 {:?}", other),
        }
    }
}
