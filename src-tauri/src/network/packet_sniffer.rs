use pcap::{Capture, Device, Active};
use serde::{Serialize, Deserialize};
use std::sync::{Arc, Mutex};
use std::sync::atomic::{AtomicBool, Ordering};
use std::collections::{HashMap, VecDeque};
use std::time::{SystemTime, UNIX_EPOCH};
use crossbeam_channel::{bounded, Receiver, Sender, select};
use anyhow::{Result, anyhow};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CapturedPacket {
    pub id: String,
    pub timestamp: u64,
    pub protocol: String,
    pub src_mac: String,
    pub dst_mac: String,
    pub src_ip: Option<String>,
    pub dst_ip: Option<String>,
    pub src_port: Option<u16>,
    pub dst_port: Option<u16>,
    pub size: usize,
    pub info: String,
    pub raw_data: Vec<u8>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PacketStatistics {
    pub total_packets: u64,
    pub bytes_per_sec: f64,
    pub packets_per_sec: f64,
    pub protocol_stats: HashMap<String, u64>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CaptureFilters {
    pub protocol: Option<String>,
    pub src_mac: Option<String>,
    pub dst_mac: Option<String>,
    pub src_ip: Option<String>,
    pub dst_ip: Option<String>,
    pub port: Option<String>,
}

pub struct PacketSniffer {
    capture: Option<Capture<Active>>,
    running: Arc<AtomicBool>,
    packet_sender: Sender<CapturedPacket>,
    packet_receiver: Receiver<CapturedPacket>,
    statistics: Arc<Mutex<PacketStatistics>>,
    filters: Arc<Mutex<CaptureFilters>>,
}

impl PacketSniffer {
    pub fn new() -> Result<Self> {
        let (packet_sender, packet_receiver) = bounded(5000); // 进一步增加缓冲区大小
        
        Ok(Self {
            capture: None,
            running: Arc::new(AtomicBool::new(false)),
            packet_sender,
            packet_receiver,
            statistics: Arc::new(Mutex::new(PacketStatistics {
                total_packets: 0,
                bytes_per_sec: 0.0,
                packets_per_sec: 0.0,
                protocol_stats: HashMap::new(),
            })),
            filters: Arc::new(Mutex::new(CaptureFilters {
                protocol: None,
                src_mac: None,
                dst_mac: None,
                src_ip: None,
                dst_ip: None,
                port: None,
            })),
        })
    }

    pub fn start_capture(&mut self, interface_name: &str, filters: CaptureFilters) -> Result<()> {
        if self.running.load(Ordering::Relaxed) {
            return Err(anyhow!("数据包捕获已在运行中"));
        }

        // 查找指定网络接口
        let devices = Device::list().map_err(|e| {
            anyhow!("获取网络设备列表失败: {}", e)
        })?;

        let device = devices
            .into_iter()
            .find(|d| d.name == interface_name)
            .ok_or_else(|| anyhow!("未找到网络接口: {}", interface_name))?;

        // 创建捕获实例
        let capture = Capture::from_device(device)
            .map_err(|e| anyhow!("创建捕获实例失败: {}", e))?
            .promisc(false)
            .timeout(1000)
            .buffer_size(1024 * 1024)
            .open()
            .map_err(|e| anyhow!("打开网络捕获失败: {}. 请确保以管理员权限运行应用程序", e))?;
        
        self.capture = Some(capture);
        self.running.store(true, Ordering::Relaxed);

        // 更新过滤器
        {
            let mut filter_guard = self.filters.lock().unwrap();
            *filter_guard = filters;
        }

        // 重置统计信息
        let mut stats = self.statistics.lock().unwrap();
        stats.total_packets = 0;
        stats.bytes_per_sec = 0.0;
        stats.packets_per_sec = 0.0;
        stats.protocol_stats.clear();

        Ok(())
    }

    pub fn stop_capture(&mut self) {
        self.running.store(false, Ordering::Relaxed);
        self.capture = None;
    }

    pub fn is_running(&self) -> bool {
        self.running.load(Ordering::Relaxed)
    }

    pub fn get_statistics(&self) -> PacketStatistics {
        self.statistics.lock().unwrap().clone()
    }

    pub fn get_packets(&self, max_count: usize) -> Vec<CapturedPacket> {
        let mut packets = Vec::new();
        
        // 获取所有可用的数据包，直到达到请求数量或通道为空
        while packets.len() < max_count {
            match self.packet_receiver.try_recv() {
                Ok(packet) => {
                    packets.push(packet);
                }
                Err(_) => break, // 通道为空，退出循环
            }
        }
        
        packets
    }

    pub fn process_packets(&mut self) -> Result<()> {
        let capture = self.capture.take();
        if let Some(mut capture) = capture {
            let running = self.running.clone();
            let packet_sender = self.packet_sender.clone();
            let statistics = self.statistics.clone();
            let filters = self.filters.clone();

            let mut packet_count = 0u64;
            let mut byte_count = 0u64;
            let start_time = SystemTime::now();


            while running.load(Ordering::Relaxed) {
                match capture.next_packet() {
                    Ok(packet) => {
                        packet_count += 1;
                        byte_count += packet.data.len() as u64;


                        
                        // 添加一个小的延迟，防止过度消耗CPU
                        if packet_count % 10 == 0 {
                            std::thread::sleep(std::time::Duration::from_millis(1));
                        }

                        if let Some(parsed_packet) = PacketSniffer::parse_packet_static(&packet) {
                            // 更新协议统计（每个数据包都统计）
                            if let Ok(mut stats) = statistics.lock() {
                                let count = stats.protocol_stats.entry(parsed_packet.protocol.clone()).or_insert(0);
                                *count += 1;
                            }
                            
                            // 应用过滤器
                            if PacketSniffer::matches_filters_static(&parsed_packet, &filters) {
                                // 非阻塞发送，如果缓冲区满了就直接丢弃
                                let _ = packet_sender.try_send(parsed_packet.clone());
                            }

                            // 更新统计信息（每10个数据包更新一次，提高精度）
                            if packet_count % 10 == 0 {
                                PacketSniffer::update_statistics_static(&statistics, packet_count, byte_count, start_time, &parsed_packet);
                            }
                        }
                    }
                    Err(pcap::Error::TimeoutExpired) => {
                        // 超时是正常的，继续循环
                        // 即使超时也更新统计信息
                        if packet_count > 0 {
                            PacketSniffer::update_statistics_static(&statistics, packet_count, byte_count, start_time, &CapturedPacket {
                                id: String::new(),
                                timestamp: 0,
                                protocol: String::new(),
                                src_mac: String::new(),
                                dst_mac: String::new(),
                                src_ip: None,
                                dst_ip: None,
                                src_port: None,
                                dst_port: None,
                                size: 0,
                                info: String::new(),
                                raw_data: Vec::new(),
                            });
                        }
                        continue;
                    }
                    Err(e) => {
                        // 不要立即退出，尝试继续
                        std::thread::sleep(std::time::Duration::from_millis(100));
                        continue;
                    }
                }
            }

        }
        
        Ok(())
    }

    fn parse_packet_static(packet: &pcap::Packet) -> Option<CapturedPacket> {
        let data = packet.data;
        let _header = &packet.header;

        if data.len() < 14 {
            return None; // 以太网帧最小长度
        }

        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_millis() as u64;

        // 解析以太网头部
        let dst_mac = format!("{:02x}:{:02x}:{:02x}:{:02x}:{:02x}:{:02x}",
            data[0], data[1], data[2], data[3], data[4], data[5]);
        let src_mac = format!("{:02x}:{:02x}:{:02x}:{:02x}:{:02x}:{:02x}",
            data[6], data[7], data[8], data[9], data[10], data[11]);

        let ether_type = ((data[12] as u16) << 8) | (data[13] as u16);

        let mut protocol = "other".to_string();
        let mut src_ip = None;
        let mut dst_ip = None;
        let mut src_port = None;
        let mut dst_port = None;
        let mut info = String::new();

        match ether_type {
            0x0800 => {
                // IPv4
                if let Some((proto, sip, dip, sp, dp, detailed_info)) = PacketSniffer::parse_ipv4(&data[14..]) {
                    protocol = proto;
                    src_ip = Some(sip);
                    dst_ip = Some(dip);
                    src_port = sp;
                    dst_port = dp;
                    info = detailed_info;
                }
            }
            0x0806 => {
                // ARP
                protocol = "arp".to_string();
                if let Some((sip, dip)) = PacketSniffer::parse_arp(&data[14..]) {
                    src_ip = Some(sip);
                    dst_ip = Some(dip);
                    info = format!("ARP: {} -> {}", 
                        src_ip.as_ref().unwrap(), 
                        dst_ip.as_ref().unwrap());
                }
            }
            _ => {
                protocol = "ethernet".to_string();
                info = format!("EtherType: 0x{:04x}", ether_type);
            }
        }

        Some(CapturedPacket {
            id: uuid::Uuid::new_v4().to_string(),
            timestamp,
            protocol,
            src_mac,
            dst_mac,
            src_ip,
            dst_ip,
            src_port,
            dst_port,
            size: data.len(),
            info,
            raw_data: data.to_vec(),
        })
    }

    fn parse_ipv4(data: &[u8]) -> Option<(String, String, String, Option<u16>, Option<u16>, String)> {
        if data.len() < 20 {
            return None;
        }

        let protocol = data[9];
        let src_ip = format!("{}.{}.{}.{}", data[12], data[13], data[14], data[15]);
        let dst_ip = format!("{}.{}.{}.{}", data[16], data[17], data[18], data[19]);
        let total_len = ((data[2] as u16) << 8) | (data[3] as u16);
        let header_len = ((data[0] & 0x0f) * 4) as usize;
        let ttl = data[8];
        let flags = (data[6] & 0xe0) >> 5;
        let fragment_offset = (((data[6] & 0x1f) as u16) << 8) | (data[7] as u16);
        
        let mut proto_name = "ipv4".to_string();
        let mut src_port = None;
        let mut dst_port = None;
        let mut info = String::new();

        if data.len() > header_len + 4 {
            let transport_data = &data[header_len..];
            
            match protocol {
                6 => {
                    // TCP
                    proto_name = "tcp".to_string();
                    if transport_data.len() >= 20 {
                        src_port = Some(((transport_data[0] as u16) << 8) | (transport_data[1] as u16));
                        dst_port = Some(((transport_data[2] as u16) << 8) | (transport_data[3] as u16));
                        
                        // TCP序列号和确认号
                        let seq_num = ((transport_data[4] as u32) << 24) | ((transport_data[5] as u32) << 16) | 
                                     ((transport_data[6] as u32) << 8) | (transport_data[7] as u32);
                        let ack_num = ((transport_data[8] as u32) << 24) | ((transport_data[9] as u32) << 16) | 
                                     ((transport_data[10] as u32) << 8) | (transport_data[11] as u32);
                        
                        // TCP头长度和标志位
                        let tcp_header_len = ((transport_data[12] & 0xf0) >> 4) * 4;
                        let flags = transport_data[13];
                        let window = ((transport_data[14] as u16) << 8) | (transport_data[15] as u16);
                        
                        // 数据长度
                        let data_len = total_len as i32 - header_len as i32 - tcp_header_len as i32;
                        let data_len = if data_len < 0 { 0 } else { data_len as u32 };
                        
                        // 构建TCP标志
                        let mut tcp_flags = Vec::new();
                        if flags & 0x08 != 0 { tcp_flags.push("PSH"); }
                        if flags & 0x10 != 0 { tcp_flags.push("ACK"); }
                        if flags & 0x02 != 0 { tcp_flags.push("SYN"); }
                        if flags & 0x01 != 0 { tcp_flags.push("FIN"); }
                        if flags & 0x04 != 0 { tcp_flags.push("RST"); }
                        if flags & 0x20 != 0 { tcp_flags.push("URG"); }
                        
                        let tcp_flags_str = if tcp_flags.is_empty() { 
                            String::new() 
                        } else { 
                            format!(" [{}]", tcp_flags.join(", ")) 
                        };
                        
                        info = format!("{} → {}{} Seq={} Ack={} Win={} Len={}", 
                            src_port.unwrap(), 
                            dst_port.unwrap(),
                            tcp_flags_str,
                            seq_num,
                            if flags & 0x10 != 0 { ack_num.to_string() } else { "0".to_string() },
                            window,
                            data_len
                        );
                    }
                }
                17 => {
                    // UDP
                    proto_name = "udp".to_string();
                    if transport_data.len() >= 8 {
                        src_port = Some(((transport_data[0] as u16) << 8) | (transport_data[1] as u16));
                        dst_port = Some(((transport_data[2] as u16) << 8) | (transport_data[3] as u16));
                        let udp_len = ((transport_data[4] as u16) << 8) | (transport_data[5] as u16);
                        let data_len = if udp_len > 8 { udp_len - 8 } else { 0 };
                        
                        info = format!("{} → {} Len={}", 
                            src_port.unwrap(), 
                            dst_port.unwrap(),
                            data_len
                        );
                    }
                }
                1 => {
                    // ICMP
                    proto_name = "icmp".to_string();
                    if transport_data.len() >= 8 {
                        let icmp_type = transport_data[0];
                        let icmp_code = transport_data[1];
                        
                        match icmp_type {
                            0 => info = format!("Echo (ping) reply id={:04x} seq={}/{}",
                                ((transport_data[4] as u16) << 8) | (transport_data[5] as u16),
                                ((transport_data[6] as u16) << 8) | (transport_data[7] as u16),
                                transport_data[7]),
                            8 => info = format!("Echo (ping) request id={:04x} seq={}/{}",
                                ((transport_data[4] as u16) << 8) | (transport_data[5] as u16),
                                ((transport_data[6] as u16) << 8) | (transport_data[7] as u16),
                                transport_data[7]),
                            3 => {
                                let code_msg = match icmp_code {
                                    0 => "Network unreachable",
                                    1 => "Host unreachable", 
                                    2 => "Protocol unreachable",
                                    3 => "Port unreachable",
                                    _ => "Destination unreachable"
                                };
                                info = format!("Destination unreachable ({})", code_msg);
                            },
                            11 => info = format!("Time-to-live exceeded (TTL={})", ttl),
                            _ => info = format!("Type {} Code {}", icmp_type, icmp_code),
                        }
                    }
                }
                _ => {
                    info = format!("Protocol {} TTL={} Len={}", protocol, ttl, total_len);
                }
            }
        } else {
            info = format!("IPv4 TTL={} Len={}", ttl, total_len);
        }

        Some((proto_name, src_ip, dst_ip, src_port, dst_port, info))
    }

    fn parse_arp(data: &[u8]) -> Option<(String, String)> {
        if data.len() < 28 {
            return None;
        }

        let src_ip = format!("{}.{}.{}.{}", data[14], data[15], data[16], data[17]);
        let dst_ip = format!("{}.{}.{}.{}", data[24], data[25], data[26], data[27]);

        Some((src_ip, dst_ip))
    }

    fn matches_filters_static(packet: &CapturedPacket, filters: &Arc<Mutex<CaptureFilters>>) -> bool {
        let filters = filters.lock().unwrap();

        // 协议过滤：如果协议过滤器为None或"all"，则通过所有协议
        if let Some(ref protocol_filter) = filters.protocol {
            if !protocol_filter.is_empty() && protocol_filter != "all" && &packet.protocol != protocol_filter {
                return false;
            }
        }

        // MAC 地址过滤
        if let Some(ref src_mac_filter) = filters.src_mac {
            if !src_mac_filter.is_empty() && 
               !packet.src_mac.to_lowercase().contains(&src_mac_filter.to_lowercase()) {
                return false;
            }
        }

        if let Some(ref dst_mac_filter) = filters.dst_mac {
            if !dst_mac_filter.is_empty() && 
               !packet.dst_mac.to_lowercase().contains(&dst_mac_filter.to_lowercase()) {
                return false;
            }
        }

        // IP 地址过滤
        if let Some(ref src_ip_filter) = filters.src_ip {
            if !src_ip_filter.is_empty() {
                if let Some(ref src_ip) = packet.src_ip {
                    if !src_ip.contains(src_ip_filter) {
                        return false;
                    }
                } else {
                    return false;
                }
            }
        }

        if let Some(ref dst_ip_filter) = filters.dst_ip {
            if !dst_ip_filter.is_empty() {
                if let Some(ref dst_ip) = packet.dst_ip {
                    if !dst_ip.contains(dst_ip_filter) {
                        return false;
                    }
                } else {
                    return false;
                }
            }
        }

        // 端口过滤
        if let Some(ref port_filter) = filters.port {
            if !port_filter.is_empty() {
                if let Ok(port) = port_filter.parse::<u16>() {
                    let port_matches = packet.src_port == Some(port) || packet.dst_port == Some(port);
                    if !port_matches {
                        return false;
                    }
                } else {
                    return false;
                }
            }
        }

        true
    }

    // 补充过滤器函数，主要用于 MAC 地址过滤（BPF 已处理协议/IP/端口过滤）
    fn matches_additional_filters_static(packet: &CapturedPacket, filters: &Arc<Mutex<CaptureFilters>>) -> bool {
        let filters = filters.lock().unwrap();

        // 只检查 MAC 地址过滤，因为其他过滤已经在 BPF 层面完成
        if let Some(ref src_mac_filter) = filters.src_mac {
            if !src_mac_filter.is_empty() && 
               !packet.src_mac.to_lowercase().contains(&src_mac_filter.to_lowercase()) {
                return false;
            }
        }

        if let Some(ref dst_mac_filter) = filters.dst_mac {
            if !dst_mac_filter.is_empty() && 
               !packet.dst_mac.to_lowercase().contains(&dst_mac_filter.to_lowercase()) {
                return false;
            }
        }

        true
    }

    fn update_statistics_static(statistics: &Arc<Mutex<PacketStatistics>>, packet_count: u64, byte_count: u64, start_time: SystemTime, _packet: &CapturedPacket) {
        if let Ok(mut stats) = statistics.lock() {
            stats.total_packets = packet_count;

            let elapsed = start_time.elapsed().unwrap_or_default().as_secs_f64();
            if elapsed > 0.0 {
                stats.packets_per_sec = packet_count as f64 / elapsed;
                stats.bytes_per_sec = byte_count as f64 / elapsed;
            }

            // 协议统计将在单独的地方处理，避免重复计数
        }
    }
}

// 全局的数据包嗅探器管理器
pub struct SnifferManager {
    sniffer: Arc<Mutex<Option<PacketSniffer>>>,
    capture_thread: Option<std::thread::JoinHandle<()>>,
    // 将数据包通道的接收端保留在管理器中
    packet_receiver: Option<Receiver<CapturedPacket>>,
    statistics: Option<Arc<Mutex<PacketStatistics>>>,
    running: Arc<AtomicBool>,
    // 添加数据包缓存，支持多次访问和过滤
    packet_cache: Arc<Mutex<VecDeque<CapturedPacket>>>,
}

impl SnifferManager {
    pub fn new() -> Self {
        Self {
            sniffer: Arc::new(Mutex::new(None)),
            capture_thread: None,
            packet_receiver: None,
            statistics: None,
            running: Arc::new(AtomicBool::new(false)),
            packet_cache: Arc::new(Mutex::new(VecDeque::new())),
        }
    }

    pub fn start_capture(&mut self, interface_name: String, filters: CaptureFilters) -> Result<()> {
        // 停止现有捕获
        self.stop_capture();

        // 调试信息已移除以避免崩溃

        // 创建独立的数据包通道
        let (packet_sender, packet_receiver) = bounded(5000);
        let statistics = Arc::new(Mutex::new(PacketStatistics {
            total_packets: 0,
            bytes_per_sec: 0.0,
            packets_per_sec: 0.0,
            protocol_stats: HashMap::new(),
        }));
        
        // 克隆接收端用于缓存线程
        let packet_receiver_clone = packet_receiver.clone();
        
        // 保存通道接收端和统计信息在管理器中
        self.packet_receiver = Some(packet_receiver);
        self.statistics = Some(statistics.clone());
        self.running.store(true, Ordering::Relaxed);

        // 创建捕获配置传递给线程
        let interface_name_clone = interface_name.clone();
        let filters_clone = filters.clone();
        let running_clone = self.running.clone();

        // 启动捕获线程
        let capture_thread = std::thread::spawn(move || {
            // 在线程中创建 PacketSniffer 的核心功能
            let _ = Self::run_packet_capture(interface_name_clone, filters_clone, packet_sender, statistics, running_clone);
        });

        // 启动数据包缓存收集线程
        let packet_cache_clone = self.packet_cache.clone();
        let running_for_cache = self.running.clone();
        
        std::thread::spawn(move || {
            const MAX_CACHE_SIZE: usize = 10000; // 增加缓存大小以保留更多历史数据包
            
            while running_for_cache.load(Ordering::Relaxed) {
                match packet_receiver_clone.recv_timeout(std::time::Duration::from_millis(100)) {
                    Ok(packet) => {
                        if let Ok(mut cache) = packet_cache_clone.lock() {
                            cache.push_back(packet);
                            // 保持缓存大小在合理范围内
                            while cache.len() > MAX_CACHE_SIZE {
                                cache.pop_front();
                            }
                        }
                    }
                    Err(_) => continue,
                }
            }
        });

        self.capture_thread = Some(capture_thread);
        Ok(())
    }
    
    // 将 CaptureFilters 转换为 BPF 过滤器字符串
    fn build_bpf_filter(filters: &CaptureFilters) -> String {
        let mut filter_parts = Vec::new();

        // 协议过滤
        if let Some(ref protocol) = filters.protocol {
            if !protocol.is_empty() && protocol != "all" {
                match protocol.as_str() {
                    "tcp" => filter_parts.push("tcp".to_string()),
                    "udp" => filter_parts.push("udp".to_string()),
                    "icmp" => filter_parts.push("icmp".to_string()),
                    "arp" => filter_parts.push("arp".to_string()),
                    "ip" => filter_parts.push("ip".to_string()),
                    _ => {} // 忽略不支持的协议
                }
            }
        }

        // IP 地址过滤
        if let Some(ref src_ip) = filters.src_ip {
            if !src_ip.is_empty() {
                filter_parts.push(format!("src host {}", src_ip));
            }
        }

        if let Some(ref dst_ip) = filters.dst_ip {
            if !dst_ip.is_empty() {
                filter_parts.push(format!("dst host {}", dst_ip));
            }
        }

        // 端口过滤
        if let Some(ref port) = filters.port {
            if !port.is_empty() {
                if let Ok(port_num) = port.parse::<u16>() {
                    filter_parts.push(format!("port {}", port_num));
                }
            }
        }

        // 组合所有过滤器部分
        if filter_parts.is_empty() {
            // 如果没有过滤器，返回空字符串（捕获所有数据包）
            String::new()
        } else {
            // 用 "and" 连接所有过滤器部分
            filter_parts.join(" and ")
        }
    }

    // 在独立线程中运行的数据包捕获逻辑
    fn run_packet_capture(
        interface_name: String, 
        filters: CaptureFilters, 
        packet_sender: Sender<CapturedPacket>, 
        statistics: Arc<Mutex<PacketStatistics>>,
        running: Arc<AtomicBool>
    ) -> Result<()> {
        use pcap::{Capture, Device};
        
        // 查找指定网络接口
        let devices = Device::list().map_err(|e| anyhow!("获取网络设备列表失败: {}", e))?;
        let device = devices
            .into_iter()
            .find(|d| d.name == interface_name)
            .ok_or_else(|| anyhow!("未找到网络接口: {}", interface_name))?;

        // 创建捕获实例
        let mut capture = Capture::from_device(device)
            .map_err(|e| anyhow!("创建捕获实例失败: {}", e))?
            .promisc(false)
            .timeout(1000)
            .buffer_size(1024 * 1024)
            .open()
            .map_err(|e| anyhow!("打开网络捕获失败: {}", e))?;

        // 应用 BPF 过滤器
        let bpf_filter = Self::build_bpf_filter(&filters);
        if !bpf_filter.is_empty() {
            capture.filter(&bpf_filter, true)
                .map_err(|e| anyhow!("设置BPF过滤器失败: {} (过滤器: {})", e, bpf_filter))?;
        }
        
        let filters_arc = Arc::new(Mutex::new(filters));
        let mut raw_packet_count = 0u64;
        let mut raw_byte_count = 0u64;
        let mut filtered_packet_count = 0u64;
        let mut filtered_byte_count = 0u64;
        let start_time = SystemTime::now();

        while running.load(Ordering::Relaxed) {
            match capture.next_packet() {
                Ok(packet) => {
                    raw_packet_count += 1;
                    raw_byte_count += packet.data.len() as u64;

                    // 解析数据包以便检查协议
                    let parsed_packet = match PacketSniffer::parse_packet_static(&packet) {
                        Some(p) => p,
                        None => continue,
                    };
                    
                    // 检查是否为响应监控相关的协议（ICMP、ARP等）
                    let _is_response_monitoring_packet = matches!(parsed_packet.protocol.as_str(), "icmp" | "arp");
                    
                    // 应用补充过滤器（主要用于MAC地址过滤，因为BPF已经处理了协议/IP/端口过滤）
                    if PacketSniffer::matches_additional_filters_static(&parsed_packet, &filters_arc) {
                        // 只有通过过滤器的数据包才进行统计和发送
                        filtered_packet_count += 1;
                        filtered_byte_count += packet.data.len() as u64;
                        
                        // 实时更新所有统计信息，保持一致性
                        if let Ok(mut stats) = statistics.lock() {
                            // 更新协议统计
                            let count = stats.protocol_stats.entry(parsed_packet.protocol.clone()).or_insert(0);
                            *count += 1;
                            
                            // 同时更新总体统计信息
                            stats.total_packets = filtered_packet_count;
                            let elapsed = start_time.elapsed().unwrap_or_default().as_secs_f64();
                            if elapsed > 0.0 {
                                stats.packets_per_sec = filtered_packet_count as f64 / elapsed;
                                stats.bytes_per_sec = filtered_byte_count as f64 / elapsed;
                            }
                        }
                        
                        // 非阻塞发送数据包
                        let _ = packet_sender.try_send(parsed_packet.clone());
                    }
                }
                Err(pcap::Error::TimeoutExpired) => {
                    continue;
                }
                Err(_) => {
                    // 捕获错误时稍作延迟后继续
                    std::thread::sleep(std::time::Duration::from_millis(100));
                    continue;
                }
            }
        }
        
        Ok(())
    }

    pub fn stop_capture(&mut self) {
        // 设置停止标志
        self.running.store(false, Ordering::Relaxed);
        
        // 等待捕获线程结束
        if let Some(handle) = self.capture_thread.take() {
            let start = std::time::Instant::now();
            const TIMEOUT: std::time::Duration = std::time::Duration::from_secs(3);
            
            loop {
                if handle.is_finished() {
                    let _ = handle.join();
                    break;
                }
                
                if start.elapsed() > TIMEOUT {
                    std::mem::forget(handle);
                    break;
                }
                
                std::thread::sleep(std::time::Duration::from_millis(100));
            }
        }
        
        // 清理状态
        self.packet_receiver = None;
        self.statistics = None;
        
        // 清理数据包缓存
        if let Ok(mut cache) = self.packet_cache.lock() {
            cache.clear();
        }
    }

    pub fn is_running(&self) -> bool {
        self.running.load(Ordering::Relaxed)
    }

    pub fn get_statistics(&self) -> Option<PacketStatistics> {
        if let Some(ref stats) = self.statistics {
            if let Ok(stats_guard) = stats.lock() {
                return Some(stats_guard.clone());
            }
        }
        None
    }

    pub fn get_packets(&self, max_count: usize) -> Vec<CapturedPacket> {
        if let Ok(cache) = self.packet_cache.lock() {
            // 从缓存中获取最新的数据包，按时间倒序（最新的在前）
            cache.iter()
                .rev()
                .take(max_count)
                .cloned()
                .collect()
        } else {
            Vec::new()
        }
    }

    // 添加新方法：支持前端过滤的数据包获取
    pub fn get_filtered_packets(&self, max_count: usize, protocol_filter: Option<&str>) -> Vec<CapturedPacket> {
        if let Ok(cache) = self.packet_cache.lock() {
            let mut filtered_packets = Vec::new();
            
            // 从最新的数据包开始遍历
            for packet in cache.iter().rev() {
                // 应用协议过滤
                if let Some(protocol) = protocol_filter {
                    if !protocol.is_empty() && protocol != "all" && packet.protocol != protocol {
                        continue;
                    }
                }
                
                filtered_packets.push(packet.clone());
                
                // 达到请求数量时停止
                if filtered_packets.len() >= max_count {
                    break;
                }
            }
            
            filtered_packets
        } else {
            Vec::new()
        }
    }
}

impl Default for SnifferManager {
    fn default() -> Self {
        Self::new()
    }
}