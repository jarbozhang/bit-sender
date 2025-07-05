// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/

mod network;

use network::{PacketData, SendResult, NetworkInterface, BatchTaskStatus, BatchTaskHandle, TaskMap};
use network::interface::InterfaceInfo;
use serde_json::Value;
use std::collections::HashMap;
use std::sync::Arc;
use tauri::State;
use uuid::Uuid;
use crate::network::interface::NetworkSender;
use crossbeam_channel::{bounded, select};
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

    // 将所有阻塞的发包逻辑都放到一个专用的阻塞线程中，避免饿死 Tokio 运行时
    tokio::task::spawn_blocking(move || {
        // burst/batch 参数
        let burst_size = 100;
        let thread_count = 4;
        let freq_per_thread = frequency.max(1) / thread_count.max(1);

        if frequency <= 100 {
            // 低频模式: crossbeam-channel + select!
            let (tick_tx, tick_rx) = bounded::<()>(1);

            // 定时器线程
            let running_for_ticker = running_clone.clone();
            let interval = std::time::Duration::from_millis(1000 / frequency.max(1) as u64);
            std::thread::spawn(move || {
                while running_for_ticker.load(Ordering::Relaxed) {
                    std::thread::sleep(interval);
                    if tick_tx.send(()).is_err() {
                        break;
                    }
                }
            });

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
                    std::thread::sleep(std::time::Duration::from_millis(200));
                }
            });

            // 发包主循环
            let mut sender = match NetworkSender::open(interface_name_clone.as_deref().unwrap_or_default()) {
                Ok(s) => s,
                Err(_) => {
                    running_clone.store(false, Ordering::Relaxed);
                    return;
                }
            };
            let packet_bytes = network::PacketBuilder::new(PacketData {
                protocol: packet_data_clone["protocol"].as_str().unwrap_or_default().to_string(),
                fields: packet_data_clone["fields"].as_object().unwrap().iter().map(|(k, v)| (k.clone(), v.as_str().unwrap_or_default().to_string())).collect(),
                payload: packet_data_clone["payload"].as_str().map(String::from),
            }).build().unwrap();

            let running_for_loop = running_clone.clone();
            let step = std::time::Duration::from_millis(10);
            while running_for_loop.load(Ordering::Relaxed) {
                select! {
                    recv(tick_rx) -> _ => {
                        if sender.send(&packet_bytes).is_err() {
                            running_for_loop.store(false, Ordering::Relaxed);
                            break;
                        }
                        sent_count_clone.fetch_add(1, Ordering::Relaxed);
                    },
                    default(step) => {
                        // 每隔 10ms 检查一次 running 状态，确保能及时退出
                    }
                }
            }
        } else {
            // 高频模式: 多线程 burst/batch
            let mut handles = vec![];
            for _ in 0..thread_count {
                let sent_for_thread = sent_count_clone.clone();
                let running_for_thread = running_clone.clone();
                let interface_for_thread = interface_name_clone.clone();
                let packet_for_thread = packet_data_clone.clone();

                handles.push(std::thread::spawn(move || {
                    let mut sender = match NetworkSender::open(interface_for_thread.as_deref().unwrap_or_default()) {
                        Ok(s) => s,
                        Err(_) => {
                            running_for_thread.store(false, Ordering::Relaxed);
                            return;
                        }
                    };
                    let packet_bytes = network::PacketBuilder::new(PacketData {
                        protocol: packet_for_thread["protocol"].as_str().unwrap_or_default().to_string(),
                        fields: packet_for_thread["fields"].as_object().unwrap().iter().map(|(k, v)| (k.clone(), v.as_str().unwrap_or_default().to_string())).collect(),
                        payload: packet_for_thread["payload"].as_str().map(String::from),
                    }).build().unwrap();

                    let interval = std::time::Duration::from_millis(1000 / freq_per_thread.max(1) as u64);
                    while running_for_thread.load(Ordering::Relaxed) {
                        for _ in 0..burst_size {
                            if !running_for_thread.load(Ordering::Relaxed) { break; }
                            if sender.send(&packet_bytes).is_err() {
                                running_for_thread.store(false, Ordering::Relaxed);
                                return;
                            }
                            sent_for_thread.fetch_add(1, Ordering::Relaxed);
                        }
                        std::thread::sleep(interval);
                    }
                }));
            }

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
                    std::thread::sleep(std::time::Duration::from_millis(200));
                }
            });

            for h in handles {
                let _ = h.join();
            }
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(network::TaskMap::default())
        .invoke_handler(tauri::generate_handler![
            greet,
            send_packet,
            get_network_interfaces,
            start_batch_send,
            get_batch_send_status,
            stop_batch_send
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
