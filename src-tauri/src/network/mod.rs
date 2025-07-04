pub mod packet_builder;
pub mod interface;

pub use packet_builder::PacketBuilder;
pub use interface::NetworkInterface;

use serde::{Deserialize, Serialize};
use anyhow::Result;

#[derive(Debug, Serialize, Deserialize)]
pub struct PacketData {
    pub protocol: String,
    pub fields: std::collections::HashMap<String, String>,
    pub payload: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SendResult {
    pub success: bool,
    pub message: String,
    pub interface: Option<String>,
}

pub async fn send_packet(packet_data: PacketData, interface_name: Option<String>) -> Result<SendResult> {
    let mut interface = if let Some(name) = interface_name {
        NetworkInterface::find_by_name(&name)?
    } else {
        NetworkInterface::get_default()?
    };

    let packet = PacketBuilder::new(packet_data)
        .build()?;

    interface.send_packet(&packet)?;

    Ok(SendResult {
        success: true,
        message: format!("报文已通过接口 {} 发送成功", interface.name()),
        interface: Some(interface.name().to_string()),
    })
} 