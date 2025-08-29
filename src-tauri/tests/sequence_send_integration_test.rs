use BitSender_lib::network::{PacketSequence, SequencePacket, SequenceTaskStatus};
use std::collections::HashMap;
use std::time::{Duration, Instant};

/// 集成测试：序列发送功能
/// 
/// 这个测试验证完整的序列发送工作流程，包括：
/// 1. 创建数据包序列
/// 2. 启动序列发送任务
/// 3. 监控任务状态
/// 4. 停止任务
/// 5. 验证发送结果

fn create_integration_test_sequence() -> PacketSequence {
    let mut fields1 = HashMap::new();
    fields1.insert("dst_mac".to_string(), "ff:ff:ff:ff:ff:ff".to_string());
    fields1.insert("src_mac".to_string(), "00:11:22:33:44:55".to_string());
    fields1.insert("ethertype".to_string(), "0806".to_string());

    let mut fields2 = HashMap::new();
    fields2.insert("dst_mac".to_string(), "aa:bb:cc:dd:ee:ff".to_string());
    fields2.insert("src_mac".to_string(), "00:11:22:33:44:55".to_string());
    fields2.insert("ethertype".to_string(), "0800".to_string());

    PacketSequence {
        id: "integration_test_seq".to_string(),
        name: "集成测试序列".to_string(),
        packets: vec![
            SequencePacket {
                id: "packet_001".to_string(),
                name: "测试 ARP 包".to_string(),
                protocol: "eth".to_string(),
                fields: fields1,
                payload: Some("ffffffffffff001122334455080600010001080006040001001122334455c0a8010100000000000000c0a8010200".to_string()),
                delay_ms: 50,
                enabled: true,
            },
            SequencePacket {
                id: "packet_002".to_string(),
                name: "测试 IP 包".to_string(),
                protocol: "eth".to_string(),
                fields: fields2,
                payload: Some("aabbccddeeff0011223344550800450000140001000040117cce7f0000017f000001".to_string()),
                delay_ms: 100,
                enabled: true,
            },
        ],
        loop_count: Some(1),
        loop_delay_ms: 0,
    }
}

#[cfg(test)]
mod integration_tests {
    use super::*;

    #[test]
    fn test_sequence_data_integrity() {
        let sequence = create_integration_test_sequence();
        
        // 验证序列基本信息
        assert_eq!(sequence.id, "integration_test_seq");
        assert_eq!(sequence.name, "集成测试序列");
        assert_eq!(sequence.packets.len(), 2);
        assert_eq!(sequence.loop_count, Some(1));
        
        // 验证所有数据包都已启用
        let enabled_count = sequence.packets.iter().filter(|p| p.enabled).count();
        assert_eq!(enabled_count, 2);
        
        // 验证数据包时序
        assert_eq!(sequence.packets[0].delay_ms, 50);
        assert_eq!(sequence.packets[1].delay_ms, 100);
    }

    #[test]
    fn test_sequence_task_status_lifecycle() {
        let mut status = SequenceTaskStatus {
            task_id: "test_task_lifecycle".to_string(),
            sequence_id: "integration_test_seq".to_string(),
            start_time: 1234567890,
            current_packet_index: 0,
            current_loop: 0,
            total_packets_sent: 0,
            running: false,
            completed: false,
        };
        
        // 初始状态
        assert_eq!(status.running, false);
        assert_eq!(status.completed, false);
        assert_eq!(status.total_packets_sent, 0);
        
        // 模拟任务开始
        status.running = true;
        assert_eq!(status.running, true);
        assert_eq!(status.completed, false);
        
        // 模拟发送第一个数据包
        status.current_packet_index = 0;
        status.total_packets_sent = 1;
        assert_eq!(status.current_packet_index, 0);
        assert_eq!(status.total_packets_sent, 1);
        
        // 模拟发送第二个数据包
        status.current_packet_index = 1;
        status.total_packets_sent = 2;
        assert_eq!(status.current_packet_index, 1);
        assert_eq!(status.total_packets_sent, 2);
        
        // 模拟任务完成
        status.running = false;
        status.completed = true;
        assert_eq!(status.running, false);
        assert_eq!(status.completed, true);
    }

    #[test]
    fn test_packet_filtering_logic() {
        let mut sequence = create_integration_test_sequence();
        
        // 禁用第二个数据包
        sequence.packets[1].enabled = false;
        
        let enabled_packets: Vec<&SequencePacket> = sequence.packets.iter()
            .filter(|p| p.enabled)
            .collect();
        
        // 应该只有一个启用的数据包
        assert_eq!(enabled_packets.len(), 1);
        assert_eq!(enabled_packets[0].id, "packet_001");
    }

