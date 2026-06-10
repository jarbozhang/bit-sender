//! v2 网络 I/O：网卡枚举 + pcap 发送封装。
//!
//! 与 v1 `network::interface` 的区别：类型干净、错误是 `String`（直达前端），
//! 不掺杂 v1 的多重 MAC 匹配兜底。Windows 下精细 MAC 映射留待 M8 补强。

use pcap::{Active, Capture, Device};
use serde::{Deserialize, Serialize};
use specta::Type;

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct InterfaceInfo {
    pub name: String,
    pub description: Option<String>,
    pub mac: Option<String>,
    pub addresses: Vec<String>,
}

/// 枚举本机网卡。失败返回可直接展示给前端的错误串。
pub fn list_interfaces() -> Result<Vec<InterfaceInfo>, String> {
    let devices = Device::list().map_err(|e| format!("枚举网卡失败: {}", e))?;
    Ok(devices
        .into_iter()
        .map(|d| {
            let addresses = d.addresses.iter().map(|a| a.addr.to_string()).collect();
            let mac = mac_address::mac_address_by_name(&d.name)
                .ok()
                .flatten()
                .map(|m| m.to_string());
            InterfaceInfo {
                name: d.name,
                description: d.desc,
                mac,
                addresses,
            }
        })
        .collect())
}

/// 持有一个已打开的 pcap 句柄，可重复发送（批量/序列发送会复用，避免每包重开设备）。
pub struct PacketSender {
    cap: Capture<Active>,
}

impl PacketSender {
    pub fn open(name: &str) -> Result<Self, String> {
        let device = Device::list()
            .map_err(|e| format!("枚举网卡失败: {}", e))?
            .into_iter()
            .find(|d| d.name == name)
            .ok_or_else(|| format!("未找到网卡: {}", name))?;
        let cap = Capture::from_device(device)
            .map_err(|e| format!("创建捕获实例失败: {}", e))?
            .promisc(true)
            .snaplen(65535)
            .open()
            .map_err(|e| {
                format!(
                    "打开网卡 {} 失败：通常是权限问题。\n解决：\n  • macOS/Linux: sudo 运行，或 sudo setcap cap_net_raw+ep <程序>\n  • Windows: 安装 Npcap 并以管理员运行\n原始错误: {}",
                    name, e
                )
            })?;
        Ok(Self { cap })
    }

    pub fn send(&mut self, bytes: &[u8]) -> Result<(), String> {
        self.cap
            .sendpacket(bytes)
            .map_err(|e| format!("发送数据包失败（检查权限/网卡状态）: {}", e))
    }
}
