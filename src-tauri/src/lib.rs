// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/

mod network;

use network::{PacketData, SendResult, NetworkInterface};
use network::interface::InterfaceInfo;
use serde_json::Value;
use std::collections::HashMap;

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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            greet,
            send_packet,
            get_network_interfaces
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
