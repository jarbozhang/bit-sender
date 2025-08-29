use super::*;
use std::collections::HashMap;

/// 创建测试用的序列数据包
pub fn create_test_sequence() -> PacketSequence {
    let mut fields1 = HashMap::new();
    fields1.insert("dst_mac".to_string(), "ff:ff:ff:ff:ff:ff".to_string());
    fields1.insert("src_mac".to_string(), "00:11:22:33:44:55".to_string());
    fields1.insert("ethertype".to_string(), "0806".to_string());

    let mut fields2 = HashMap::new();
    fields2.insert("dst_mac".to_string(), "00:11:22:33:44:55".to_string());
    fields2.insert("src_mac".to_string(), "aa:bb:cc:dd:ee:ff".to_string());
    fields2.insert("ethertype".to_string(), "0800".to_string());

    PacketSequence {
        id: "test_sequence_001".to_string(),
        name: "测试序列".to_string(),
        packets: vec![
            SequencePacket {
                id: "packet_001".to_string(),
                name: "ARP 广播".to_string(),
                protocol: "eth".to_string(),
                fields: fields1,
                payload: Some("000100010800060400010011223344550a00000100000000000000000a000002".to_string()),
                delay_ms: 100,
                enabled: true,
            },
            SequencePacket {
                id: "packet_002".to_string(),
                name: "IP 数据包".to_string(),
                protocol: "eth".to_string(),
                fields: fields2,
                payload: Some("4500001c000040004011f7630a0000010a00000200350035000800000000".to_string()),
                delay_ms: 200,
                enabled: true,
            },
            SequencePacket {
                id: "packet_003".to_string(),
                name: "禁用的数据包".to_string(),
                protocol: "eth".to_string(),
                fields: HashMap::new(),
                payload: Some("deadbeef".to_string()),
                delay_ms: 50,
                enabled: false, // 这个数据包被禁用
            },
        ],
        loop_count: Some(2), // 循环2次
        loop_delay_ms: 1000, // 每轮循环间隔1秒
    }
}

