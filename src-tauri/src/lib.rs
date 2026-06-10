#![allow(non_snake_case)]
// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/

pub mod v2;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .manage(std::sync::Arc::new(v2::sender::BatchRegistry::default()))
        .manage(std::sync::Arc::new(v2::capture::CaptureState::default()))
        .manage(std::sync::Arc::new(v2::monitor::MonitorState::default()))
        .manage(std::sync::Arc::new(v2::sequence::SequenceRegistry::default()))
        .invoke_handler(tauri::generate_handler![
            v2::commands::build_packet_preview_v2,
            v2::commands::list_interfaces_v2,
            v2::commands::send_packet_v2,
            v2::commands::start_batch_send_v2,
            v2::commands::get_batch_status_v2,
            v2::commands::stop_batch_send_v2,
            v2::commands::start_capture_v2,
            v2::commands::stop_capture_v2,
            v2::commands::get_capture_stats_v2,
            v2::commands::get_captured_packets_v2,
            v2::commands::start_monitor_v2,
            v2::commands::stop_monitor_v2,
            v2::commands::get_monitor_results_v2,
            v2::commands::get_monitor_stats_v2,
            v2::commands::start_sequence_v2,
            v2::commands::get_sequence_status_v2,
            v2::commands::stop_sequence_v2
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod specta_export {
    /// 用 tauri-specta 在 `cargo test` 时生成前端 TS 绑定。
    /// 放在测试里，无需启动 GUI 即可在 CI 中产出 `src/api/bindings.ts`。
    #[test]
    fn export_typescript_bindings() {
        let builder = tauri_specta::Builder::<tauri::Wry>::new()
            .commands(tauri_specta::collect_commands![
                crate::v2::commands::build_packet_preview_v2,
                crate::v2::commands::list_interfaces_v2,
                crate::v2::commands::send_packet_v2,
                crate::v2::commands::start_batch_send_v2,
                crate::v2::commands::get_batch_status_v2,
                crate::v2::commands::stop_batch_send_v2,
                crate::v2::commands::start_capture_v2,
                crate::v2::commands::stop_capture_v2,
                crate::v2::commands::get_capture_stats_v2,
                crate::v2::commands::get_captured_packets_v2,
                crate::v2::commands::start_monitor_v2,
                crate::v2::commands::stop_monitor_v2,
                crate::v2::commands::get_monitor_results_v2,
                crate::v2::commands::get_monitor_stats_v2,
                crate::v2::commands::start_sequence_v2,
                crate::v2::commands::get_sequence_status_v2,
                crate::v2::commands::stop_sequence_v2
            ]);
        builder
            .export(
                specta_typescript::Typescript::default()
                    .bigint(specta_typescript::BigIntExportBehavior::Number),
                "../src/api/bindings.ts",
            )
            .expect("导出 TS 绑定失败");
    }
}
