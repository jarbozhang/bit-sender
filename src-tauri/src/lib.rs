// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/

mod network;

use network::{PacketData, SendResult, NetworkInterface, BatchTaskStatus, BatchTaskHandle, TaskMap, SnifferState, MonitorState};
use network::interface::InterfaceInfo;
use network::{SnifferManager, CapturedPacket, PacketStatistics, CaptureFilters, MonitorManager, TestConfig, TestResult, MonitoringStatistics};
use serde_json::Value;
use std::collections::HashMap;
use std::sync::Arc;
use tauri::State;
use uuid::Uuid;
use crate::network::interface::NetworkSender;
// use crossbeam_channel::{bounded, select}; // 保留备用
use std::sync::atomic::{AtomicU64, AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::SystemTime;

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
async fn send_packet(packet_data: Value, interface_name: Option<String>) -> Result<SendResult, String> {
    // 将 JSON 数据转换为 PacketData
    let protocol = packet_data["protocol"]
        .as_str()
        .ok_or("缺少协议类型")?
        .to_string();
    
    let fields_value = packet_data["fields"]
        .as_object()
        .ok_or("缺少字段数据")?;
    
    let mut fields = HashMap::new();
    for (key, value) in fields_value {
        if let Some(str_value) = value.as_str() {
            fields.insert(key.clone(), str_value.to_string());
        }
    }
    
    let payload = packet_data["payload"]
        .as_str()
        .map(|s| s.to_string());
    
    let packet_data = PacketData {
        protocol,
        fields,
        payload,
    };
    
    // 发送报文
    match network::send_packet(packet_data, interface_name).await {
        Ok(result) => Ok(result),
        Err(e) => Err(format!("发送失败: {}", e)),
    }
}

#[tauri::command]
fn get_network_interfaces() -> Result<Vec<InterfaceInfo>, String> {
    match NetworkInterface::list_interfaces() {
        Ok(interfaces) => Ok(interfaces),
        Err(e) => Err(format!("获取网络接口失败: {}", e)),
    }
}

#[tauri::command]
async fn start_batch_send(
    packet_data: serde_json::Value,
    interface_name: Option<String>,
    frequency: u32,
    stop_condition: Option<String>,
    stop_value: Option<u32>,
    state: State<'_, TaskMap>,
) -> Result<String, String> {
    use tokio::sync::oneshot;

    let task_id = Uuid::new_v4().to_string();
    let sent_count = Arc::new(AtomicU64::new(0));
    let running = Arc::new(AtomicBool::new(true));
    let status = Arc::new(Mutex::new(BatchTaskStatus {
        task_id: task_id.clone(),
        start_time: SystemTime::now().duration_since(SystemTime::UNIX_EPOCH).unwrap().as_secs(),
        sent_count: 0,
        speed: frequency,
        running: true,
    }));

    let (stop_tx, stop_rx) = oneshot::channel();

    // 唯一的 stop_rx 监听器，它是一个轻量级的异步任务
    let running_for_stop = running.clone();
    tokio::spawn(async move {
        let _ = stop_rx.await;
        running_for_stop.store(false, Ordering::Relaxed);
    });

    // 为主工作任务克隆所需变量
    let status_clone = status.clone();
    let sent_count_clone = sent_count.clone();
    let running_clone = running.clone();
    let packet_data_clone = packet_data.clone();
    let interface_name_clone = interface_name.clone();
    let stop_condition = stop_condition.unwrap_or_else(|| "manual".to_string());
    let stop_value = stop_value.unwrap_or(0);

    // 将所有阻塞的发包逻辑都放到一个专用的阻塞线程中，避免饿死 Tokio 运行时
    tokio::task::spawn_blocking(move || {
        // 自适应线程数：根据频率动态调整
        let thread_count = match frequency {
            1..=100 => 1,      // 低频：单线程精确控制
            101..=1000 => 2,   // 中频：双线程
            1001..=10000 => 4, // 高频：四线程
            _ => 8,            // 超高频：八线程
        };

        // 状态统计线程
        let status_for_stats = status_clone.clone();
        let sent_for_stats = sent_count_clone.clone();
        let running_for_stats = running_clone.clone();
        std::thread::spawn(move || {
            while running_for_stats.load(Ordering::Relaxed) {
                {
                    let mut s = status_for_stats.lock().unwrap();
                    s.sent_count = sent_for_stats.load(Ordering::Relaxed);
                }
                std::thread::sleep(std::time::Duration::from_millis(100));
            }
        });

        // 记录任务开始时间
        let task_start_time = std::time::Instant::now();
        
        // 启动工作线程
        let mut handles = vec![];
        for thread_id in 0..thread_count {
            let sent_for_thread = sent_count_clone.clone();
            let running_for_thread = running_clone.clone();
            let interface_for_thread = interface_name_clone.clone();
            let packet_for_thread = packet_data_clone.clone();
            let stop_condition_clone = stop_condition.clone();

            handles.push(std::thread::spawn(move || {
                // 初始化网络发送器
                let mut sender = match NetworkSender::open(interface_for_thread.as_deref().unwrap_or_default()) {
                    Ok(s) => s,
                    Err(_) => {
                        running_for_thread.store(false, Ordering::Relaxed);
                        return;
                    }
                };

                // 构建数据包
                let packet_bytes = match network::PacketBuilder::new(PacketData {
                    protocol: packet_for_thread["protocol"].as_str().unwrap_or_default().to_string(),
                    fields: packet_for_thread["fields"].as_object().unwrap().iter().map(|(k, v)| (k.clone(), v.as_str().unwrap_or_default().to_string())).collect(),
                    payload: packet_for_thread["payload"].as_str().map(String::from),
                }).build() {
                    Ok(bytes) => bytes,
                    Err(_) => {
                        running_for_thread.store(false, Ordering::Relaxed);
                        return;
                    }
                };

                // 计算每个线程的发送间隔（微秒）
                let interval_micros = (1_000_000 * thread_count as u64) / frequency.max(1) as u64;
                let interval = std::time::Duration::from_micros(interval_micros);
                
                // 为每个线程添加随机偏移，避免所有线程同时发送
                let thread_offset = std::time::Duration::from_micros((interval_micros / thread_count as u64) * thread_id as u64);
                
                let start_time = std::time::Instant::now() + thread_offset;
                let mut next_send_time = start_time;
                
                // 根据频率选择不同的等待策略
                let max_sleep_duration = if frequency <= 100 {
                    std::time::Duration::from_millis(1)  // 低频：毫秒级等待
                } else if frequency <= 10000 {
                    std::time::Duration::from_micros(100) // 中高频：百微秒级等待
                } else {
                    std::time::Duration::from_micros(10)  // 超高频：十微秒级等待
                };
                
                while running_for_thread.load(Ordering::Relaxed) {
                    let now = std::time::Instant::now();
                    
                    // 检查终止条件
                    let should_stop = match stop_condition_clone.as_str() {
                        "duration" => {
                            let elapsed_secs = task_start_time.elapsed().as_secs();
                            elapsed_secs >= stop_value as u64
                        }
                        "count" => {
                            let current_count = sent_for_thread.load(Ordering::Relaxed);
                            current_count >= stop_value as u64
                        }
                        _ => false, // "manual" - 不自动停止
                    };
                    
                    if should_stop {
                        running_for_thread.store(false, Ordering::Relaxed);
                        break;
                    }
                    
                    if now >= next_send_time {
                        // 发送报文，支持错误重试
                        match sender.send(&packet_bytes) {
                            Ok(_) => {
                                sent_for_thread.fetch_add(1, Ordering::Relaxed);
                            }
                            Err(_) => {
                                // 发送失败时稍微延迟后继续尝试
                                // 这可能是由于网络缓冲区满、网卡过载等临时问题
                                let error_delay = if frequency <= 1000 {
                                    std::time::Duration::from_millis(1)
                                } else {
                                    std::time::Duration::from_micros(100)
                                };
                                std::thread::sleep(error_delay);
                            }
                        }
                        
                        // 计算下次发送时间
                        next_send_time += interval;
                        
                        // 如果已经落后太多，重新同步到当前时间
                        if next_send_time < now {
                            next_send_time = now + interval;
                        }
                    } else {
                        // 精确等待到下次发送时间
                        let sleep_duration = (next_send_time - now).min(max_sleep_duration);
                        std::thread::sleep(sleep_duration);
                    }
                }
            }));
        }

        // 等待所有工作线程结束
        for handle in handles {
            let _ = handle.join();
        }
        
        // 任务结束，更新最终状态
        let mut final_status = status_clone.lock().unwrap();
        final_status.running = false;
        final_status.sent_count = sent_count_clone.load(Ordering::Relaxed);
    });

    let mut map = state.lock().unwrap();
    map.insert(task_id.clone(), BatchTaskHandle {
        status,
        stop_tx: Some(stop_tx),
    });

    Ok(task_id)
}

#[tauri::command]
fn get_batch_send_status(task_id: String, state: State<'_, TaskMap>) -> Option<BatchTaskStatus> {
    let map = state.lock().unwrap();
    map.get(&task_id).map(|handle| handle.status.lock().unwrap().clone())
}

#[tauri::command]
fn stop_batch_send(task_id: String, state: State<'_, TaskMap>) -> bool {
    let mut map = state.lock().unwrap();
    if let Some(handle) = map.get_mut(&task_id) {
        if let Some(stop_tx) = handle.stop_tx.take() {
            let _ = stop_tx.send(());
            return true;
        }
    }
    false
}

// 数据包嗅探相关命令
#[tauri::command]
async fn start_packet_capture(
    interface_name: String,
    filters: CaptureFilters,
    sniffer_state: State<'_, SnifferState>
) -> Result<String, String> {
    let mut sniffer = sniffer_state.lock().map_err(|e| {
        format!("获取嗅探器状态失败: {}", e)
    })?;
    
    match sniffer.start_capture(interface_name.clone(), filters) {
        Ok(()) => {
            Ok(format!("开始在接口 {} 上进行数据包捕获", interface_name))
        },
        Err(e) => {
            Err(format!("启动数据包捕获失败: {}", e))
        }
    }
}

#[tauri::command]
async fn stop_packet_capture(sniffer_state: State<'_, SnifferState>) -> Result<String, String> {
    let mut sniffer = sniffer_state.lock().map_err(|e| format!("获取嗅探器状态失败: {}", e))?;
    sniffer.stop_capture();
    Ok("数据包捕获已停止".to_string())
}

#[tauri::command]
fn get_capture_status(sniffer_state: State<'_, SnifferState>) -> Result<bool, String> {
    let sniffer = sniffer_state.lock().map_err(|e| format!("获取嗅探器状态失败: {}", e))?;
    Ok(sniffer.is_running())
}

#[tauri::command]
fn get_packet_statistics(sniffer_state: State<'_, SnifferState>) -> Option<PacketStatistics> {
    if let Ok(sniffer) = sniffer_state.lock() {
        sniffer.get_statistics()
    } else {
        None
    }
}

#[tauri::command]
fn get_captured_packets(
    max_count: Option<usize>, 
    sniffer_state: State<'_, SnifferState>,
    monitor_state: State<'_, MonitorState>
) -> Vec<CapturedPacket> {
    let max_count = max_count.unwrap_or(100);
    
    if let Ok(sniffer) = sniffer_state.lock() {
        let packets = sniffer.get_packets(max_count);
        
        // 将数据包转发给响应监控器处理
        if let Ok(monitor) = monitor_state.lock() {
            for packet in &packets {
                monitor.process_received_packet(packet);
            }
        }
        
        packets
    } else {
        Vec::new()
    }
}

#[tauri::command]
fn get_filtered_packets(
    max_count: Option<usize>,
    protocol_filter: Option<String>,
    sniffer_state: State<'_, SnifferState>,
    monitor_state: State<'_, MonitorState>
) -> Vec<CapturedPacket> {
    let max_count = max_count.unwrap_or(100);
    
    if let Ok(sniffer) = sniffer_state.lock() {
        let packets = sniffer.get_filtered_packets(
            max_count, 
            protocol_filter.as_deref()
        );
        
        // 将数据包转发给响应监控器处理
        if let Ok(monitor) = monitor_state.lock() {
            for packet in &packets {
                monitor.process_received_packet(packet);
            }
        }
        
        packets
    } else {
        Vec::new()
    }
}

// 响应监控相关命令
#[tauri::command]
async fn start_response_monitoring(
    interface_name: String,
    test_config: TestConfig,
    monitor_state: State<'_, MonitorState>,
    sniffer_state: State<'_, SnifferState>
) -> Result<String, String> {
    // 调试信息已移除以避免崩溃
    
    // 首先启动数据包捕获以接收响应
    {
        let mut sniffer = sniffer_state.lock().map_err(|e| format!("获取嗅探器状态失败: {}", e))?;
        
        // 创建适合响应监控的捕获过滤器
        // 先尝试捕获所有相关协议的数据包，不限制IP，以便调试
        let filters = CaptureFilters {
            protocol: Some(match test_config.test_type.as_str() {
                "ping" => "icmp".to_string(),
                "arp" => "arp".to_string(), 
                "tcp_connect" => "tcp".to_string(),
                "udp_echo" => "udp".to_string(),
                _ => "icmp".to_string(), // 默认ICMP
            }),
            src_mac: None,
            dst_mac: None,
            src_ip: None, // 暂时不限制源IP，捕获所有ICMP数据包用于调试
            dst_ip: None, // 不限制目标IP
            port: None,
        };
        
        // 调试信息已移除以避免崩溃
        
        // 启动数据包捕获
        sniffer.start_capture(interface_name.clone(), filters).map_err(|e| {
            format!("启动数据包捕获失败: {}", e)
        })?;
    }
    
    let monitor = monitor_state.lock().map_err(|e| format!("获取监控器状态失败: {}", e))?;
    
    match monitor.start_monitoring(interface_name.clone(), test_config) {
        Ok(()) => {
            Ok(format!("开始在接口 {} 上进行响应监控", interface_name))
        },
        Err(e) => {
            Err(format!("启动响应监控失败: {}", e))
        }
    }
}

#[tauri::command]
async fn stop_response_monitoring(
    monitor_state: State<'_, MonitorState>,
    sniffer_state: State<'_, SnifferState>
) -> Result<String, String> {
    // 停止响应监控
    let monitor = monitor_state.lock().map_err(|e| format!("获取监控器状态失败: {}", e))?;
    monitor.stop_monitoring();
    
    // 停止数据包捕获
    {
        let mut sniffer = sniffer_state.lock().map_err(|e| format!("获取嗅探器状态失败: {}", e))?;
        sniffer.stop_capture();
    }
    
    Ok("响应监控已停止".to_string())
}

#[tauri::command]
fn get_monitoring_status(monitor_state: State<'_, MonitorState>) -> Result<bool, String> {
    let monitor = monitor_state.lock().map_err(|e| format!("获取监控器状态失败: {}", e))?;
    Ok(monitor.is_running())
}

#[tauri::command]
fn get_monitoring_statistics(monitor_state: State<'_, MonitorState>) -> Option<MonitoringStatistics> {
    if let Ok(monitor) = monitor_state.lock() {
        monitor.get_statistics()
    } else {
        None
    }
}

#[tauri::command]
fn get_test_results(max_count: Option<usize>, monitor_state: State<'_, MonitorState>) -> Vec<TestResult> {
    let max_count = max_count.unwrap_or(50);
    
    if let Ok(monitor) = monitor_state.lock() {
        monitor.get_test_results(max_count)
    } else {
        Vec::new()
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .manage(network::TaskMap::default())
        .manage(SnifferState::new(Mutex::new(SnifferManager::new())))
        .manage(MonitorState::new(Mutex::new(MonitorManager::new())))
        .invoke_handler(tauri::generate_handler![
            greet,
            send_packet,
            get_network_interfaces,
            start_batch_send,
            get_batch_send_status,
            stop_batch_send,
            start_packet_capture,
            stop_packet_capture,
            get_capture_status,
            get_packet_statistics,
            get_captured_packets,
            get_filtered_packets,
            start_response_monitoring,
            stop_response_monitoring,
            get_monitoring_status,
            get_monitoring_statistics,
            get_test_results
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
