//! v2 Tauri 命令。
//!
//! 命令直接收强类型 `PacketSpec`（serde 按 `protocol` 标签派发），不再手写 JSON 解析。
//! `#[specta::specta]` 让 tauri-specta 能把签名导出为类型安全的 TS 绑定：前端若把
//! 数值字段写成字符串、拼错字段名或漏填，TS 编译即失败。

use super::capture::{CaptureState, CaptureStats, CapturedPacket};
use super::net::{self, InterfaceInfo, PacketSender};
use super::protocol::PacketSpec;
use super::sender::{BatchRegistry, BatchStatus};
use serde::Serialize;
use specta::Type;
use std::sync::Arc;
use tauri::State;

/// 单发结果：发出的字节数 + 出口网卡名。
#[derive(Debug, Serialize, Type)]
pub struct SendReport {
    pub bytes: usize,
    pub interface: String,
}

/// 构建完整以太网帧并返回大写 hex 预览。
///
/// 按 `spec.protocol` 派发到对应协议 builder；任何字段解析失败返回 `Err(String)`。
///
/// 命名注：v1 在 `lib.rs` 已注册了一个收 `serde_json::Value` 的 `build_packet_preview`，
/// 两者 Tauri 命令名不能撞，故 v2 注册为 `build_packet_preview_v2`（v1 不动，只增不减）。
/// M1 重写完成、前端切到强类型后，旧命令会随 v1 一并退役。
#[tauri::command]
#[specta::specta]
pub fn build_packet_preview_v2(spec: PacketSpec) -> Result<String, String> {
    let bytes = spec.build().map_err(|e| e.to_string())?;
    Ok(bytes.iter().map(|b| format!("{:02X}", b)).collect())
}

/// 枚举本机网卡（v2）。
#[tauri::command]
#[specta::specta]
pub fn list_interfaces_v2() -> Result<Vec<InterfaceInfo>, String> {
    net::list_interfaces()
}

/// 单发：构建强类型 spec 为完整帧，经指定网卡用 pcap 发出。
#[tauri::command]
#[specta::specta]
pub fn send_packet_v2(spec: PacketSpec, interface_name: String) -> Result<SendReport, String> {
    let bytes = spec.build().map_err(|e| e.to_string())?;
    let mut sender = PacketSender::open(&interface_name)?;
    sender.send(&bytes)?;
    Ok(SendReport {
        bytes: bytes.len(),
        interface: interface_name,
    })
}

/// 启动批量发送（v2）。stop_condition: "manual"|"duration"|"count"，stop_value 为秒数或包数。
#[tauri::command]
#[specta::specta]
pub fn start_batch_send_v2(
    spec: PacketSpec,
    interface_name: String,
    frequency: u32,
    stop_condition: String,
    stop_value: u32,
    registry: State<'_, Arc<BatchRegistry>>,
) -> Result<String, String> {
    super::sender::start_batch(
        registry.inner().clone(),
        spec,
        interface_name,
        frequency,
        stop_condition,
        stop_value,
    )
}

/// 查询批量任务状态。
#[tauri::command]
#[specta::specta]
pub fn get_batch_status_v2(
    task_id: String,
    registry: State<'_, Arc<BatchRegistry>>,
) -> Option<BatchStatus> {
    registry.status(&task_id)
}

/// 停止批量任务。
#[tauri::command]
#[specta::specta]
pub fn stop_batch_send_v2(task_id: String, registry: State<'_, Arc<BatchRegistry>>) -> bool {
    registry.stop(&task_id)
}

/// 启动网口嗅探（v2）。启动即验证网卡可打开，失败 Err；幂等：已在跑先停。
/// 统计经 `capture://stats` event 每 250ms 主动推送，包列表用 `get_captured_packets_v2` 拉取。
#[tauri::command]
#[specta::specta]
pub fn start_capture_v2(
    interface_name: String,
    app: tauri::AppHandle,
    state: State<'_, Arc<CaptureState>>,
) -> Result<(), String> {
    state.start(interface_name, app)
}

/// 停止网口嗅探（v2）。
#[tauri::command]
#[specta::specta]
pub fn stop_capture_v2(state: State<'_, Arc<CaptureState>>) -> Result<(), String> {
    state.stop()
}

/// 查询当前捕获统计快照（v2）。无捕获时返回零值快照。
#[tauri::command]
#[specta::specta]
pub fn get_capture_stats_v2(state: State<'_, Arc<CaptureState>>) -> Option<CaptureStats> {
    state.stats()
}

/// 拉取最新捕获的包（v2，最新在前）。默认 100。
#[tauri::command]
#[specta::specta]
pub fn get_captured_packets_v2(
    max_count: Option<u32>,
    state: State<'_, Arc<CaptureState>>,
) -> Vec<CapturedPacket> {
    state.packets(max_count)
}
