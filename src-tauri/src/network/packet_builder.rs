use crate::network::PacketData;
use anyhow::{Result, anyhow};

pub struct PacketBuilder {
    data: PacketData,
}

impl PacketBuilder {
    pub fn new(data: PacketData) -> Self {
        Self { data }
    }

    pub fn build(&self) -> Result<Vec<u8>> {
        match self.data.protocol.to_lowercase().as_str() {
            "ethernet" => self.build_ethernet_packet(),
            "ip" => self.build_ip_packet(),
            "tcp" => self.build_tcp_packet(),
            "udp" => self.build_udp_packet(),
            "arp" => self.build_arp_packet(),
            "icmp" => self.build_icmp_packet(),
            _ => Err(anyhow!("不支持的协议类型: {}", self.data.protocol)),
        }
    }

    fn build_ethernet_packet(&self) -> Result<Vec<u8>> {
        let mut packet = Vec::new();
        
        // 目标 MAC 地址 (6 bytes)
        let dst_mac = self.get_field("dst_mac", "00:00:00:00:00:00")?;
        packet.extend_from_slice(&self.parse_mac(&dst_mac)?);
        
        // 源 MAC 地址 (6 bytes)
        let src_mac = self.get_field("src_mac", "00:00:00:00:00:00")?;
        packet.extend_from_slice(&self.parse_mac(&src_mac)?);
        
        // 以太网类型 (2 bytes) - 默认 IPv4
        let ether_type = self.get_field("ether_type", "0800")?;
        packet.extend_from_slice(&self.parse_hex(&ether_type)?);
        
        // Payload
        if let Some(payload) = &self.data.payload {
            packet.extend_from_slice(&self.parse_hex(payload)?);
        }
        
        // 确保最小长度 64 字节
        while packet.len() < 64 {
            packet.push(0);
        }
        
        Ok(packet)
    }

    fn build_ip_packet(&self) -> Result<Vec<u8>> {
        let mut packet = Vec::new();
        
        // 版本和头部长度 (1 byte)
        packet.push(0x45); // IPv4, 头部长度 5*4=20 bytes
        
        // 服务类型 (1 byte)
        packet.push(0x00);
        
        // 总长度 (2 bytes) - 稍后填充
        packet.extend_from_slice(&[0x00, 0x00]);
        
        // 标识 (2 bytes)
        let id = self.get_field("id", "0000")?;
        packet.extend_from_slice(&self.parse_hex(&id)?);
        
        // 标志和片偏移 (2 bytes)
        packet.extend_from_slice(&[0x00, 0x00]);
        
        // TTL (1 byte)
        let ttl = self.get_field("ttl", "64")?;
        packet.push(ttl.parse::<u8>().unwrap_or(64));
        
        // 协议 (1 byte) - 默认 TCP
        let protocol = self.get_field("protocol", "06")?;
        packet.push(u8::from_str_radix(&protocol, 16).unwrap_or(6));
        
        // 校验和 (2 bytes) - 稍后计算
        packet.extend_from_slice(&[0x00, 0x00]);
        
        // 源 IP (4 bytes)
        let src_ip = self.get_field("src_ip", "192.168.1.1")?;
        packet.extend_from_slice(&self.parse_ip(&src_ip)?);
        
        // 目标 IP (4 bytes)
        let dst_ip = self.get_field("dst_ip", "192.168.1.2")?;
        packet.extend_from_slice(&self.parse_ip(&dst_ip)?);
        
        // Payload
        if let Some(payload) = &self.data.payload {
            packet.extend_from_slice(&self.parse_hex(payload)?);
        }
        
        // 计算并填充总长度
        let total_length = packet.len() as u16;
        packet[2] = (total_length >> 8) as u8;
        packet[3] = total_length as u8;
        
        // 计算并填充校验和
        let checksum = self.calculate_ip_checksum(&packet[0..20]);
        packet[10] = (checksum >> 8) as u8;
        packet[11] = checksum as u8;
        
        Ok(packet)
    }

