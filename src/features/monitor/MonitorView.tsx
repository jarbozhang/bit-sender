import { useState, useEffect, useRef } from "react";
import { api, type TestResult, type MonitorStats } from "../../lib/api";
import { useNetwork } from "../../contexts/network";

function Stat({ k, v, accent }: { k: string; v: string; accent?: string }) {
  return (
    <div className="bg-gradient-to-b from-panel-2 to-panel border border-line rounded p-3">
      <div className="text-[9px] uppercase tracking-[0.1em] text-dim">{k}</div>
      <div className={`font-mono font-semibold text-[20px] mt-0.5 ${accent ?? "text-txt"}`}>{v}</div>
    </div>
  );
}

export function MonitorView() {
  const { selected } = useNetwork();
  const [testType, setTestType] = useState<"ping" | "arp">("ping");
  const [targetIp, setTargetIp] = useState("192.168.1.1");
  const [intervalMs, setIntervalMs] = useState(1000);
  const [timeoutMs, setTimeoutMs] = useState(2000);
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<TestResult[]>([]);
  const [stats, setStats] = useState<MonitorStats | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    if (!running) return;
    timer.current = window.setInterval(async () => {
      setResults(await api.monitorResults(100));
      setStats(await api.monitorStats());
    }, 500);
    return () => {
      if (timer.current) window.clearInterval(timer.current);
    };
  }, [running]);

  const start = async () => {
    if (!selected) {
      setErr("请先选择网卡");
      return;
    }
    try {
      await api.startMonitor(selected.name, {
        test_type: testType,
        target_ip: targetIp,
        interval_ms: intervalMs,
        timeout_ms: timeoutMs,
        count: 0,
      });
      setResults([]);
      setStats(null);
      setRunning(true);
      setErr(null);
    } catch (e) {
      setErr(String(e));
    }
  };
  const stop = async () => {
    try {
      await api.stopMonitor();
    } finally {
      setRunning(false);
    }
  };

  const loss = stats && stats.total > 0 ? ((stats.timeout / stats.total) * 100).toFixed(0) : "0";

  return (
    <div className="boot">
      <div className="flex items-center gap-3 mb-4">
        <h1 className="font-display font-semibold text-[15px] tracking-[0.16em] uppercase">Response Monitor</h1>
        <span className="font-mono text-[11px] text-faint tracking-wide">// 响应监控 · RTT 探测</span>
        <span className="flex-1 h-px" style={{ background: "repeating-linear-gradient(90deg,#1b2a33 0 6px,transparent 6px 12px)" }} />
      </div>

      {err && <div className="mb-3 font-mono text-[11px] text-signalred">✕ {err}</div>}

      {/* 配置 */}
      <div className="flex flex-wrap items-end gap-3 mb-4 bg-gradient-to-b from-panel-2 to-panel border border-line rounded p-3.5">
        <div>
          <label className="block text-[10px] uppercase tracking-wide text-dim mb-1">类型</label>
          <div className="flex gap-1.5">
            {(["ping", "arp"] as const).map((t) => (
              <button key={t} onClick={() => setTestType(t)} disabled={running} className={`font-mono text-[11px] px-3 py-1.5 rounded border transition ${testType === t ? "text-amber border-amber-dim bg-amber/10" : "text-dim border-line-bright"}`}>{t.toUpperCase()}</button>
            ))}
          </div>
        </div>
        <div className="flex-1 min-w-[160px]">
          <label className="block text-[10px] uppercase tracking-wide text-dim mb-1">目标 IP</label>
          <input value={targetIp} onChange={(e) => setTargetIp(e.target.value)} disabled={running} className="w-full font-mono text-[12px] text-txt bg-bg border border-line-bright rounded px-2.5 py-1.5 outline-none focus:border-amber" />
        </div>
        <div>
          <label className="block text-[10px] uppercase tracking-wide text-dim mb-1">间隔 ms</label>
          <input type="number" value={intervalMs} onChange={(e) => setIntervalMs(Math.max(100, Number(e.target.value)))} disabled={running} className="w-24 font-mono text-[12px] text-txt bg-bg border border-line-bright rounded px-2.5 py-1.5 outline-none focus:border-amber" />
        </div>
        <div>
          <label className="block text-[10px] uppercase tracking-wide text-dim mb-1">超时 ms</label>
          <input type="number" value={timeoutMs} onChange={(e) => setTimeoutMs(Math.max(100, Number(e.target.value)))} disabled={running} className="w-24 font-mono text-[12px] text-txt bg-bg border border-line-bright rounded px-2.5 py-1.5 outline-none focus:border-amber" />
        </div>
        {running ? (
          <button onClick={stop} className="font-display text-xs uppercase tracking-wide px-4 py-2 rounded border border-signalred/50 text-signalred bg-signalred/10 hover:bg-signalred/20 transition">停止</button>
        ) : (
          <button onClick={start} className="font-display text-xs uppercase tracking-wide px-4 py-2 rounded border border-amber-dim text-amber bg-amber/10 hover:bg-amber/20 hover:shadow-glow-amber transition">开始监控</button>
        )}
      </div>

      {/* 统计 */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-2.5 mb-4">
        <Stat k="发送" v={(stats?.total ?? 0).toString()} />
        <Stat k="成功" v={(stats?.success ?? 0).toString()} accent="text-signalgreen" />
        <Stat k="丢失率" v={`${loss}%`} accent="text-signalred" />
        <Stat k="平均 RTT" v={stats?.success ? `${stats.avg_rtt_ms.toFixed(2)}ms` : "—"} accent="text-amber" />
        <Stat k="最小/最大" v={stats?.success ? `${stats.min_rtt_ms.toFixed(1)}/${stats.max_rtt_ms.toFixed(1)}` : "—"} accent="text-cyan" />
      </div>

      {/* 结果列表 */}
      <div className="border border-line rounded overflow-hidden">
        <div className="grid grid-cols-[80px_1fr_120px_1fr] bg-elevated border-b border-line-bright text-[9px] uppercase tracking-wide text-dim">
          {["Seq", "Status", "RTT", "Time"].map((h) => (<div key={h} className="px-3 py-2">{h}</div>))}
        </div>
        <div className="max-h-[380px] overflow-y-auto">
          {results.length === 0 ? (
            <div className="px-4 py-10 text-center font-mono text-xs text-faint">{running ? "等待响应…" : "配置目标后开始监控"}</div>
          ) : (
            results.map((r) => (
              <div key={r.id} className="grid grid-cols-[80px_1fr_120px_1fr] border-b border-line font-mono text-[11px] hover:bg-panel-2">
                <div className="px-3 py-1.5 text-faint">#{r.seq}</div>
                <div className={`px-3 py-1.5 ${r.status === "success" ? "text-signalgreen" : "text-signalred"}`}>{r.status === "success" ? "● 成功" : "✕ 超时"}</div>
                <div className="px-3 py-1.5 text-amber">{r.rtt_ms != null ? `${r.rtt_ms.toFixed(2)} ms` : "—"}</div>
                <div className="px-3 py-1.5 text-dim">{new Date(r.timestamp_ms).toLocaleTimeString()}</div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
