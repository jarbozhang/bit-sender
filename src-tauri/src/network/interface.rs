use anyhow::{Result, anyhow};
use pcap::Device;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InterfaceInfo {
    pub name: String,
    pub description: Option<String>,
    pub mac: Option<String>, // 新增
    pub addresses: Vec<String>,
}

pub struct NetworkInterface {
    device: Device,
}

impl NetworkInterface {
    pub fn list_interfaces() -> Result<Vec<InterfaceInfo>> {
        let devices = Device::list()?;
        let mut interfaces = Vec::new();

        for device in devices {
            let addresses: Vec<String> = device.addresses
                .iter()
                .map(|addr| format!("{}", addr.addr))
                .collect();

            // 获取 MAC 地址（macOS/Linux 示例，需在 Cargo.toml 添加 mac_address = "1.1"）
            let mac = match mac_address::mac_address_by_name(&device.name) {
                Ok(Some(ma)) => Some(ma.to_string()),
                _ => None,
            };

            interfaces.push(InterfaceInfo {
                name: device.name.clone(),
                description: device.desc.clone(),
                mac,
                addresses,
            });
        }

        Ok(interfaces)
    }

    pub fn find_by_name(name: &str) -> Result<Self> {
        let devices = Device::list()?;
        
        for device in devices {
            if device.name == name {
                return Ok(NetworkInterface {
                    device,
                });
            }
        }

        Err(anyhow!("未找到网络接口: {}", name))
    }

    pub fn get_default() -> Result<Self> {
        let devices = Device::list()?;
        
        if devices.is_empty() {
            return Err(anyhow!("未找到可用的网络接口"));
        }

        // 优先选择第一个非回环接口
        for device in &devices {
            if !device.name.contains("loopback") && !device.name.contains("lo") {
                return Ok(NetworkInterface {
                    device: device.clone(),
                });
            }
        }

        // 如果只有回环接口，使用第一个
        Ok(NetworkInterface {
            device: devices[0].clone(),
        })
    }

    pub fn name(&self) -> &str {
        &self.device.name
    }

    pub fn send_packet(&mut self, packet: &[u8]) -> Result<()> {
        let mut cap = match pcap::Capture::from_device(self.device.clone()) {
            Ok(cap) => cap,
            Err(e) => {
                return Err(anyhow!(
                    "无法打开网络接口 {}: {}\n\n解决方案:\n1. 使用 sudo 运行程序\n2. 或者运行: sudo setcap cap_net_raw+ep <程序路径>",
                    self.device.name, e
                ));
            }
        }.promisc(true)
         .snaplen(65535);

        let mut cap = match cap.open() {
            Ok(cap) => cap,
            Err(e) => {
                return Err(anyhow!(
                    "打开网络接口 {} 失败: {}\n\n这通常是权限问题。解决方案:\n1. 使用 sudo 运行程序\n2. 或者为程序设置权限: sudo setcap cap_net_raw+ep <程序路径>\n3. 或者将用户添加到 pcap 组 (如果存在): sudo usermod -a -G pcap $USER",
                    self.device.name, e
                ));
            }
        };

        match cap.sendpacket(packet) {
            Ok(_) => Ok(()),
            Err(e) => {
                Err(anyhow!(
                    "发送数据包失败: {}\n\n这是权限错误。请尝试:\n1. sudo 运行程序\n2. 设置程序权限: sudo setcap cap_net_raw+ep <程序路径>",
                    e
                ))
            }
        }
    }
}

pub struct NetworkSender {
    cap: pcap::Capture<pcap::Active>,
}

impl NetworkSender {
    pub fn open(name: &str) -> anyhow::Result<Self> {
        let device = pcap::Device::list()?
            .into_iter()
            .find(|d| d.name == name)
            .ok_or_else(|| anyhow::anyhow!("未找到网卡: {}", name))?;
        
        let cap = match pcap::Capture::from_device(device) {
            Ok(cap) => cap,
            Err(e) => {
                return Err(anyhow::anyhow!(
                    "无法访问网卡 {}: {}\n\n权限不足！解决方案:\n1. sudo 运行程序\n2. 设置权限: sudo setcap cap_net_raw+ep <程序路径>",
                    name, e
                ));
            }
        }.promisc(true)
         .snaplen(65535);

        let cap = match cap.open() {
            Ok(cap) => cap,
            Err(e) => {
                return Err(anyhow::anyhow!(
                    "打开网卡 {} 失败: {}\n\n权限错误！解决方案:\n1. sudo 运行程序\n2. 设置权限: sudo setcap cap_net_raw+ep <程序路径>\n3. 添加用户到 pcap 组: sudo usermod -a -G pcap $USER",
                    name, e
                ));
            }
        };
        
        Ok(Self { cap })
    }

    pub fn send(&mut self, packet: &[u8]) -> anyhow::Result<()> {
        match self.cap.sendpacket(packet) {
            Ok(_) => Ok(()),
            Err(e) => {
                Err(anyhow::anyhow!(
                    "发送数据包失败: {}\n\n权限错误！解决方案:\n1. sudo 运行程序\n2. 设置权限: sudo setcap cap_net_raw+ep <程序路径>",
                    e
                ))
            }
        }
    }
} 