    fn build_tcp_packet(&self) -> Result<Vec<u8>> {
        // 先构建 IP 头部
        let mut packet = self.build_ip_packet()?;
        
        // TCP 头部 (20 bytes)
        let src_port = self.get_field("src_port", "1234")?;
        let src_port = u16::from_str_radix(&src_port, 16).unwrap_or(0x04D2);
        packet.extend_from_slice(&src_port.to_be_bytes());
        
        let dst_port = self.get_field("dst_port", "5678")?;
        let dst_port = u16::from_str_radix(&dst_port, 16).unwrap_or(0x162E);
        packet.extend_from_slice(&dst_port.to_be_bytes());
        
        // 序列号 (4 bytes)
        let seq = self.get_field("seq", "00000000")?;
        packet.extend_from_slice(&self.parse_hex(&seq)?);
        
        // 确认号 (4 bytes)
        let ack = self.get_field("ack", "00000000")?;
        packet.extend_from_slice(&self.parse_hex(&ack)?);
        
        // 数据偏移和标志 (2 bytes)
        packet.extend_from_slice(&[0x50, 0x00]); // 数据偏移 5*4=20, 无标志
        
        // 窗口大小 (2 bytes)
        let window = self.get_field("window", "4000")?;
        let window = u16::from_str_radix(&window, 16).unwrap_or(0x0FA0);
        packet.extend_from_slice(&window.to_be_bytes());
        
        // 校验和 (2 bytes) - 稍后计算
        packet.extend_from_slice(&[0x00, 0x00]);
        
        // 紧急指针 (2 bytes)
        packet.extend_from_slice(&[0x00, 0x00]);
        
        // Payload
        if let Some(payload) = &self.data.payload {
            packet.extend_from_slice(&self.parse_hex(payload)?);
        }
        
        // 计算 TCP 校验和
        let tcp_checksum = self.calculate_tcp_checksum(&packet);
        let tcp_start = 20; // IP 头部长度
        packet[tcp_start + 16] = (tcp_checksum >> 8) as u8;
        packet[tcp_start + 17] = tcp_checksum as u8;
        
        Ok(packet)
    }

    fn build_udp_packet(&self) -> Result<Vec<u8>> {
        // 先构建 IP 头部
        let mut packet = self.build_ip_packet()?;
        
        // UDP 头部 (8 bytes)
        let src_port = self.get_field("src_port", "1234")?;
        let src_port = u16::from_str_radix(&src_port, 16).unwrap_or(0x04D2);
        packet.extend_from_slice(&src_port.to_be_bytes());
        
        let dst_port = self.get_field("dst_port", "5678")?;
        let dst_port = u16::from_str_radix(&dst_port, 16).unwrap_or(0x162E);
        packet.extend_from_slice(&dst_port.to_be_bytes());
        
        // 长度 (2 bytes) - 稍后填充
        packet.extend_from_slice(&[0x00, 0x00]);
        
        // 校验和 (2 bytes)
        packet.extend_from_slice(&[0x00, 0x00]);
        
        // Payload
        if let Some(payload) = &self.data.payload {
            packet.extend_from_slice(&self.parse_hex(payload)?);
        }
        
        // 计算并填充 UDP 长度
        let udp_length = (packet.len() - 20) as u16; // 减去 IP 头部
        packet[22] = (udp_length >> 8) as u8;
        packet[23] = udp_length as u8;
        
        Ok(packet)
    }

    fn build_arp_packet(&self) -> Result<Vec<u8>> {
        let mut packet = Vec::new();
        
        // 硬件类型 (2 bytes) - 以太网
        packet.extend_from_slice(&[0x00, 0x01]);
        
        // 协议类型 (2 bytes) - IPv4
        packet.extend_from_slice(&[0x08, 0x00]);
        
        // 硬件地址长度 (1 byte)
        packet.push(6);
        
        // 协议地址长度 (1 byte)
        packet.push(4);
        
        // 操作码 (2 bytes) - 请求
        let op = self.get_field("op", "0001")?;
        packet.extend_from_slice(&self.parse_hex(&op)?);
        
        // 发送方硬件地址 (6 bytes)
        let sender_mac = self.get_field("sender_mac", "00:00:00:00:00:00")?;
        packet.extend_from_slice(&self.parse_mac(&sender_mac)?);
        
        // 发送方协议地址 (4 bytes)
        let sender_ip = self.get_field("sender_ip", "192.168.1.1")?;
        packet.extend_from_slice(&self.parse_ip(&sender_ip)?);
        
        // 目标硬件地址 (6 bytes)
        let target_mac = self.get_field("target_mac", "00:00:00:00:00:00")?;
        packet.extend_from_slice(&self.parse_mac(&target_mac)?);
        
        // 目标协议地址 (4 bytes)
        let target_ip = self.get_field("target_ip", "192.168.1.2")?;
        packet.extend_from_slice(&self.parse_ip(&target_ip)?);
        
        Ok(packet)
    }

