use serde::{Serialize, Deserialize};
use std::sync::{Arc, Mutex};
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{SystemTime, UNIX_EPOCH, Instant};
use std::collections::{HashMap, VecDeque};
use crossbeam_channel::{bounded, Receiver, Sender};
use anyhow::{Result, anyhow};
use uuid::Uuid;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TestConfig {
    pub test_type: String,
    pub target_ip: String,
    pub target_mac: Option<String>,
    pub timeout: u64,
    pub interval: u64,
    pub count: u64, // 0 表示无限循环
    pub payload: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TestResult {
    pub id: String,
    pub timestamp: u64,
    pub test_type: String,
    pub target: String,
    pub status: String, // success, failed, timeout
    pub rtt: Option<f64>, // 往返时间(毫秒)
    pub error: Option<String>,
    pub response_data: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct MonitoringStatistics {
    pub total_tests: u64,
    pub successful_tests: u64,
    pub failed_tests: u64,
    pub average_rtt: f64,
    pub min_rtt: f64,
    pub max_rtt: f64,
}

// 等待响应的测试项
#[derive(Debug, Clone)]
struct PendingTest {
    id: String,
    test_type: String,
    target: String,
    start_time: Instant,
    timeout: u64,
    expected_response: ExpectedResponse,
}

#[derive(Debug, Clone)]
#[allow(dead_code)]
enum ExpectedResponse {
    IcmpEchoReply,
    ArpReply { target_ip: String },
    TcpSynAck { target_port: u16 },
    UdpData,
}

pub struct ResponseMonitor {
    running: Arc<AtomicBool>,
    test_config: Arc<Mutex<Option<TestConfig>>>,
    pending_tests: Arc<Mutex<HashMap<String, PendingTest>>>,
    test_results: Arc<Mutex<VecDeque<TestResult>>>,
    statistics: Arc<Mutex<MonitoringStatistics>>,
    result_sender: Sender<TestResult>,
    result_receiver: Receiver<TestResult>,
}

impl ResponseMonitor {
    pub fn new() -> Result<Self> {
        let (result_sender, result_receiver) = bounded(1000);
        
        Ok(Self {
            running: Arc::new(AtomicBool::new(false)),
            test_config: Arc::new(Mutex::new(None)),
            pending_tests: Arc::new(Mutex::new(HashMap::new())),
            test_results: Arc::new(Mutex::new(VecDeque::new())),
            statistics: Arc::new(Mutex::new(MonitoringStatistics {
                total_tests: 0,
                successful_tests: 0,
                failed_tests: 0,
                average_rtt: 0.0,
                min_rtt: 0.0,
                max_rtt: 0.0,
            })),
            result_sender,
            result_receiver,
        })
    }

    pub fn start_monitoring(&mut self, interface_name: String, test_config: TestConfig) -> Result<()> {
        if self.running.load(Ordering::Relaxed) {
            return Err(anyhow!("响应监控已在运行中"));
        }

        // 保存测试配置
        {
            let mut config_guard = self.test_config.lock().unwrap();
            *config_guard = Some(test_config.clone());
        }

        // 重置统计信息
        {
            let mut stats = self.statistics.lock().unwrap();
            *stats = MonitoringStatistics {
                total_tests: 0,
                successful_tests: 0,
                failed_tests: 0,
                average_rtt: 0.0,
                min_rtt: 0.0,
                max_rtt: 0.0,
            };
        }

        // 清空之前的结果
        {
            let mut results = self.test_results.lock().unwrap();
            results.clear();
        }

        self.running.store(true, Ordering::Relaxed);

        // 启动发送测试包的线程
        let running_clone = self.running.clone();
        let config_clone = self.test_config.clone();
        let pending_tests_clone = self.pending_tests.clone();
        let interface_name_clone = interface_name.clone();
        
        std::thread::spawn(move || {
            Self::run_test_sender(
                running_clone,
                config_clone,
                pending_tests_clone,
                interface_name_clone,
            );
        });

        // 启动超时检查线程
        let running_clone = self.running.clone();
        let pending_tests_clone = self.pending_tests.clone();
        let result_sender_clone = self.result_sender.clone();
        let statistics_clone = self.statistics.clone();
        
        std::thread::spawn(move || {
            Self::run_timeout_checker(
                running_clone,
                pending_tests_clone,
                result_sender_clone,
                statistics_clone,
            );
        });

        // 启动结果收集线程
        let running_clone = self.running.clone();
        let result_receiver = self.result_receiver.clone();
        let test_results_clone = self.test_results.clone();
        let statistics_clone = self.statistics.clone();
        
        std::thread::spawn(move || {
            Self::run_result_collector(running_clone, result_receiver, test_results_clone, statistics_clone);
        });

        Ok(())
    }

    pub fn stop_monitoring(&mut self) {
        self.running.store(false, Ordering::Relaxed);
    }

    pub fn is_running(&self) -> bool {
        self.running.load(Ordering::Relaxed)
    }

    pub fn get_statistics(&self) -> MonitoringStatistics {
        self.statistics.lock().unwrap().clone()
    }

    pub fn get_test_results(&self, max_count: usize) -> Vec<TestResult> {
        let results = self.test_results.lock().unwrap();
        results.iter()
            .take(max_count)
            .cloned()
            .collect()
    }

    // 处理接收到的数据包，检查是否匹配待处理的测试
    pub fn process_received_packet(&self, packet: &crate::network::CapturedPacket) {
        if !self.running.load(Ordering::Relaxed) {
            return;
        }

        let mut pending_guard = match self.pending_tests.lock() {
            Ok(guard) => guard,
            Err(_) => return,
        };

        let _pending_count = pending_guard.len();
        // 调试信息已移除以避免崩溃

        let mut matched_tests = Vec::new();
        
        // 检查是否有匹配的待处理测试
        for (test_id, pending_test) in pending_guard.iter() {
            if self.matches_expected_response(packet, &pending_test.expected_response) {
                let rtt = pending_test.start_time.elapsed().as_secs_f64() * 1000.0;
                let result = TestResult {
                    id: pending_test.id.clone(),
                    timestamp: SystemTime::now()
                        .duration_since(UNIX_EPOCH)
                        .unwrap()
                        .as_millis() as u64,
                    test_type: pending_test.test_type.clone(),
                    target: pending_test.target.clone(),
                    status: "success".to_string(),
                    rtt: Some(rtt),
                    error: None,
                    response_data: Some(packet.info.clone()),
                };
                
                matched_tests.push((test_id.clone(), result));
            }
        }

        // 移除匹配的测试并发送结果
        for (test_id, result) in matched_tests {
            pending_guard.remove(&test_id);
            let _ = self.result_sender.try_send(result);
        }
    }

    fn matches_expected_response(&self, packet: &crate::network::CapturedPacket, expected: &ExpectedResponse) -> bool {
        let matches = match expected {
            ExpectedResponse::IcmpEchoReply => {
                // 对于ICMP Echo Reply，我们检查：
                // 1. 协议是ICMP
                // 2. 数据包有源IP（来自我们ping的目标）
                let is_match = packet.protocol == "icmp" && packet.src_ip.is_some();
                // 调试信息已移除以避免崩溃
                is_match
            },
            ExpectedResponse::ArpReply { target_ip } => {
                packet.protocol == "arp" && 
                packet.info.contains("Reply") &&
                packet.src_ip.as_ref().map_or(false, |ip| ip == target_ip)
            },
            ExpectedResponse::TcpSynAck { target_port } => {
                packet.protocol == "tcp" &&
                packet.src_port == Some(*target_port) &&
                packet.info.contains("SYN-ACK")
            },
            ExpectedResponse::UdpData => {
                packet.protocol == "udp"
            },
        };
        
        // 调试信息已移除以避免崩溃
        
        matches
    }

    fn run_test_sender(
        running: Arc<AtomicBool>,
        test_config: Arc<Mutex<Option<TestConfig>>>,
        pending_tests: Arc<Mutex<HashMap<String, PendingTest>>>,
        interface_name: String,
    ) {
        use crate::network::{PacketData, PacketBuilder};
        use crate::network::interface::NetworkSender;
        
        let mut sender = match NetworkSender::open(&interface_name) {
            Ok(s) => s,
            Err(_) => return,
        };

        let mut test_count = 0u64;

        while running.load(Ordering::Relaxed) {
            let config = match test_config.lock() {
                Ok(guard) => match guard.as_ref() {
                    Some(config) => config.clone(),
                    None => {
                        std::thread::sleep(std::time::Duration::from_millis(100));
                        continue;
                    }
                },
                Err(_) => break,
            };

            // 检查是否需要停止（达到指定测试次数）
            if config.count > 0 && test_count >= config.count {
                running.store(false, Ordering::Relaxed);
                break;
            }

            // 生成测试ID
            let test_id = Uuid::new_v4().to_string();
            let start_time = Instant::now();

            // 根据测试类型创建数据包
            let (packet_data, expected_response) = match config.test_type.as_str() {
                "ping" => {
                    // 调试信息已移除以避免崩溃
                    
                    let mut fields = std::collections::HashMap::new();
                    fields.insert("icmp_type".to_string(), "08".to_string()); // Echo Request
                    fields.insert("icmp_code".to_string(), "00".to_string());
                    fields.insert("identifier".to_string(), format!("{:04x}", test_count & 0xFFFF));
                    fields.insert("sequence".to_string(), format!("{:04x}", test_count & 0xFFFF));
                    fields.insert("dstIp".to_string(), config.target_ip.clone());
                    
                    let packet_data = PacketData {
                        protocol: "icmp".to_string(),
                        fields,
                        payload: config.payload.clone(),
                    };
                    
                    (packet_data, ExpectedResponse::IcmpEchoReply)
                },
                "arp" => {
                    let mut fields = std::collections::HashMap::new();
                    fields.insert("op".to_string(), "0001".to_string()); // Request
                    fields.insert("sender_ip".to_string(), "192.168.1.100".to_string()); // 需要动态获取
                    fields.insert("target_ip".to_string(), config.target_ip.clone());
                    fields.insert("target_mac".to_string(), "00:00:00:00:00:00".to_string());
                    
                    let packet_data = PacketData {
                        protocol: "arp".to_string(),
                        fields,
                        payload: None,
                    };
                    
                    (packet_data, ExpectedResponse::ArpReply { target_ip: config.target_ip.clone() })
                },
                _ => {
                    std::thread::sleep(std::time::Duration::from_millis(config.interval));
                    continue;
                }
            };

            // 发送测试包
            if let Ok(packet_bytes) = PacketBuilder::new(packet_data).build() {
                if sender.send(&packet_bytes).is_ok() {
                    // 记录待处理的测试
                    let pending_test = PendingTest {
                        id: test_id.clone(),
                        test_type: config.test_type.clone(),
                        target: config.target_ip.clone(),
                        start_time,
                        timeout: config.timeout,
                        expected_response,
                    };
                    
                    if let Ok(mut pending_guard) = pending_tests.lock() {
                        pending_guard.insert(test_id, pending_test);
                    }
                    
                    test_count += 1;
                }
            }

            // 等待指定间隔
            std::thread::sleep(std::time::Duration::from_millis(config.interval));
        }
    }

    fn run_timeout_checker(
        running: Arc<AtomicBool>,
        pending_tests: Arc<Mutex<HashMap<String, PendingTest>>>,
        result_sender: Sender<TestResult>,
        _statistics: Arc<Mutex<MonitoringStatistics>>,
    ) {
        while running.load(Ordering::Relaxed) {
            let mut timed_out_tests = Vec::new();
            
            {
                let mut pending_guard = match pending_tests.lock() {
                    Ok(guard) => guard,
                    Err(_) => break,
                };
                
                let _now = Instant::now();
                let mut to_remove = Vec::new();
                
                for (test_id, pending_test) in pending_guard.iter() {
                    let elapsed_ms = pending_test.start_time.elapsed().as_millis() as u64;
                    if elapsed_ms > pending_test.timeout {
                        let result = TestResult {
                            id: pending_test.id.clone(),
                            timestamp: SystemTime::now()
                                .duration_since(UNIX_EPOCH)
                                .unwrap()
                                .as_millis() as u64,
                            test_type: pending_test.test_type.clone(),
                            target: pending_test.target.clone(),
                            status: "timeout".to_string(),
                            rtt: None,
                            error: Some("请求超时".to_string()),
                            response_data: None,
                        };
                        
                        timed_out_tests.push(result);
                        to_remove.push(test_id.clone());
                    }
                }
                
                for test_id in to_remove {
                    pending_guard.remove(&test_id);
                }
            }
            
            // 发送超时结果
            for result in timed_out_tests {
                // 注意：这里无法直接访问self来更新统计信息
                // 统计信息的更新将在结果收集线程中进行
                let _ = result_sender.try_send(result);
            }
            
            std::thread::sleep(std::time::Duration::from_millis(100));
        }
    }

    fn run_result_collector(
        running: Arc<AtomicBool>,
        result_receiver: Receiver<TestResult>,
        test_results: Arc<Mutex<VecDeque<TestResult>>>,
        statistics: Arc<Mutex<MonitoringStatistics>>,
    ) {
        while running.load(Ordering::Relaxed) {
            match result_receiver.recv_timeout(std::time::Duration::from_millis(100)) {
                Ok(result) => {
                    // 更新统计信息
                    if let Ok(mut stats) = statistics.lock() {
                        stats.total_tests += 1;
                        
                        match result.status.as_str() {
                            "success" => {
                                stats.successful_tests += 1;
                                if let Some(rtt) = result.rtt {
                                    if stats.min_rtt == 0.0 || rtt < stats.min_rtt {
                                        stats.min_rtt = rtt;
                                    }
                                    if rtt > stats.max_rtt {
                                        stats.max_rtt = rtt;
                                    }
                                    
                                    // 计算平均RTT
                                    let total_successful_rtt = stats.average_rtt * (stats.successful_tests - 1) as f64;
                                    stats.average_rtt = (total_successful_rtt + rtt) / stats.successful_tests as f64;
                                }
                            },
                            _ => {
                                stats.failed_tests += 1;
                            }
                        }
                    }
                    
                    // 保存测试结果
                    if let Ok(mut results_guard) = test_results.lock() {
                        results_guard.push_front(result);
                        // 限制结果数量
                        if results_guard.len() > 1000 {
                            results_guard.pop_back();
                        }
                    }
                },
                Err(_) => continue,
            }
        }
    }

}

impl Default for ResponseMonitor {
    fn default() -> Self {
        Self::new().unwrap()
    }
}

// 全局响应监控管理器
pub struct MonitorManager {
    monitor: Arc<Mutex<ResponseMonitor>>,
}

impl MonitorManager {
    pub fn new() -> Self {
        Self {
            monitor: Arc::new(Mutex::new(ResponseMonitor::new().unwrap())),
        }
    }

    pub fn start_monitoring(&self, interface_name: String, test_config: TestConfig) -> Result<()> {
        let mut monitor = self.monitor.lock().unwrap();
        monitor.start_monitoring(interface_name, test_config)
    }

    pub fn stop_monitoring(&self) {
        let mut monitor = self.monitor.lock().unwrap();
        monitor.stop_monitoring();
    }

    pub fn is_running(&self) -> bool {
        let monitor = self.monitor.lock().unwrap();
        monitor.is_running()
    }

    pub fn get_statistics(&self) -> Option<MonitoringStatistics> {
        if let Ok(monitor) = self.monitor.lock() {
            Some(monitor.get_statistics())
        } else {
            None
        }
    }

    pub fn get_test_results(&self, max_count: usize) -> Vec<TestResult> {
        if let Ok(monitor) = self.monitor.lock() {
            monitor.get_test_results(max_count)
        } else {
            Vec::new()
        }
    }

    pub fn process_received_packet(&self, packet: &crate::network::CapturedPacket) {
        if let Ok(monitor) = self.monitor.lock() {
            monitor.process_received_packet(packet);
        }
    }
}

impl Default for MonitorManager {
    fn default() -> Self {
        Self::new()
    }
}