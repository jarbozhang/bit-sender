//! v2 重写模块（greenfield，逐里程碑替换 v1 的 `network` 模块）。
//!
//! M1 里程碑：协议核心强类型化。`protocol` 子模块每协议一文件，配 golden 测试；
//! 顶层 `PacketSpec` 派发枚举 + `build_packet_preview` 命令。
//! 后续里程碑会在此填入 sender / capture / monitor。

pub mod capture;
pub mod commands;
pub mod monitor;
pub mod net;
pub mod protocol;
pub mod sender;
pub mod sequence;

pub use commands::build_packet_preview_v2;
pub use protocol::PacketSpec;
