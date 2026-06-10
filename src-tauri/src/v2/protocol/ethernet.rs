//! 以太网帧（L2）。最小帧补到 60 字节，FCS 由网卡追加。

use serde::{Deserialize, Serialize};
use specta::Type;

use super::{parse_hex, parse_mac, BuildError, MIN_ETHERNET_FRAME};

/// 以太网帧规格。字段命名为单一事实来源，经 specta 自动生成同名 TS 类型。
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct EthernetSpec {
    pub dst_mac: String,
    pub src_mac: String,
    pub ether_type: u16,
    pub payload_hex: String,
}

pub fn build_ethernet(spec: &EthernetSpec) -> Result<Vec<u8>, BuildError> {
    let mut frame = Vec::with_capacity(MIN_ETHERNET_FRAME);
    frame.extend_from_slice(&parse_mac("dst_mac", &spec.dst_mac)?);
    frame.extend_from_slice(&parse_mac("src_mac", &spec.src_mac)?);
    frame.extend_from_slice(&spec.ether_type.to_be_bytes());
    frame.extend_from_slice(&parse_hex(&spec.payload_hex)?);
    if frame.len() < MIN_ETHERNET_FRAME {
        frame.resize(MIN_ETHERNET_FRAME, 0);
    }
    Ok(frame)
}

#[cfg(test)]
mod golden {
    use super::*;

    #[test]
    fn ethernet_arp_broadcast_full_frame() {
        let spec = EthernetSpec {
            dst_mac: "FF:FF:FF:FF:FF:FF".into(),
            src_mac: "00:11:22:33:44:55".into(),
            ether_type: 0x0806,
            payload_hex: "0001".into(),
        };
        let frame = build_ethernet(&spec).unwrap();
        let mut expected = vec![
            0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, // dst mac
            0x00, 0x11, 0x22, 0x33, 0x44, 0x55, // src mac
            0x08, 0x06, // ether_type
            0x00, 0x01, // payload
        ];
        expected.resize(60, 0); // pad 到最小帧
        assert_eq!(frame, expected, "完整以太网帧字节必须与 golden 一致");
    }

    #[test]
    fn invalid_mac_is_rejected_not_defaulted() {
        // v1 在此会静默回退到 00:00:00:00:00:00；v2 必须报错。
        let spec = EthernetSpec {
            dst_mac: "GG:GG:GG:GG:GG:GG".into(),
            src_mac: "00:11:22:33:44:55".into(),
            ether_type: 0x0800,
            payload_hex: String::new(),
        };
        assert!(matches!(
            build_ethernet(&spec),
            Err(BuildError::InvalidMac { .. })
        ));
    }

    #[test]
    fn invalid_hex_payload_is_rejected() {
        let spec = EthernetSpec {
            dst_mac: "FF:FF:FF:FF:FF:FF".into(),
            src_mac: "00:11:22:33:44:55".into(),
            ether_type: 0x0800,
            payload_hex: "ZZ".into(),
        };
        assert!(matches!(
            build_ethernet(&spec),
            Err(BuildError::InvalidHex(_))
        ));
    }
}