    fn build_icmp_packet(&self) -> Result<Vec<u8>> {
        // 先构建 IP 头部
        let mut packet = self.build_ip_packet()?;
        
        // ICMP 头部 (8 bytes)
        let icmp_type = self.get_field("icmp_type", "08")?; // Echo Request
        packet.push(u8::from_str_radix(&icmp_type, 16).unwrap_or(8));
        
        let icmp_code = self.get_field("icmp_code", "00")?;
        packet.push(u8::from_str_radix(&icmp_code, 16).unwrap_or(0));
        
        // 校验和 (2 bytes) - 稍后计算
        packet.extend_from_slice(&[0x00, 0x00]);
        
        // 标识符 (2 bytes)
        let identifier = self.get_field("identifier", "0000")?;
        packet.extend_from_slice(&self.parse_hex(&identifier)?);
        
        // 序列号 (2 bytes)
        let sequence = self.get_field("sequence", "0000")?;
        packet.extend_from_slice(&self.parse_hex(&sequence)?);
        
        // Payload
        if let Some(payload) = &self.data.payload {
            packet.extend_from_slice(&self.parse_hex(payload)?);
        }
        
        // 计算 ICMP 校验和
        let icmp_checksum = self.calculate_icmp_checksum(&packet[20..]);
        packet[22] = (icmp_checksum >> 8) as u8;
        packet[23] = icmp_checksum as u8;
        
        Ok(packet)
    }

    // 辅助方法
    fn get_field(&self, key: &str, default: &str) -> Result<String> {
        Ok(self.data.fields.get(key)
            .map(|s| s.to_string())
            .unwrap_or_else(|| default.to_string()))
    }

    fn parse_mac(&self, mac: &str) -> Result<Vec<u8>> {
        let parts: Vec<&str> = mac.split(':').collect();
        if parts.len() != 6 {
            return Err(anyhow!("无效的 MAC 地址格式: {}", mac));
        }
        
        let mut result = Vec::new();
        for part in parts {
            result.push(u8::from_str_radix(part, 16)?);
        }
        Ok(result)
    }

    fn parse_ip(&self, ip: &str) -> Result<Vec<u8>> {
        let parts: Vec<&str> = ip.split('.').collect();
        if parts.len() != 4 {
            return Err(anyhow!("无效的 IP 地址格式: {}", ip));
        }
        
        let mut result = Vec::new();
        for part in parts {
            result.push(part.parse::<u8>()?);
        }
        Ok(result)
    }

    fn parse_hex(&self, hex: &str) -> Result<Vec<u8>> {
        let hex = hex.replace(" ", "").replace(":", "");
        if hex.len() % 2 != 0 {
            return Err(anyhow!("无效的十六进制字符串: {}", hex));
        }
        
        let mut result = Vec::new();
        for i in (0..hex.len()).step_by(2) {
            let byte = u8::from_str_radix(&hex[i..i+2], 16)?;
            result.push(byte);
        }
        Ok(result)
    }

    fn calculate_ip_checksum(&self, data: &[u8]) -> u16 {
        let mut sum = 0u32;
        for i in (0..data.len()).step_by(2) {
            if i + 1 < data.len() {
                sum += ((data[i] as u32) << 8) + data[i + 1] as u32;
            } else {
                sum += (data[i] as u32) << 8;
            }
        }
        
        while sum >> 16 != 0 {
            sum = (sum & 0xFFFF) + (sum >> 16);
        }
        
        !sum as u16
    }

    fn calculate_tcp_checksum(&self, packet: &[u8]) -> u16 {
        // 简化的 TCP 校验和计算
        let mut sum = 0u32;
        let tcp_start = 20;
        
        for i in (tcp_start..packet.len()).step_by(2) {
            if i + 1 < packet.len() {
                sum += ((packet[i] as u32) << 8) + packet[i + 1] as u32;
            } else {
                sum += (packet[i] as u32) << 8;
            }
        }
        
        while sum >> 16 != 0 {
            sum = (sum & 0xFFFF) + (sum >> 16);
        }
        
        !sum as u16
    }

    fn calculate_icmp_checksum(&self, data: &[u8]) -> u16 {
        let mut sum = 0u32;
        for i in (0..data.len()).step_by(2) {
            if i + 1 < data.len() {
                sum += ((data[i] as u32) << 8) + data[i + 1] as u32;
            } else {
                sum += (data[i] as u32) << 8;
            }
        }
        
        while sum >> 16 != 0 {
            sum = (sum & 0xFFFF) + (sum >> 16);
        }
        
        !sum as u16
    }
} 