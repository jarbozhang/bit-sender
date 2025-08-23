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
        // 开发阶段：只打印报文内容，不实际发送
        // println!("准备发送报文到接口: {}", self.device.name);
        // println!("报文长度: {} bytes", packet.len());
        // println!("报文内容: {:02X?}", packet);
        
        // 注释掉实际的发送逻辑，避免权限问题
        let mut cap = pcap::Capture::from_device(self.device.clone())?
            .promisc(true)
            .snaplen(65535)
            .open()?;

        cap.sendpacket(packet)?;
        
        // println!("报文发送成功");
        Ok(())
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
        let cap = pcap::Capture::from_device(device)?
            .promisc(true)
            .snaplen(65535)
            .open()?;
        Ok(Self { cap })
    }

    pub fn send(&mut self, packet: &[u8]) -> anyhow::Result<()> {
        self.cap.sendpacket(packet)?;
        Ok(())
    }
} 