/// 创建单个测试数据包
pub fn create_test_packet(id: &str, delay_ms: u64, enabled: bool) -> SequencePacket {
    let mut fields = HashMap::new();
    fields.insert("dst_mac".to_string(), "ff:ff:ff:ff:ff:ff".to_string());
    fields.insert("src_mac".to_string(), "00:11:22:33:44:55".to_string());
    fields.insert("ethertype".to_string(), "0806".to_string());

    SequencePacket {
        id: id.to_string(),
        name: format!("测试数据包 {}", id),
        protocol: "eth".to_string(),
        fields,
        payload: Some("ffffffffffff001122334455080600010001080006040001001122334455c0a801010000000000000c0a80102".to_string()),
        delay_ms,
        enabled,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{Duration, Instant};

    #[test]
    fn test_sequence_packet_creation() {
        let packet = create_test_packet("test_001", 100, true);
        
        assert_eq!(packet.id, "test_001");
        assert_eq!(packet.delay_ms, 100);
        assert_eq!(packet.enabled, true);
        assert_eq!(packet.protocol, "eth");
        assert!(packet.payload.is_some());
        
        // 验证字段
        assert_eq!(packet.fields.get("dst_mac"), Some(&"ff:ff:ff:ff:ff:ff".to_string()));
        assert_eq!(packet.fields.get("src_mac"), Some(&"00:11:22:33:44:55".to_string()));
    }

    #[test]
    fn test_packet_sequence_creation() {
        let sequence = create_test_sequence();
        
        assert_eq!(sequence.id, "test_sequence_001");
        assert_eq!(sequence.name, "测试序列");
        assert_eq!(sequence.packets.len(), 3);
        assert_eq!(sequence.loop_count, Some(2));
        assert_eq!(sequence.loop_delay_ms, 1000);
        
        // 验证第一个数据包
        let first_packet = &sequence.packets[0];
        assert_eq!(first_packet.name, "ARP 广播");
        assert_eq!(first_packet.delay_ms, 100);
        assert_eq!(first_packet.enabled, true);
        
        // 验证第二个数据包
        let second_packet = &sequence.packets[1];
        assert_eq!(second_packet.name, "IP 数据包");
        assert_eq!(second_packet.delay_ms, 200);
        assert_eq!(second_packet.enabled, true);
        
        // 验证第三个数据包（禁用）
        let third_packet = &sequence.packets[2];
        assert_eq!(third_packet.enabled, false);
    }

    #[test]
    fn test_enabled_packets_filter() {
        let sequence = create_test_sequence();
        let enabled_packets: Vec<&SequencePacket> = sequence.packets.iter()
            .filter(|p| p.enabled)
            .collect();
        
        // 应该只有2个启用的数据包
        assert_eq!(enabled_packets.len(), 2);
        assert_eq!(enabled_packets[0].name, "ARP 广播");
        assert_eq!(enabled_packets[1].name, "IP 数据包");
    }

    #[test]
    fn test_sequence_timing() {
        let packet1 = create_test_packet("timing_001", 50, true);
        let packet2 = create_test_packet("timing_002", 100, true);
        
        let start = Instant::now();
        
        // 模拟发送第一个数据包
        std::thread::sleep(Duration::from_millis(packet1.delay_ms));
        let after_first = Instant::now();
        
        // 模拟发送第二个数据包
        std::thread::sleep(Duration::from_millis(packet2.delay_ms));
        let after_second = Instant::now();
        
        // 验证时间间隔
        let first_duration = after_first.duration_since(start);
        let second_duration = after_second.duration_since(after_first);
        
        // 允许一定的时间误差（±20ms，考虑系统负载）
        assert!(first_duration >= Duration::from_millis(40));
        assert!(first_duration <= Duration::from_millis(80));
        assert!(second_duration >= Duration::from_millis(80));
        assert!(second_duration <= Duration::from_millis(130));
    }

    #[test]
    fn test_sequence_task_status() {
        let status = SequenceTaskStatus {
            task_id: "test_task_001".to_string(),
            sequence_id: "test_sequence_001".to_string(),
            start_time: 1234567890,
            current_packet_index: 1,
            current_loop: 0,
            total_packets_sent: 2,
            running: true,
            completed: false,
        };
        
        assert_eq!(status.task_id, "test_task_001");
        assert_eq!(status.current_packet_index, 1);
        assert_eq!(status.total_packets_sent, 2);
        assert_eq!(status.running, true);
        assert_eq!(status.completed, false);
    }

    #[test]
    fn test_packet_data_conversion() {
        let sequence_packet = create_test_packet("conv_001", 100, true);
        
        // 转换为 PacketData
        let packet_data = PacketData {
            protocol: sequence_packet.protocol.clone(),
            fields: sequence_packet.fields.clone(),
            payload: sequence_packet.payload.clone(),
        };
        
        assert_eq!(packet_data.protocol, "eth");
        assert_eq!(packet_data.fields.len(), 3); // dst_mac, src_mac, ethertype
        assert!(packet_data.payload.is_some());
    }

    #[test]
    fn test_loop_count_scenarios() {
        // 测试无限循环
        let mut sequence = create_test_sequence();
        sequence.loop_count = None;
        assert_eq!(sequence.loop_count, None);
        
        // 测试单次执行
        sequence.loop_count = Some(1);
        assert_eq!(sequence.loop_count, Some(1));
        
        // 测试多次循环
        sequence.loop_count = Some(5);
        assert_eq!(sequence.loop_count, Some(5));
    }

    #[test]
    fn test_empty_sequence_handling() {
        let empty_sequence = PacketSequence {
            id: "empty_001".to_string(),
            name: "空序列".to_string(),
            packets: vec![],
            loop_count: Some(1),
            loop_delay_ms: 0,
        };
        
        assert_eq!(empty_sequence.packets.len(), 0);
        
        // 过滤启用的数据包应该返回空数组
        let enabled_packets: Vec<&SequencePacket> = empty_sequence.packets.iter()
            .filter(|p| p.enabled)
            .collect();
        assert_eq!(enabled_packets.len(), 0);
    }

    #[test]
    fn test_large_delay_values() {
        let packet = create_test_packet("large_delay", 5000, true); // 5秒延迟
        assert_eq!(packet.delay_ms, 5000);
        
        // 测试零延迟
        let zero_delay_packet = create_test_packet("zero_delay", 0, true);
        assert_eq!(zero_delay_packet.delay_ms, 0);
    }
}
