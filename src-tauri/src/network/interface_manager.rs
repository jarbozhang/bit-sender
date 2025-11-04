use anyhow::{Result, anyhow};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::process::Command;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IpConfig {
    pub address: String,
    pub netmask: String,
    pub gateway: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RouteConfig {
    pub destination: String,
    pub gateway: String,
    pub interface: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InterfaceSnapshot {
    pub name: String,
    pub ip_addresses: Vec<IpConfig>,
    pub routes: Vec<RouteConfig>,
    pub mac_address: Option<String>,
    pub is_up: bool,
    pub is_isolated: bool,
}

#[derive(Debug)]
pub enum Platform {
    MacOS,
    Linux,
    Windows,
}

pub struct InterfaceManager {
    snapshots: HashMap<String, InterfaceSnapshot>,
    platform: Platform,
}

impl InterfaceManager {
    pub fn new() -> Result<Self> {
        let platform = Self::detect_platform()?;
        Ok(Self {
            snapshots: HashMap::new(),
            platform,
        })
    }

    fn detect_platform() -> Result<Platform> {
        if cfg!(target_os = "macos") {
            Ok(Platform::MacOS)
        } else if cfg!(target_os = "linux") {
            Ok(Platform::Linux)
        } else if cfg!(target_os = "windows") {
            Ok(Platform::Windows)
        } else {
            Err(anyhow!("不支持的操作系统平台"))
        }
    }

    // 检查是否有管理员权限
    pub fn check_admin_privileges(&self) -> Result<bool> {
        // 开发模式：在开发环境中返回 true 以便测试
        if cfg!(debug_assertions) {
            println!("[开发模式] 模拟管理员权限检查通过");
            return Ok(true);
        }
        
        match self.platform {
            Platform::MacOS | Platform::Linux => {
                // 尝试执行一个需要权限的命令来测试
                let output = Command::new("id").arg("-u").output()?;
                let uid = String::from_utf8(output.stdout)?
                    .trim()
                    .parse::<u32>()?;
                Ok(uid == 0)
            }
            Platform::Windows => {
                // Windows权限检查
                let output = Command::new("net")
                    .args(&["session"])
                    .output();
                match output {
                    Ok(_) => Ok(true),
                    Err(_) => Ok(false),
                }
            }
        }
    }

    // 备份网卡配置
    pub fn backup_interface(&mut self, interface_name: &str) -> Result<()> {
        let snapshot = match self.platform {
            Platform::MacOS => self.backup_interface_macos(interface_name)?,
            Platform::Linux => self.backup_interface_linux(interface_name)?,
            Platform::Windows => self.backup_interface_windows(interface_name)?,
        };

        self.snapshots.insert(interface_name.to_string(), snapshot);
        Ok(())
    }

    // macOS备份实现
    fn backup_interface_macos(&self, interface_name: &str) -> Result<InterfaceSnapshot> {
        // 获取接口信息
        let ifconfig_output = Command::new("ifconfig")
            .arg(interface_name)
            .output()?;
        
        if !ifconfig_output.status.success() {
            return Err(anyhow!("无法获取网卡 {} 信息", interface_name));
        }

        let config_str = String::from_utf8(ifconfig_output.stdout)?;
        
        // 解析IP地址
        let mut ip_addresses = Vec::new();
        for line in config_str.lines() {
            if line.trim().starts_with("inet ") {
                if let Some(ip_info) = self.parse_macos_inet_line(line) {
                    ip_addresses.push(ip_info);
                }
            }
        }

        // 获取路由信息
        let route_output = Command::new("route")
            .args(&["-n", "get", "default"])
            .output()?;
        
        let routes = if route_output.status.success() {
            self.parse_macos_routes(&String::from_utf8(route_output.stdout)?, interface_name)
        } else {
            Vec::new()
        };

        // 获取MAC地址
        let mac_address = self.extract_mac_from_ifconfig(&config_str);

        // 检查接口状态
        let is_up = config_str.contains("UP,");

        Ok(InterfaceSnapshot {
            name: interface_name.to_string(),
            ip_addresses,
            routes,
            mac_address,
            is_up,
            is_isolated: false,
        })
    }

    // Linux备份实现
    fn backup_interface_linux(&self, interface_name: &str) -> Result<InterfaceSnapshot> {
        // 获取IP地址配置
        let ip_output = Command::new("ip")
            .args(&["addr", "show", interface_name])
            .output()?;
        
        if !ip_output.status.success() {
            return Err(anyhow!("无法获取网卡 {} 信息", interface_name));
        }

        let config_str = String::from_utf8(ip_output.stdout)?;
        
        // 解析IP地址
        let ip_addresses = self.parse_linux_ip_addresses(&config_str);

        // 获取路由信息
        let route_output = Command::new("ip")
            .args(&["route", "show", "dev", interface_name])
            .output()?;
        
        let routes = if route_output.status.success() {
            self.parse_linux_routes(&String::from_utf8(route_output.stdout)?, interface_name)
        } else {
            Vec::new()
        };

        // 获取MAC地址
        let mac_address = self.extract_mac_from_ip_output(&config_str);

        // 检查接口状态
        let is_up = config_str.contains("state UP");

        Ok(InterfaceSnapshot {
            name: interface_name.to_string(),
            ip_addresses,
            routes,
            mac_address,
            is_up,
            is_isolated: false,
        })
    }

    // Windows备份实现
    fn backup_interface_windows(&self, interface_name: &str) -> Result<InterfaceSnapshot> {
        // 获取网卡配置
        let output = Command::new("netsh")
            .args(&["interface", "ip", "show", "config", interface_name])
            .output()?;
        
        if !output.status.success() {
            return Err(anyhow!("无法获取网卡 {} 信息", interface_name));
        }

        let config_str = String::from_utf8_lossy(&output.stdout);
        
        // 解析配置信息
        let ip_addresses = self.parse_windows_config(&config_str);
        let routes = Vec::new(); // Windows路由解析较复杂，暂时留空

        Ok(InterfaceSnapshot {
            name: interface_name.to_string(),
            ip_addresses,
            routes,
            mac_address: None,
            is_up: true,
            is_isolated: false,
        })
    }

    // 隔离网卡（移除IP配置）
    pub fn isolate_interface(&mut self, interface_name: &str) -> Result<()> {
        // 开发模式：模拟网卡隔离
        if cfg!(debug_assertions) {
            println!("[开发模式] 模拟隔离网卡: {}", interface_name);
            
            // 创建一个模拟的快照
            let mock_snapshot = InterfaceSnapshot {
                name: interface_name.to_string(),
                ip_addresses: vec![IpConfig {
                    address: "192.168.1.100".to_string(),
                    netmask: "255.255.255.0".to_string(),
                    gateway: Some("192.168.1.1".to_string()),
                }],
                routes: vec![],
                mac_address: Some("00:11:22:33:44:55".to_string()),
                is_up: true,
                is_isolated: true,
            };
            
            self.snapshots.insert(interface_name.to_string(), mock_snapshot);
            println!("[开发模式] 网卡 {} 隔离模拟完成", interface_name);
            return Ok(());
        }
        
        // 先备份当前配置
        if !self.snapshots.contains_key(interface_name) {
            self.backup_interface(interface_name)?;
        }

        // 执行隔离操作
        match self.platform {
            Platform::MacOS => self.isolate_interface_macos(interface_name)?,
            Platform::Linux => self.isolate_interface_linux(interface_name)?,
            Platform::Windows => self.isolate_interface_windows(interface_name)?,
        }

        // 更新隔离状态
        if let Some(snapshot) = self.snapshots.get_mut(interface_name) {
            snapshot.is_isolated = true;
        }

        Ok(())
    }

    // macOS隔离实现
    fn isolate_interface_macos(&self, interface_name: &str) -> Result<()> {
        // 移除所有IP地址
        let snapshot = self.snapshots.get(interface_name)
            .ok_or_else(|| anyhow!("未找到网卡备份信息"))?;

        for ip_config in &snapshot.ip_addresses {
            let output = Command::new("sudo")
                .args(&["ifconfig", interface_name, "inet", &ip_config.address, "delete"])
                .output()?;
            
            if !output.status.success() {
                eprintln!("删除IP {} 失败: {}", ip_config.address, 
                         String::from_utf8_lossy(&output.stderr));
            }
        }

        // 设置混杂模式（如果需要）
        let _output = Command::new("sudo")
            .args(&["ifconfig", interface_name, "promisc"])
            .output()?;

        Ok(())
    }

    // Linux隔离实现
    fn isolate_interface_linux(&self, interface_name: &str) -> Result<()> {
        // 清空IP地址
        let output = Command::new("sudo")
            .args(&["ip", "addr", "flush", "dev", interface_name])
            .output()?;

        if !output.status.success() {
            return Err(anyhow!("清空网卡IP地址失败: {}", 
                             String::from_utf8_lossy(&output.stderr)));
        }

        // 设置混杂模式
        let _output = Command::new("sudo")
            .args(&["ip", "link", "set", interface_name, "promisc", "on"])
            .output()?;

        Ok(())
    }

    // Windows隔离实现
    fn isolate_interface_windows(&self, interface_name: &str) -> Result<()> {
        // 设置为无效IP
        let output = Command::new("netsh")
            .args(&["interface", "ip", "set", "address", interface_name, 
                   "static", "0.0.0.0", "255.255.255.255"])
            .output()?;

        if !output.status.success() {
            return Err(anyhow!("设置网卡隔离失败: {}", 
                             String::from_utf8_lossy(&output.stderr)));
        }

        Ok(())
    }

    // 恢复网卡配置
    pub fn restore_interface(&mut self, interface_name: &str) -> Result<()> {
        // 开发模式：模拟网卡恢复
        if cfg!(debug_assertions) {
            println!("[开发模式] 模拟恢复网卡: {}", interface_name);
            
            if let Some(snapshot) = self.snapshots.get_mut(interface_name) {
                snapshot.is_isolated = false;
                println!("[开发模式] 网卡 {} 恢复模拟完成", interface_name);
            } else {
                println!("[开发模式] 警告：未找到网卡 {} 的备份配置，但在开发模式下继续", interface_name);
            }
            return Ok(());
        }
        
        let snapshot = self.snapshots.get(interface_name)
            .ok_or_else(|| anyhow!("未找到网卡 {} 的备份配置", interface_name))?
            .clone();

        if !snapshot.is_isolated {
            return Ok(()); // 已经是正常状态
        }

        match self.platform {
            Platform::MacOS => self.restore_interface_macos(&snapshot)?,
            Platform::Linux => self.restore_interface_linux(&snapshot)?,
            Platform::Windows => self.restore_interface_windows(&snapshot)?,
        }

        // 更新状态
        if let Some(snapshot_mut) = self.snapshots.get_mut(interface_name) {
            snapshot_mut.is_isolated = false;
        }

        Ok(())
    }

    // macOS恢复实现
    fn restore_interface_macos(&self, snapshot: &InterfaceSnapshot) -> Result<()> {
        // 恢复IP配置
        for ip_config in &snapshot.ip_addresses {
            let args = vec![
                "ifconfig", &snapshot.name, "inet", 
                &ip_config.address, "netmask", &ip_config.netmask
            ];

            let output = Command::new("sudo")
                .args(&args)
                .output()?;

            if !output.status.success() {
                eprintln!("恢复IP {} 失败: {}", ip_config.address, 
                         String::from_utf8_lossy(&output.stderr));
            }
        }

        // 取消混杂模式
        let _output = Command::new("sudo")
            .args(&["ifconfig", &snapshot.name, "-promisc"])
            .output()?;

        Ok(())
    }

    // Linux恢复实现
    fn restore_interface_linux(&self, snapshot: &InterfaceSnapshot) -> Result<()> {
        // 恢复IP配置
        for ip_config in &snapshot.ip_addresses {
            let ip_with_mask = format!("{}/{}", ip_config.address, 
                                     self.netmask_to_cidr(&ip_config.netmask));
            
            let output = Command::new("sudo")
                .args(&["ip", "addr", "add", &ip_with_mask, "dev", &snapshot.name])
                .output()?;

            if !output.status.success() {
                eprintln!("恢复IP {} 失败: {}", ip_config.address, 
                         String::from_utf8_lossy(&output.stderr));
            }
        }

        // 恢复路由
        for route in &snapshot.routes {
            let output = Command::new("sudo")
                .args(&["ip", "route", "add", &route.destination, 
                       "via", &route.gateway, "dev", &snapshot.name])
                .output()?;

            if !output.status.success() {
                eprintln!("恢复路由 {} 失败: {}", route.destination, 
                         String::from_utf8_lossy(&output.stderr));
            }
        }

        // 取消混杂模式
        let _output = Command::new("sudo")
            .args(&["ip", "link", "set", &snapshot.name, "promisc", "off"])
            .output()?;

        Ok(())
    }

    // Windows恢复实现
    fn restore_interface_windows(&self, snapshot: &InterfaceSnapshot) -> Result<()> {
        // 恢复第一个IP配置（Windows通常一个接口一个IP）
        if let Some(ip_config) = snapshot.ip_addresses.first() {
            let mut args = vec![
                "interface", "ip", "set", "address", &snapshot.name,
                "static", &ip_config.address, &ip_config.netmask
            ];

            if let Some(gateway) = &ip_config.gateway {
                args.push(gateway);
            }

            let output = Command::new("netsh")
                .args(&args)
                .output()?;

            if !output.status.success() {
                return Err(anyhow!("恢复网卡配置失败: {}", 
                                 String::from_utf8_lossy(&output.stderr)));
            }
        }

        Ok(())
    }

    // 获取网卡隔离状态
    pub fn is_isolated(&self, interface_name: &str) -> bool {
        self.snapshots.get(interface_name)
            .map(|s| s.is_isolated)
            .unwrap_or(false)
    }

    // 清理指定网卡的备份
    pub fn cleanup_interface(&mut self, interface_name: &str) {
        self.snapshots.remove(interface_name);
    }

    // 辅助方法：解析配置信息
    fn parse_macos_inet_line(&self, line: &str) -> Option<IpConfig> {
        let parts: Vec<&str> = line.split_whitespace().collect();
        if parts.len() >= 4 && parts[0] == "inet" {
            Some(IpConfig {
                address: parts[1].to_string(),
                netmask: parts[3].to_string(),
                gateway: None,
            })
        } else {
            None
        }
    }

    fn parse_macos_routes(&self, _route_output: &str, _interface_name: &str) -> Vec<RouteConfig> {
        // macOS路由解析实现
        Vec::new() // 简化实现
    }

    fn parse_linux_ip_addresses(&self, output: &str) -> Vec<IpConfig> {
        let mut ip_addresses = Vec::new();
        
        for line in output.lines() {
            if line.trim().starts_with("inet ") {
                let parts: Vec<&str> = line.split_whitespace().collect();
                if parts.len() >= 2 {
                    let ip_with_cidr = parts[1];
                    if let Some(slash_pos) = ip_with_cidr.find('/') {
                        let ip = &ip_with_cidr[..slash_pos];
                        let cidr = &ip_with_cidr[slash_pos + 1..];
                        if let Ok(cidr_num) = cidr.parse::<u8>() {
                            ip_addresses.push(IpConfig {
                                address: ip.to_string(),
                                netmask: self.cidr_to_netmask(cidr_num),
                                gateway: None,
                            });
                        }
                    }
                }
            }
        }
        
        ip_addresses
    }

    fn parse_linux_routes(&self, _route_output: &str, _interface_name: &str) -> Vec<RouteConfig> {
        // Linux路由解析实现
        Vec::new() // 简化实现
    }

    fn parse_windows_config(&self, _config_str: &str) -> Vec<IpConfig> {
        // Windows配置解析实现
        Vec::new() // 简化实现
    }

    fn extract_mac_from_ifconfig(&self, config_str: &str) -> Option<String> {
        for line in config_str.lines() {
            if line.contains("ether ") {
                let parts: Vec<&str> = line.split_whitespace().collect();
                for (i, part) in parts.iter().enumerate() {
                    if *part == "ether" && i + 1 < parts.len() {
                        return Some(parts[i + 1].to_string());
                    }
                }
            }
        }
        None
    }

    fn extract_mac_from_ip_output(&self, config_str: &str) -> Option<String> {
        for line in config_str.lines() {
            if line.contains("link/ether") {
                let parts: Vec<&str> = line.split_whitespace().collect();
                for (i, part) in parts.iter().enumerate() {
                    if *part == "link/ether" && i + 1 < parts.len() {
                        return Some(parts[i + 1].to_string());
                    }
                }
            }
        }
        None
    }

    fn netmask_to_cidr(&self, netmask: &str) -> u8 {
        // 简化实现：将子网掩码转换为CIDR表示法
        match netmask {
            "255.255.255.0" => 24,
            "255.255.0.0" => 16,
            "255.0.0.0" => 8,
            "255.255.255.255" => 32,
            _ => 24, // 默认值
        }
    }

    fn cidr_to_netmask(&self, cidr: u8) -> String {
        // 简化实现：将CIDR转换为子网掩码
        match cidr {
            24 => "255.255.255.0".to_string(),
            16 => "255.255.0.0".to_string(),
            8 => "255.0.0.0".to_string(),
            32 => "255.255.255.255".to_string(),
            _ => "255.255.255.0".to_string(), // 默认值
        }
    }
}