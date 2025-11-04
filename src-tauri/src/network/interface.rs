use anyhow::{Result, anyhow};
use pcap::Device;
use serde::{Deserialize, Serialize};

#[cfg(windows)]
use windows::{
    core::*,
    Win32::NetworkManagement::IpHelper::*,
};

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

        // 在 Windows 上，预先获取所有适配器的 MAC 地址映射
        #[cfg(windows)]
        let mac_map = Self::get_windows_mac_map().unwrap_or_default();

        for device in devices {
            let addresses: Vec<String> = device.addresses
                .iter()
                .map(|addr| format!("{}", addr.addr))
                .collect();

            // 获取 MAC 地址
            let mac = {
                #[cfg(windows)]
                {
                    // Windows 平台：从 pcap 设备名中提取 GUID，然后查找对应的 MAC 地址
                    // pcap 设备名格式：\Device\NPF_{GUID}
                    if device.name.starts_with(r"\Device\NPF_") {
                        let guid_part = device.name.strip_prefix(r"\Device\NPF_").unwrap_or("");
                        // 尝试多种格式匹配
                        let guid_upper = guid_part.to_uppercase();
                        let guid_no_braces = guid_upper.trim_matches('{').trim_matches('}');
                        
                        // 首先尝试直接匹配（带花括号）
                        mac_map.get(&guid_upper)
                            // 然后尝试不带花括号的格式
                            .or_else(|| mac_map.get(guid_no_braces))
                            // 最后尝试带花括号的完整格式
                            .or_else(|| {
                                if !guid_upper.starts_with('{') {
                                    mac_map.get(&format!("{{{}}}", guid_upper))
                                } else {
                                    None
                                }
                            })
                            .cloned()
                            .flatten()
                    } else {
                        // 尝试使用设备描述名称匹配
                        device.desc.as_ref()
                            .and_then(|desc| mac_map.get(desc).cloned().flatten())
                            .or_else(|| {
                                // 如果都不行，尝试使用 mac_address crate 作为后备
                                mac_address::mac_address_by_name(&device.name)
                                    .ok()
                                    .flatten()
                                    .map(|ma| ma.to_string())
                            })
                    }
                }
                
                #[cfg(not(windows))]
                {
                    // macOS/Linux 平台：使用 mac_address crate
                    mac_address::mac_address_by_name(&device.name)
                        .ok()
                        .flatten()
                        .map(|ma| ma.to_string())
                }
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

    /// Windows 平台：获取所有网络适配器的 MAC 地址映射
    /// 返回映射表：适配器名称/GUID -> MAC 地址字符串
    #[cfg(windows)]
    fn get_windows_mac_map() -> Result<std::collections::HashMap<String, Option<String>>> {
        use std::collections::HashMap;

        let mut mac_map: HashMap<String, Option<String>> = HashMap::new();

        unsafe {
            // 调用 GetAdaptersAddresses 获取所有适配器信息
            let mut buffer_size = 0u32;
            let flags = GAA_FLAG_INCLUDE_PREFIX;
            
            // 第一次调用：获取所需缓冲区大小
            let result = GetAdaptersAddresses(
                AF_UNSPEC.0,
                flags,
                None,
                None,
                &mut buffer_size,
            );

            // 如果第一次调用返回的不是 ERROR_BUFFER_OVERFLOW，说明可能没有适配器或出错
            if result != ERROR_BUFFER_OVERFLOW && result != NO_ERROR {
                return Ok(HashMap::new()); // 返回空映射而不是错误，允许降级处理
            }

            // 分配缓冲区
            let mut buffer = vec![0u8; buffer_size as usize];
            let adapter_addresses = buffer.as_mut_ptr() as *mut IP_ADAPTER_ADDRESSES;

            // 第二次调用：获取实际数据
            let result = GetAdaptersAddresses(
                AF_UNSPEC.0,
                flags,
                None,
                Some(adapter_addresses),
                &mut buffer_size,
            );

            if result != NO_ERROR {
                return Ok(HashMap::new()); // 返回空映射，允许降级处理
            }

            // 遍历适配器链表
            let mut current = adapter_addresses;
            while !current.is_null() {
                let adapter = *current;
                
                // 获取适配器 GUID（AdapterName 字段）
                let guid = if !adapter.AdapterName.is_null() {
                    let guid_str = PWSTR::from_raw(adapter.AdapterName);
                    guid_str.to_string().ok()
                } else {
                    None
                };

                // 获取适配器友好名称（FriendlyName 字段）
                let friendly_name = if !adapter.FriendlyName.is_null() {
                    let name_str = PWSTR::from_raw(adapter.FriendlyName);
                    name_str.to_string().ok()
                } else {
                    None
                };

                // 获取 MAC 地址
                let mac_address = if adapter.PhysicalAddressLength > 0 && !adapter.PhysicalAddress.is_null() {
                    let mac_bytes = std::slice::from_raw_parts(
                        adapter.PhysicalAddress,
                        adapter.PhysicalAddressLength as usize,
                    );
                    
                    if mac_bytes.len() == 6 {
                        Some(format!(
                            "{:02X}:{:02X}:{:02X}:{:02X}:{:02X}:{:02X}",
                            mac_bytes[0], mac_bytes[1], mac_bytes[2],
                            mac_bytes[3], mac_bytes[4], mac_bytes[5]
                        ))
                    } else {
                        None
                    }
                } else {
                    None
                };

                // 存储到映射表：使用 GUID 作为主键
                if let Some(guid) = guid {
                    // 移除 GUID 中的花括号，以便匹配 pcap 设备名中的格式
                    let guid_clean = guid.trim_matches('{').trim_matches('}').to_uppercase();
                    mac_map.insert(guid_clean.clone(), mac_address.clone());
                    
                    // 也存储带花括号的版本
                    mac_map.insert(guid.to_uppercase(), mac_address.clone());
                }

                // 如果友好名称存在，也用它作为键（用于备用匹配）
                if let Some(name) = friendly_name {
                    mac_map.insert(name, mac_address);
                }

                // 移动到下一个适配器
                current = adapter.Next;
            }
        }

        Ok(mac_map)
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