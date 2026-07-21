//! v2 发送引擎：批量发送（M3）。
//!
//! 相对 v1 的修复：
//!   • count 终止精确不超发——worker 用原子 `attempts` 预占序号，越界回退，不再"先检查后发"竞态；
//!   • 启动即验证 spec 可构建 + 网卡可打开，失败立即返回 Err（v1 在 worker 里静默置 running=false）；
//!   • 任务结束/停止后从注册表移除句柄（v1 句柄永不清理，无限增长）；
//!   • 移除网卡隔离（v2 砍掉该危险功能）。

use super::net::PacketSender;
use super::protocol::PacketSpec;
use serde::Serialize;
use specta::Type;
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

#[derive(Debug, Clone, Serialize, Type)]
pub struct BatchStatus {
    pub task_id: String,
    pub start_time: u64,
    pub sent_count: u64,
    pub target_speed: u32,
    pub running: bool,
    pub completed: bool,
}

struct BatchHandle {
    status: Arc<Mutex<BatchStatus>>,
    running: Arc<AtomicBool>,
}

/// 批量任务注册表，作为 Tauri 托管状态。
#[derive(Default)]
pub struct BatchRegistry {
    map: Mutex<HashMap<String, BatchHandle>>,
}

impl BatchRegistry {
    pub fn status(&self, id: &str) -> Option<BatchStatus> {
        self.map
            .lock()
            .unwrap()
            .get(id)
            .map(|h| h.status.lock().unwrap().clone())
    }

    /// 通知任务停止。任务的收尾线程会把句柄从表中移除。
    pub fn stop(&self, id: &str) -> bool {
        let m = self.map.lock().unwrap();
        if let Some(h) = m.get(id) {
            h.running.store(false, Ordering::Relaxed);
            true
        } else {
            false
        }
    }

    fn insert(&self, id: String, h: BatchHandle) {
        self.map.lock().unwrap().insert(id, h);
    }

    fn remove(&self, id: &str) {
        self.map.lock().unwrap().remove(id);
    }
}

fn now_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

/// 启动批量发送。`registry` 用 Arc 以便交给收尾线程做自清理。
pub fn start_batch(
    registry: Arc<BatchRegistry>,
    spec: PacketSpec,
    interface_name: String,
    frequency: u32,
    stop_condition: String,
    stop_value: u32,
) -> Result<String, String> {
    let task_id = uuid::Uuid::new_v4().to_string();
    // 启动即验证：spec 可构建 + 网卡可打开，失败立即上报（修 v1 静默失败）。
    // 只打开一个句柄，交所有 worker 共享——Windows/Npcap 下并发对同一网卡多次 open
    // 会失败，且任一 worker open 失败会置 running=false 拖垮全部 worker（表现为无包无动画）。
    let bytes = Arc::new(spec.build().map_err(|e| e.to_string())?);
    let sender = Arc::new(Mutex::new(PacketSender::open(&interface_name)?));

    let running = Arc::new(AtomicBool::new(true));
    let sent = Arc::new(AtomicU64::new(0));
    let attempts = Arc::new(AtomicU64::new(0));
    let status = Arc::new(Mutex::new(BatchStatus {
        task_id: task_id.clone(),
        start_time: now_secs(),
        sent_count: 0,
        target_speed: frequency,
        running: true,
        completed: false,
    }));

    let thread_count: u64 = match frequency {
        1..=100 => 1,
        101..=1000 => 2,
        1001..=10000 => 4,
        _ => 8,
    };
    let stop_count = (stop_condition == "count").then_some(stop_value as u64);
    let stop_dur = (stop_condition == "duration").then(|| Duration::from_secs(stop_value as u64));

    // 统计同步线程：周期性把原子计数刷进 status。
    {
        let status = status.clone();
        let sent = sent.clone();
        let running = running.clone();
        std::thread::spawn(move || {
            while running.load(Ordering::Relaxed) {
                status.lock().unwrap().sent_count = sent.load(Ordering::Relaxed);
                std::thread::sleep(Duration::from_millis(100));
            }
        });
    }

    let task_start = Instant::now();
    let mut workers = Vec::new();
    for tid in 0..thread_count {
        let running = running.clone();
        let sent = sent.clone();
        let attempts = attempts.clone();
        let bytes = bytes.clone();
        let sender = sender.clone();
        workers.push(std::thread::spawn(move || {
            let interval =
                Duration::from_micros((1_000_000 * thread_count) / frequency.max(1) as u64);
            // 错峰：每个 worker 起始相位偏移，避免同时发。
            let offset = Duration::from_micros(
                interval.as_micros() as u64 * tid / thread_count,
            );
            let mut next = Instant::now() + offset;

            while running.load(Ordering::Relaxed) {
                if let Some(d) = stop_dur {
                    if task_start.elapsed() >= d {
                        running.store(false, Ordering::Relaxed);
                        break;
                    }
                }
                let now = Instant::now();
                if now < next {
                    std::thread::sleep((next - now).min(Duration::from_millis(1)));
                    continue;
                }
                // count 模式：原子预占，越界回退——保证总发送精确不超过 target。
                if let Some(target) = stop_count {
                    let a = attempts.fetch_add(1, Ordering::Relaxed);
                    if a >= target {
                        attempts.fetch_sub(1, Ordering::Relaxed);
                        running.store(false, Ordering::Relaxed);
                        break;
                    }
                }
                // 锁在语句结束即释放，避免持锁 sleep 阻塞其它 worker。
                let result = sender.lock().unwrap().send(&bytes);
                match result {
                    Ok(_) => {
                        sent.fetch_add(1, Ordering::Relaxed);
                    }
                    Err(_) => {
                        std::thread::sleep(Duration::from_micros(100));
                    }
                }
                next += interval;
                if next < now {
                    next = now + interval;
                }
            }
        }));
    }

    // 收尾线程：等所有 worker 结束 → 标记 completed → 从注册表移除句柄（自清理）。
    {
        let registry = registry.clone();
        let status = status.clone();
        let sent = sent.clone();
        let running = running.clone();
        let task_id = task_id.clone();
        std::thread::spawn(move || {
            for w in workers {
                let _ = w.join();
            }
            running.store(false, Ordering::Relaxed);
            {
                let mut s = status.lock().unwrap();
                s.running = false;
                s.completed = true;
                s.sent_count = sent.load(Ordering::Relaxed);
            }
            // 给前端一个窗口拉取最终状态后再移除。
            std::thread::sleep(Duration::from_secs(2));
            registry.remove(&task_id);
        });
    }

    registry.insert(task_id.clone(), BatchHandle { status, running });
    Ok(task_id)
}
