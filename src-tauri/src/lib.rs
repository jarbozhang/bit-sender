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
    use std::time::SystemTime;
    use std::sync::Mutex;

    let task_id = Uuid::new_v4().to_string();
    let status = Arc::new(Mutex::new(BatchTaskStatus {
        task_id: task_id.clone(),
        start_time: SystemTime::now().duration_since(SystemTime::UNIX_EPOCH).unwrap().as_secs(),
        sent_count: 0,
        speed: frequency,
        running: true,
    }));

    let (stop_tx, mut stop_rx) = oneshot::channel();
    let status_clone = status.clone();
    let packet_data_clone = packet_data.clone();
    let interface_name_clone = interface_name.clone();

    tokio::spawn(async move {
        // 优化：只 open 一次设备
        let mut sender = match interface_name_clone.clone() {
            Some(ref name) => match NetworkSender::open(name) {
                Ok(s) => s,
                Err(e) => {
                    let mut s = status_clone.lock().unwrap();
                    s.running = false;
                    return;
                }
            },
            None => {
                let mut s = status_clone.lock().unwrap();
                s.running = false;
                return;
            }
        };

        let packet_bytes = {
            let protocol = packet_data_clone["protocol"].as_str().unwrap_or("").to_string();
            let fields_value = packet_data_clone["fields"].as_object().unwrap();
            let mut fields = std::collections::HashMap::new();
            for (key, value) in fields_value {
                if let Some(str_value) = value.as_str() {
                    fields.insert(key.clone(), str_value.to_string());
                }
            }
            let payload = packet_data_clone["payload"].as_str().map(|s| s.to_string());
            let packet = crate::network::PacketData { protocol, fields, payload };
            crate::network::PacketBuilder::new(packet).build().unwrap()
        };

        let interval = std::time::Duration::from_millis(1000 / frequency.max(1) as u64);
        loop {
            tokio::select! {
                _ = &mut stop_rx => {
                    let mut s = status_clone.lock().unwrap();
                    s.running = false;
                    break;
                }
                _ = tokio::time::sleep(interval) => {
                    // 只 send，不 open
                    if let Err(_e) = sender.send(&packet_bytes) {
                        let mut s = status_clone.lock().unwrap();
                        s.running = false;
                        break;
                    }
                    let mut s = status_clone.lock().unwrap();
                    s.sent_count += 1;
                }
            }
        }
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
