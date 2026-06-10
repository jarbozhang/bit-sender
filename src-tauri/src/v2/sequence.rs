//! v2 序列发送引擎（M5）：按序定时发包 + 循环。
//!
//! 相对 v1 的修复：协议名统一走强类型 PacketSpec（v1 用 'eth' 导致静默跳过）；
//! 启动即预构建全部帧并验证，任一非法立即 Err（不静默跳过）；任务自清理。

use super::net::PacketSender;
use super::protocol::PacketSpec;
use serde::{Deserialize, Serialize};
use specta::Type;
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

/// 序列中的一步：一个强类型报文 + 其后的延迟。
#[derive(Debug, Clone, Deserialize, Type)]
pub struct SequenceStep {
    pub spec: PacketSpec,
    pub delay_ms: u64,
}

#[derive(Debug, Clone, Serialize, Type)]
pub struct SequenceStatus {
    pub task_id: String,
    pub current_index: u32,
    pub current_loop: u32,
    pub total_sent: u64,
    pub running: bool,
    pub completed: bool,
}

struct SeqHandle {
    status: Arc<Mutex<SequenceStatus>>,
    running: Arc<AtomicBool>,
}

#[derive(Default)]
pub struct SequenceRegistry {
    map: Mutex<HashMap<String, SeqHandle>>,
}

impl SequenceRegistry {
    pub fn status(&self, id: &str) -> Option<SequenceStatus> {
        self.map.lock().unwrap().get(id).map(|h| h.status.lock().unwrap().clone())
    }
    pub fn stop(&self, id: &str) -> bool {
        let m = self.map.lock().unwrap();
        if let Some(h) = m.get(id) {
            h.running.store(false, Ordering::Relaxed);
            true
        } else {
            false
        }
    }
    fn insert(&self, id: String, h: SeqHandle) {
        self.map.lock().unwrap().insert(id, h);
    }
    fn remove(&self, id: &str) {
        self.map.lock().unwrap().remove(id);
    }
}

/// 启动序列发送。loop_count 为循环轮数（>=1）。
pub fn start_sequence(
    registry: Arc<SequenceRegistry>,
    steps: Vec<SequenceStep>,
    interface_name: String,
    loop_count: u32,
) -> Result<String, String> {
    if steps.is_empty() {
        return Err("序列为空：至少需要一个启用的报文".to_string());
    }
    // 预构建全部帧并验证——任一非法立即上报（不静默跳过，修 v1）。
    let frames: Vec<(Vec<u8>, u64)> = steps
        .iter()
        .map(|s| s.spec.build().map(|b| (b, s.delay_ms)))
        .collect::<Result<_, _>>()
        .map_err(|e| format!("序列中存在非法报文: {e}"))?;
    drop(PacketSender::open(&interface_name)?);

    let task_id = uuid::Uuid::new_v4().to_string();
    let running = Arc::new(AtomicBool::new(true));
    let status = Arc::new(Mutex::new(SequenceStatus {
        task_id: task_id.clone(),
        current_index: 0,
        current_loop: 0,
        total_sent: 0,
        running: true,
        completed: false,
    }));
    let loops = loop_count.max(1);

    {
        let registry = registry.clone();
        let running = running.clone();
        let status = status.clone();
        let task_id = task_id.clone();
        std::thread::spawn(move || {
            let mut sender = match PacketSender::open(&interface_name) {
                Ok(s) => s,
                Err(_) => {
                    let mut st = status.lock().unwrap();
                    st.running = false;
                    st.completed = true;
                    return;
                }
            };
            'outer: for lp in 0..loops {
                {
                    let mut st = status.lock().unwrap();
                    st.current_loop = lp;
                }
                for (i, (frame, delay)) in frames.iter().enumerate() {
                    if !running.load(Ordering::Relaxed) {
                        break 'outer;
                    }
                    {
                        let mut st = status.lock().unwrap();
                        st.current_index = i as u32;
                    }
                    if sender.send(frame).is_ok() {
                        let mut st = status.lock().unwrap();
                        st.total_sent += 1;
                    }
                    if *delay > 0 {
                        std::thread::sleep(Duration::from_millis(*delay));
                    }
                }
            }
            {
                let mut st = status.lock().unwrap();
                st.running = false;
                st.completed = true;
            }
            running.store(false, Ordering::Relaxed);
            std::thread::sleep(Duration::from_secs(2));
            registry.remove(&task_id);
        });
    }

    registry.insert(task_id.clone(), SeqHandle { status, running });
    Ok(task_id)
}
