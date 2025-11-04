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
            "ip" | "ipv4" => self.build_ipv4_packet(),
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

    fn build_ipv4_packet(&self) -> Result<Vec<u8>> {
        let mut packet = Vec::new();
        
        // 以太网头部 (14 bytes)
        let dst_mac = self.get_field("dst_mac", "00:00:00:00:00:00")?;
        packet.extend_from_slice(&self.parse_mac(&dst_mac)?);
        
        let src_mac = self.get_field("src_mac", "00:00:00:00:00:00")?;
        packet.extend_from_slice(&self.parse_mac(&src_mac)?);
        
        let ether_type = self.get_field("ether_type", "0800")?;
        packet.extend_from_slice(&self.parse_hex(&ether_type)?);
        
        // IPv4头部 (20 bytes)
        let version = self.get_field("version", "4")?.parse::<u8>().unwrap_or(4);
        let ihl = self.get_field("ihl", "5")?.parse::<u8>().unwrap_or(5);
        packet.push((version << 4) | ihl);
        
        let tos = self.get_field("tos", "0")?.parse::<u8>().unwrap_or(0);
        packet.push(tos);
        
        // 总长度 (稍后计算)
        let total_length_pos = packet.len();
        packet.extend_from_slice(&[0x00, 0x00]);
        
        let identification = self.get_field("identification", "0")?.parse::<u16>().unwrap_or(0);
        packet.extend_from_slice(&identification.to_be_bytes());
        
        let flags = self.get_field("flags", "2")?.parse::<u8>().unwrap_or(2);
        let fragment_offset = self.get_field("fragment_offset", "0")?.parse::<u16>().unwrap_or(0);
        packet.extend_from_slice(&(((flags as u16) << 13) | fragment_offset).to_be_bytes());
        
        let ttl = self.get_field("ttl", "64")?.parse::<u8>().unwrap_or(64);
        packet.push(ttl);
        
        let protocol = self.get_field("protocol", "6")?.parse::<u8>().unwrap_or(6);
        packet.push(protocol);
        
        // 头部校验和 (稍后计算)
        let checksum_pos = packet.len();
        packet.extend_from_slice(&[0x00, 0x00]);
        
        let src_ip = self.get_field("srcIp", "192.168.1.1")?;
        packet.extend_from_slice(&self.parse_ip(&src_ip)?);
        
        let dst_ip = self.get_field("dstIp", "192.168.1.2")?;
        packet.extend_from_slice(&self.parse_ip(&dst_ip)?);
        
        // Payload
        if let Some(payload) = &self.data.payload {
            packet.extend_from_slice(&self.parse_hex(payload)?);
        }
        
        // 计算并填充总长度 (IPv4头部 + payload)
        let ip_length = packet.len() - 14; // 减去以太网头部
        packet[total_length_pos] = (ip_length >> 8) as u8;
        packet[total_length_pos + 1] = ip_length as u8;
        
        // 计算并填充IPv4头部校验和
        let checksum = self.calculate_ip_checksum(&packet[14..14 + 20]);
        packet[checksum_pos] = (checksum >> 8) as u8;
        packet[checksum_pos + 1] = checksum as u8;
        
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
        let mut packet = Vec::new();
        
        // 以太网头部 (14 bytes)
        let dst_mac = self.get_field("dst_mac", "00:00:00:00:00:00")?;
        packet.extend_from_slice(&self.parse_mac(&dst_mac)?);
        
        let src_mac = self.get_field("src_mac", "00:00:00:00:00:00")?;
        packet.extend_from_slice(&self.parse_mac(&src_mac)?);
        
        let ether_type = self.get_field("ether_type", "0800")?;
        packet.extend_from_slice(&self.parse_hex(&ether_type)?);
        
        // IPv4头部 (20 bytes) - 简化版本
        packet.push(0x45); // Version 4, IHL 5
        packet.push(0x00); // TOS
        
        // 总长度 (稍后计算)
        let total_length_pos = packet.len();
        packet.extend_from_slice(&[0x00, 0x00]);
        
        packet.extend_from_slice(&[0x00, 0x00]); // ID
        packet.extend_from_slice(&[0x40, 0x00]); // Flags, Fragment offset
        packet.push(64); // TTL
        packet.push(6); // Protocol (TCP)
        
        // IP头部校验和 (稍后计算)
        let ip_checksum_pos = packet.len();
        packet.extend_from_slice(&[0x00, 0x00]);
        
        let src_ip = self.get_field("srcIp", "192.168.1.1")?;
        packet.extend_from_slice(&self.parse_ip(&src_ip)?);
        
        let dst_ip = self.get_field("dstIp", "192.168.1.2")?;
        packet.extend_from_slice(&self.parse_ip(&dst_ip)?);
        
        // TCP 头部 (20 bytes)
        let src_port = self.get_field("srcPort", "12345")?;
        let src_port = src_port.parse::<u16>().unwrap_or(12345);
        packet.extend_from_slice(&src_port.to_be_bytes());
        
        let dst_port = self.get_field("dstPort", "80")?;
        let dst_port = dst_port.parse::<u16>().unwrap_or(80);
        packet.extend_from_slice(&dst_port.to_be_bytes());
        
        // 序列号 (4 bytes)
        let seq = self.get_field("seq", "0")?;
        let seq = seq.parse::<u32>().unwrap_or(0);
        packet.extend_from_slice(&seq.to_be_bytes());
        
        // 确认号 (4 bytes)
        let ack = self.get_field("ack", "0")?;
        let ack = ack.parse::<u32>().unwrap_or(0);
        packet.extend_from_slice(&ack.to_be_bytes());
        
        // 数据偏移与标志 (2 bytes)
        let data_offset = self
            .get_field("data_offset", "5")?
            .parse::<u8>()
            .unwrap_or(5)
            .clamp(5, 15);
        let reserved = self
            .get_field("reserved", "0")?
            .parse::<u8>()
            .unwrap_or(0)
            & 0x07;
        let flag_urg = self
            .get_field("flag_urg", "0")?
            .parse::<u8>()
            .unwrap_or(0)
            & 0x01;
        let flag_ack = self
            .get_field("flag_ack", "0")?
            .parse::<u8>()
            .unwrap_or(0)
            & 0x01;
        let flag_psh = self
            .get_field("flag_psh", "0")?
            .parse::<u8>()
            .unwrap_or(0)
            & 0x01;
        let flag_rst = self
            .get_field("flag_rst", "0")?
            .parse::<u8>()
            .unwrap_or(0)
            & 0x01;
        let flag_syn = self
            .get_field("flag_syn", "1")?
            .parse::<u8>()
            .unwrap_or(1)
            & 0x01;
        let flag_fin = self
            .get_field("flag_fin", "0")?
            .parse::<u8>()
            .unwrap_or(0)
            & 0x01;

        // 第一个字节: data_offset(4) | reserved(3) | ns(1=0)
        let offset_reserved_ns = ((data_offset & 0x0F) << 4) | ((reserved & 0x07) << 1);
        // 第二个字节: URG ACK PSH RST SYN FIN
        let flags_byte = (flag_urg << 5)
            | (flag_ack << 4)
            | (flag_psh << 3)
            | (flag_rst << 2)
            | (flag_syn << 1)
            | flag_fin;
        packet.extend_from_slice(&[offset_reserved_ns, flags_byte]);
        
        // 窗口大小 (2 bytes)
        let window_size = self.get_field("window_size", "8192")?;
        let window_size = window_size.parse::<u16>().unwrap_or(8192);
        packet.extend_from_slice(&window_size.to_be_bytes());
        
        // 校验和 (2 bytes) - 默认0；若用户提供则填入
        let tcp_checksum_pos = packet.len();
        packet.extend_from_slice(&[0x00, 0x00]);
        
        // 紧急指针 (2 bytes)
        let urgent_pointer = self.get_field("urgent_pointer", "0")?;
        let urgent_pointer = urgent_pointer.parse::<u16>().unwrap_or(0);
        packet.extend_from_slice(&urgent_pointer.to_be_bytes());
        
        // Payload
        if let Some(payload) = &self.data.payload {
            packet.extend_from_slice(&self.parse_hex(payload)?);
        }
        
        // 计算并填充总长度 (IPv4头部 + TCP头部 + payload)
        let ip_length = packet.len() - 14; // 减去以太网头部
        packet[total_length_pos] = (ip_length >> 8) as u8;
        packet[total_length_pos + 1] = ip_length as u8;
        
        // 计算并填充IP头部校验和
        let checksum = self.calculate_ip_checksum(&packet[14..14 + 20]);
        packet[ip_checksum_pos] = (checksum >> 8) as u8;
        packet[ip_checksum_pos + 1] = checksum as u8;

        // 如果用户提供了 TCP 校验和，使用用户值覆盖（十六进制或十进制）
        if let Ok(cs_str) = self.get_field("checksum", "0") {
            let cs_trim = cs_str.trim();
            if !cs_trim.is_empty() {
                let cs_val = if cs_trim.starts_with("0x") || cs_trim.starts_with("0X") {
                    u16::from_str_radix(&cs_trim[2..], 16).unwrap_or(0)
                } else if let Ok(dec) = cs_trim.parse::<u16>() {
                    dec
                } else {
                    u16::from_str_radix(cs_trim, 16).unwrap_or(0)
                };
                if cs_val != 0 {
                    let bytes = cs_val.to_be_bytes();
                    packet[tcp_checksum_pos] = bytes[0];
                    packet[tcp_checksum_pos + 1] = bytes[1];
                }
            }
        }
        
        Ok(packet)
    }

    fn build_udp_packet(&self) -> Result<Vec<u8>> {
        let mut packet = Vec::new();
        
        // 以太网头部 (14 bytes)
        let dst_mac = self.get_field("dst_mac", "00:00:00:00:00:00")?;
        packet.extend_from_slice(&self.parse_mac(&dst_mac)?);
        
        let src_mac = self.get_field("src_mac", "00:00:00:00:00:00")?;
        packet.extend_from_slice(&self.parse_mac(&src_mac)?);
        
        let ether_type = self.get_field("ether_type", "0800")?;
        packet.extend_from_slice(&self.parse_hex(&ether_type)?);
        
        // IPv4头部 (20 bytes) - 简化版本
        packet.push(0x45); // Version 4, IHL 5
        packet.push(0x00); // TOS
        
        // 总长度 (稍后计算)
        let total_length_pos = packet.len();
        packet.extend_from_slice(&[0x00, 0x00]);
        
        packet.extend_from_slice(&[0x00, 0x00]); // ID
        packet.extend_from_slice(&[0x40, 0x00]); // Flags, Fragment offset
        packet.push(64); // TTL
        packet.push(17); // Protocol (UDP)
        
        // IP头部校验和 (稍后计算)
        let ip_checksum_pos = packet.len();
        packet.extend_from_slice(&[0x00, 0x00]);
        
        let src_ip = self.get_field("srcIp", "192.168.1.1")?;
        packet.extend_from_slice(&self.parse_ip(&src_ip)?);
        
        let dst_ip = self.get_field("dstIp", "192.168.1.2")?;
        packet.extend_from_slice(&self.parse_ip(&dst_ip)?);
        
        // UDP 头部 (8 bytes)
        let src_port = self.get_field("srcPort", "12345")?;
        let src_port = src_port.parse::<u16>().unwrap_or(12345);
        packet.extend_from_slice(&src_port.to_be_bytes());
        
        let dst_port = self.get_field("dstPort", "53")?;
        let dst_port = dst_port.parse::<u16>().unwrap_or(53);
        packet.extend_from_slice(&dst_port.to_be_bytes());
        
        // UDP长度 (2 bytes) - 稍后填充
        let udp_length_pos = packet.len();
        packet.extend_from_slice(&[0x00, 0x00]);
        
        // 校验和 (2 bytes) - 默认0，支持前端覆盖
        let udp_checksum_pos = packet.len();
        packet.extend_from_slice(&[0x00, 0x00]);
        
        // Payload
        if let Some(payload) = &self.data.payload {
            packet.extend_from_slice(&self.parse_hex(payload)?);
        }
        
        // 计算并填充总长度 (IPv4头部 + UDP头部 + payload)
        let ip_length = packet.len() - 14; // 减去以太网头部
        packet[total_length_pos] = (ip_length >> 8) as u8;
        packet[total_length_pos + 1] = ip_length as u8;
        
        // 计算并填充UDP长度 (UDP头部 + payload)，允许前端覆盖
        let computed_udp_length = (packet.len() - 14 - 20) as u16; // 减去以太网头部和IP头部
        let udp_len_field = self.get_field("length", "0")?;
        let udp_len_override = udp_len_field.parse::<u16>().unwrap_or(0);
        let udp_length = if udp_len_override > 0 { udp_len_override } else { computed_udp_length };
        packet[udp_length_pos] = (udp_length >> 8) as u8;
        packet[udp_length_pos + 1] = udp_length as u8;
        
        // 计算并填充IP头部校验和
        let checksum = self.calculate_ip_checksum(&packet[14..14 + 20]);
        packet[ip_checksum_pos] = (checksum >> 8) as u8;
        packet[ip_checksum_pos + 1] = checksum as u8;

        // 覆盖UDP校验和（如果前端提供了非0值；未计算伪首部校验和）
        if let Ok(cs_str) = self.get_field("checksum", "0") {
            let cs_trim = cs_str.trim();
            if !cs_trim.is_empty() {
                let cs_val = if cs_trim.starts_with("0x") || cs_trim.starts_with("0X") {
                    u16::from_str_radix(&cs_trim[2..], 16).unwrap_or(0)
                } else if let Ok(dec) = cs_trim.parse::<u16>() {
                    dec
                } else {
                    u16::from_str_radix(cs_trim, 16).unwrap_or(0)
                };
                if cs_val != 0 {
                    let bytes = cs_val.to_be_bytes();
                    packet[udp_checksum_pos] = bytes[0];
                    packet[udp_checksum_pos + 1] = bytes[1];
                }
            }
        }
        
        Ok(packet)
    }

    fn build_arp_packet(&self) -> Result<Vec<u8>> {
        let mut packet = Vec::new();

        // Ethernet header
        let dst_mac = self.get_field_multi(&["dst_mac", "dstMac", "target_mac", "targetMac"], "ff:ff:ff:ff:ff:ff")?;
        packet.extend_from_slice(&self.parse_mac(&dst_mac)?);

        let src_mac = self.get_field_multi(&["src_mac", "srcMac", "sender_mac", "senderMac"], "00:00:00:00:00:00")?;
        packet.extend_from_slice(&self.parse_mac(&src_mac)?);

        let ether_type = self.get_field_multi(&["ether_type", "etherType"], "0806")?;
        packet.extend_from_slice(&self.parse_hex(&ether_type)?);

        // ARP header
        let hw_type = self.get_field_multi(&["hwType", "hardware_type"], "1")?;
        packet.extend_from_slice(&self.parse_u16_value(&hw_type, 1)?);

        let proto_type = self.get_field_multi(&["protoType", "protocol_type"], "0x0800")?;
        packet.extend_from_slice(&self.parse_u16_value(&proto_type, 0x0800)?);

        let hw_size = self.get_field_multi(&["hwSize", "hw_len", "hardware_size"], "6")?;
        packet.push(self.parse_u8_value(&hw_size, 6)?);

        let proto_size = self.get_field_multi(&["protoSize", "proto_len", "protocol_size"], "4")?;
        packet.push(self.parse_u8_value(&proto_size, 4)?);

        let opcode = self.get_field_multi(&["opcode", "op", "operation"], "1")?;
        packet.extend_from_slice(&self.parse_u16_value(&opcode, 1)?);

        let sender_mac = self.get_field_multi(&["srcMac", "sender_mac", "senderMac"], &src_mac)?;
        packet.extend_from_slice(&self.parse_mac(&sender_mac)?);

        let sender_ip = self.get_field_multi(&["srcIp", "sender_ip", "senderIp"], "0.0.0.0")?;
        packet.extend_from_slice(&self.parse_ip(&sender_ip)?);

        let target_mac = self.get_field_multi(&["dstMac", "target_mac", "targetMac"], &dst_mac)?;
        packet.extend_from_slice(&self.parse_mac(&target_mac)?);

        let target_ip = self.get_field_multi(&["dstIp", "target_ip", "targetIp"], "0.0.0.0")?;
        packet.extend_from_slice(&self.parse_ip(&target_ip)?);

        // Optional ARP payload
        if let Some(payload) = &self.data.payload {
            // 支持空格/冒号分隔的十六进制
            packet.extend_from_slice(&self.parse_hex(payload)?);
        }

        // Minimum Ethernet frame size without FCS is 60 bytes
        while packet.len() < 60 {
            packet.push(0);
        }

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

    fn get_field_multi(&self, keys: &[&str], default: &str) -> Result<String> {
        for key in keys {
            if let Some(v) = self.data.fields.get(*key) {
                return Ok(v.clone());
            }
        }
        Ok(default.to_string())
    }

    fn parse_u16_value(&self, value: &str, default: u16) -> Result<[u8; 2]> {
        let trimmed = value.trim();
        if trimmed.is_empty() {
            return Ok(default.to_be_bytes());
        }
        let hex_part = if trimmed.starts_with("0x") || trimmed.starts_with("0X") {
            &trimmed[2..]
        } else {
            trimmed
        };
        if let Ok(n) = u16::from_str_radix(hex_part, 16) {
            return Ok(n.to_be_bytes());
        }
        if let Ok(n) = trimmed.parse::<u16>() {
            return Ok(n.to_be_bytes());
        }
        Err(anyhow!("无法解析为16位数值: {}", value))
    }

    fn parse_u8_value(&self, value: &str, default: u8) -> Result<u8> {
        let trimmed = value.trim();
        if trimmed.is_empty() {
            return Ok(default);
        }
        let hex_part = if trimmed.starts_with("0x") || trimmed.starts_with("0X") {
            &trimmed[2..]
        } else {
            trimmed
        };
        if let Ok(n) = u8::from_str_radix(hex_part, 16) {
            return Ok(n);
        }
        if let Ok(n) = trimmed.parse::<u8>() {
            return Ok(n);
        }
        Err(anyhow!("无法解析为8位数值: {}", value))
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
        let trimmed = ip.trim();
        if trimmed.is_empty() {
            return Ok(vec![0, 0, 0, 0]);
        }
        let parts: Vec<&str> = trimmed.split('.').collect();
        if parts.len() != 4 {
            return Err(anyhow!("无效的 IP 地址格式: {}", trimmed));
        }
        let mut result = Vec::new();
        for part in parts {
            let v = part.parse::<u8>().map_err(|_| anyhow!("无效的 IP 地址段: {}", trimmed))?;
            result.push(v);
        }
        Ok(result)
    }

    fn parse_hex(&self, hex: &str) -> Result<Vec<u8>> {
        let mut hex = hex.replace(" ", "").replace(":", "");
        
        // 如果是奇数长度，前面补0
        if hex.len() % 2 != 0 {
            hex = format!("0{}", hex);
        }
        
        // 验证是否为有效的十六进制字符
        if !hex.chars().all(|c| c.is_ascii_hexdigit()) {
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

    #[allow(dead_code)]
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
