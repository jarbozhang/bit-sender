import { useState, useEffect, useRef } from "react";
import { api, type PacketSpec, type BatchStatus } from "../../lib/api";

type Phase = "setup" | "running" | "done";
type StopCondition = "manual" | "duration" | "count";

interface Props {
  visible: boolean;
  onClose: () => void;
  spec: PacketSpec;
  interfaceName: string | null;
}

export function BatchDialog({ visible, onClose, spec, interfaceName }: Props) {
  const [phase, setPhase] = useState<Phase>("setup");
  const [frequency, setFrequency] = useState(1000);
  const [stopCondition, setStopCondition] = useState<StopCondition>("manual");
  const [stopValue, setStopValue] = useState(10000);
  const [taskId, setTaskId] = useState<string | null>(null);
  const [status, setStatus] = useState<BatchStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<number | null>(null);

  // 关闭时复位
  useEffect(() => {
    if (!visible) {
      if (timer.current) window.clearInterval(timer.current);
      setPhase("setup");
      setTaskId(null);
      setStatus(null);
      setError(null);
    }
  }, [visible]);

  useEffect(() => {
    return () => {
      if (timer.current) window.clearInterval(timer.current);
    };
  }, []);

  if (!visible) return null;

  const start = async () => {
    if (!interfaceName) {
      setError("请先选择网卡");
      return;
    }
    setError(null);
    try {
      const id = await api.startBatch(spec, interfaceName, frequency, stopCondition, stopValue);
      setTaskId(id);
      setPhase("running");
      timer.current = window.setInterval(async () => {
        const s = await api.batchStatus(id);
        if (s) {
          setStatus(s);
          if (s.completed || !s.running) {
            if (timer.current) window.clearInterval(timer.current);
            setPhase("done");
          }
        }
      }, 400);
    } catch (e) {
      setError(String(e));
    }
  };

  const stop = async () => {
    if (taskId) await api.stopBatch(taskId);
    if (timer.current) window.clearInterval(timer.current);
    setPhase("done");
  };

  const progressPct =
    status && stopCondition === "count" && stopValue > 0
      ? Math.min(100, (status.sent_count / stopValue) * 100)
      : null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={(e) => e.target === e.currentTarget && phase !== "running" && onClose()}>
      <div className="bg-gradient-to-b from-panel-2 to-panel border border-line-bright rounded w-[440px] p-5 shadow-2xl">
        <div className="flex items-center gap-2.5 mb-4">
          <span className="font-display text-sm tracking-[0.16em] text-amber" style={{ textShadow: "0 0 12px rgba(255,178,36,.4)" }}>
            ◈ BATCH SEND
          </span>
          <span className="font-mono text-[10px] text-faint ml-auto">{interfaceName ?? "未选网卡"}</span>
        </div>

        {error && <div className="mb-3 font-mono text-[11px] text-signalred">✕ {error}</div>}

        {phase === "setup" && (
          <div className="space-y-3.5">
            <div>
              <label className="block text-[10px] uppercase tracking-wide text-dim mb-1.5">发送频率</label>
              <div className="flex items-center border border-line-bright rounded overflow-hidden">
                <input
                  type="number"
                  min={1}
                  value={frequency}
                  onChange={(e) => setFrequency(Math.max(1, Number(e.target.value)))}
                  className="flex-1 font-mono text-[13px] text-amber bg-bg px-3 py-2 outline-none"
                />
                <span className="font-mono text-[10px] text-dim px-3 self-stretch grid place-items-center bg-elevated">pkt/s</span>
              </div>
            </div>
            <div>
              <label className="block text-[10px] uppercase tracking-wide text-dim mb-1.5">终止条件</label>
              <div className="grid grid-cols-3 gap-1.5">
                {(["manual", "duration", "count"] as StopCondition[]).map((c) => (
                  <button
                    key={c}
                    onClick={() => setStopCondition(c)}
                    className={`font-mono text-[11px] py-1.5 rounded border transition ${stopCondition === c ? "text-amber border-amber-dim bg-amber/10" : "text-dim border-line-bright hover:text-txt"}`}
                  >
                    {c === "manual" ? "手动" : c === "duration" ? "时长(s)" : "数量"}
                  </button>
                ))}
              </div>
            </div>
            {stopCondition !== "manual" && (
              <div>
                <label className="block text-[10px] uppercase tracking-wide text-dim mb-1.5">
                  {stopCondition === "duration" ? "发送时长（秒）" : "发送数量（包）"}
                </label>
                <input
                  type="number"
                  min={1}
                  value={stopValue}
                  onChange={(e) => setStopValue(Math.max(1, Number(e.target.value)))}
                  className="w-full font-mono text-[13px] text-txt bg-bg border border-line-bright rounded px-3 py-2 outline-none focus:border-amber"
                />
              </div>
            )}
            <div className="flex justify-end gap-2 pt-1">
              <button onClick={onClose} className="font-ui text-xs px-4 py-2 rounded border border-line-bright text-dim hover:text-txt">取消</button>
              <button onClick={start} className="font-display text-xs tracking-wide uppercase px-4 py-2 rounded border border-amber-dim text-amber bg-amber/10 hover:bg-amber/20 hover:shadow-glow-amber transition">开始发送</button>
            </div>
          </div>
        )}

        {(phase === "running" || phase === "done") && (
          <div className="space-y-3 font-mono text-[12px]">
            <div className="flex justify-between"><span className="text-dim">状态</span><span className={phase === "running" ? "text-amber" : "text-signalgreen"}>{phase === "running" ? "⚡ 发送中" : "✓ 已结束"}</span></div>
            <div className="flex justify-between"><span className="text-dim">已发送</span><span className="text-cyan font-semibold">{(status?.sent_count ?? 0).toLocaleString()}</span></div>
            <div className="flex justify-between"><span className="text-dim">目标速率</span><span className="text-txt">{(status?.target_speed ?? frequency).toLocaleString()} pkt/s</span></div>
            {progressPct !== null && (
              <div className="w-full bg-elevated rounded-full h-1.5 overflow-hidden">
                <div className="bg-amber h-full transition-all" style={{ width: `${progressPct}%`, boxShadow: "0 0 8px rgba(255,178,36,.5)" }} />
              </div>
            )}
            <div className="flex justify-end gap-2 pt-2">
              {phase === "running" ? (
                <button onClick={stop} className="font-display text-xs tracking-wide uppercase px-4 py-2 rounded border border-signalred/50 text-signalred bg-signalred/10 hover:bg-signalred/20 transition">停止</button>
              ) : (
                <button onClick={onClose} className="font-ui text-xs px-4 py-2 rounded border border-line-bright text-dim hover:text-txt">关闭</button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