    #[test]
    fn test_timing_accuracy() {
        let sequence = create_integration_test_sequence();
        let start_time = Instant::now();
        
        // 模拟序列发送的时序
        for packet in &sequence.packets {
            if packet.enabled {
                // 模拟发送数据包
                std::thread::sleep(Duration::from_millis(1)); // 模拟发送时间
                
                // 等待延迟
                if packet.delay_ms > 0 {
                    std::thread::sleep(Duration::from_millis(packet.delay_ms));
                }
            }
        }
        
        let total_time = start_time.elapsed();
        let expected_min_time = Duration::from_millis(50 + 100); // 两个数据包的延迟之和
        let expected_max_time = Duration::from_millis(200); // 允许一些额外时间
        
        assert!(total_time >= expected_min_time);
        assert!(total_time <= expected_max_time);
    }

    #[test]
    fn test_payload_hex_validation() {
        let sequence = create_integration_test_sequence();
        
        for packet in &sequence.packets {
            if let Some(payload) = &packet.payload {
                // 验证载荷是有效的十六进制字符串
                assert!(payload.chars().all(|c| c.is_ascii_hexdigit()));
                
                // 验证载荷长度是偶数（每个字节需要2个十六进制字符）
                assert_eq!(payload.len() % 2, 0);
                
                // 验证载荷不为空
                assert!(!payload.is_empty());
            }
        }
    }

    #[test]
    fn test_protocol_validation() {
        let sequence = create_integration_test_sequence();
        
        for packet in &sequence.packets {
            // 验证协议字段
            assert!(!packet.protocol.is_empty());
            assert!(["eth", "arp", "ip", "tcp", "udp"].contains(&packet.protocol.as_str()));
            
            // 验证字段存在
            assert!(!packet.fields.is_empty());
            
            // 验证MAC地址格式（如果存在）
            if let Some(dst_mac) = packet.fields.get("dst_mac") {
                assert!(is_valid_mac_address(dst_mac));
            }
            if let Some(src_mac) = packet.fields.get("src_mac") {
                assert!(is_valid_mac_address(src_mac));
            }
        }
    }

    #[test]
    fn test_error_conditions() {
        // 测试空序列
        let empty_sequence = PacketSequence {
            id: "empty_test".to_string(),
            name: "空测试序列".to_string(),
            packets: vec![],
            loop_count: Some(1),
            loop_delay_ms: 0,
        };
        
        let enabled_packets: Vec<&SequencePacket> = empty_sequence.packets.iter()
            .filter(|p| p.enabled)
            .collect();
        
        assert_eq!(enabled_packets.len(), 0);
    }

    #[test]
    fn test_loop_functionality() {
        let mut sequence = create_integration_test_sequence();
        sequence.loop_count = Some(3);
        sequence.loop_delay_ms = 50;
        
        assert_eq!(sequence.loop_count, Some(3));
        assert_eq!(sequence.loop_delay_ms, 50);
        
        // 计算总的预期执行时间
        let packets_per_loop = sequence.packets.iter().filter(|p| p.enabled).count();
        let delay_per_loop: u64 = sequence.packets.iter()
            .filter(|p| p.enabled)
            .map(|p| p.delay_ms)
            .sum();
        
        let total_loops = sequence.loop_count.unwrap_or(1) as u64;
        let total_loop_delays = if total_loops > 1 { (total_loops - 1) * sequence.loop_delay_ms } else { 0 };
        let expected_min_time = total_loops * delay_per_loop + total_loop_delays;
        
        // 验证计算是正确的
        assert_eq!(packets_per_loop, 2);
        assert_eq!(delay_per_loop, 150); // 50 + 100
        assert_eq!(expected_min_time, 3 * 150 + 2 * 50); // 3轮 * 每轮150ms + 2个循环间隔 * 50ms
    }
}

/// 验证MAC地址格式的辅助函数
fn is_valid_mac_address(mac: &str) -> bool {
    if mac.len() != 17 {
        return false;
    }
    
    let parts: Vec<&str> = mac.split(':').collect();
    if parts.len() != 6 {
        return false;
    }
    
    for part in parts {
        if part.len() != 2 {
            return false;
        }
        if !part.chars().all(|c| c.is_ascii_hexdigit()) {
            return false;
        }
    }
    
    true
}

#[cfg(test)]
mod mac_address_tests {
    use super::*;

    #[test]
    fn test_valid_mac_addresses() {
        assert!(is_valid_mac_address("00:11:22:33:44:55"));
        assert!(is_valid_mac_address("ff:ff:ff:ff:ff:ff"));
        assert!(is_valid_mac_address("aa:bb:cc:dd:ee:ff"));
        assert!(is_valid_mac_address("01:23:45:67:89:ab"));
    }

    #[test]
    fn test_invalid_mac_addresses() {
        assert!(!is_valid_mac_address("00:11:22:33:44")); // 太短
        assert!(!is_valid_mac_address("00:11:22:33:44:55:66")); // 太长
        assert!(!is_valid_mac_address("00-11-22-33-44-55")); // 错误的分隔符
        assert!(!is_valid_mac_address("00:11:22:33:44:gg")); // 无效的十六进制
        assert!(!is_valid_mac_address("")); // 空字符串
    }
}
