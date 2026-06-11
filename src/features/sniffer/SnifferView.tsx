import { useState, useEffect, useRef } from "react";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { api, type CaptureStats, type CapturedPacket } from "../../lib/api";
import { useNetwork } from "../../contexts/network";
import { useI18n } from "../../contexts/i18n";

const PROTO_BADGE: Record<string, string> = {
  tcp: "text-cyan bg-cyan/10",
  udp: "text-signalgreen bg-signalgreen/10",
  arp: "text-violet bg-violet/15",
  icmp: "text-signalred bg-signalred/10",
};

function Stat({ k, v, accent, sub }: { k: string; v: string; accent?: string; sub?: string }) {
  return (
    <div className="bg-gradient-to-b from-panel-2 to-panel border border-line rounded p-3">
      <div className="text-[9px] uppercase tracking-[0.1em] text-dim">{k}</div>
      <div className={`font-mono font-semibold text-[22px] mt-0.5 ${accent ?? "text-txt"}`}>{v}</div>
      {sub && <div className="font-mono text-[9px] text-faint">{sub}</div>}
    </div>
  );
}

export function SnifferView() {
  const { selected } = useNetwork();
  const { t } = useI18n();
  const [running, setRunning] = useState(false);
  const [stats, setStats] = useState<CaptureStats | null>(null);
  const [packets, setPackets] = useState<CapturedPacket[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const timer = useRef<number | null>(null);

  // 订阅后端主动推送的统计 event（真值，250ms 一次）。
  useEffect(() => {
    let un: UnlistenFn | undefined;
    listen<CaptureStats>("capture://stats", (e) => setStats(e.payload)).then((u) => (un = u));
    return () => un?.();
  }, []);

  // 运行时轮询包列表（按 id 去重累加）。统计与列表是两条独立通道。
  useEffect(() => {
    if (!running) return;
    timer.current = window.setInterval(async () => {
      const fresh = await api.capturedPackets(200);
      if (fresh.length) {
        setPackets((prev) => {
          const seen = new Set(prev.map((p) => p.id));
          const add = fresh.filter((p) => !seen.has(p.id));
          return [...add, ...prev].slice(0, 1000);
        });
      }
    }, 600);
    return () => {
      if (timer.current) window.clearInterval(timer.current);
    };
  }, [running]);

  const start = async () => {
    if (!selected) {
      setErr(t("common.selectNicFirst"));
      return;
    }
    try {
      await api.startCapture(selected.name);
      setPackets([]);
      setStats(null);
      setRunning(true);
      setErr(null);
    } catch (e) {
      setErr(String(e));
    }
  };
  const stop = async () => {
    try {
      await api.stopCapture();
    } finally {
      setRunning(false);
    }
  };

  const s = stats ?? ({} as Partial<CaptureStats>);

  return (
    <div className="boot">
      <div className="flex items-center gap-3 mb-4">
        <h1 className="font-display font-semibold text-[15px] tracking-[0.16em] uppercase">{t("sniffer.title")}</h1>
        <span className="font-mono text-[11px] text-faint tracking-wide">{t("sniffer.subtitle")}</span>
        <span className="flex-1 h-px" style={{ background: "repeating-linear-gradient(90deg,rgb(var(--line)) 0 6px,transparent 6px 12px)" }} />
        {running ? (
          <button onClick={stop} className="font-display text-xs tracking-wide uppercase px-4 py-2 rounded border border-signalred/50 text-signalred bg-signalred/10 hover:bg-signalred/20 transition">{t("common.stop")}</button>
        ) : (
          <button onClick={start} className="font-display text-xs tracking-wide uppercase px-4 py-2 rounded border border-amber-dim text-amber bg-amber/10 hover:bg-amber/20 hover:shadow-glow-amber transition">{t("sniffer.start")}</button>
        )}
      </div>

      {err && <div className="mb-3 font-mono text-[11px] text-signalred">✕ {err}</div>}

      {/* 统计卡片：pps 是真值（最近完整秒），与列表分离 */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-2.5 mb-4">
        <Stat k={t("sniffer.pps")} v={Math.round(s.pps ?? 0).toLocaleString()} accent="text-amber" sub={t("sniffer.ppsSub")} />
        <Stat k={t("sniffer.total")} v={(s.total_packets ?? 0).toLocaleString()} sub={t("sniffer.totalSub")} />
        <Stat k="TCP" v={(s.tcp ?? 0).toLocaleString()} accent="text-cyan" />
        <Stat k="UDP" v={(s.udp ?? 0).toLocaleString()} accent="text-signalgreen" />
        <Stat k="ARP / ICMP" v={`${s.arp ?? 0} / ${s.icmp ?? 0}`} accent="text-violet" />
      </div>

      {(s.dropped_for_display ?? 0) > 0 && (
        <div className="mb-3 font-mono text-[10px] text-amber/80">
          {t("sniffer.dropped", { n: (s.dropped_for_display ?? 0).toLocaleString() })}
        </div>
      )}

      {/* 包列表 */}
      <div className="border border-line rounded overflow-hidden">
        <div className="grid grid-cols-[90px_60px_1.4fr_1.4fr_60px_1.6fr] bg-elevated border-b border-line-bright text-[9px] uppercase tracking-wide text-dim">
          {[t("sniffer.colTime"), t("sniffer.colProto"), t("sniffer.colSrc"), t("sniffer.colDst"), t("sniffer.colLen"), t("sniffer.colInfo")].map((h) => (
            <div key={h} className="px-3 py-2">{h}</div>
          ))}
        </div>
        <div className="max-h-[420px] overflow-y-auto">
          {packets.length === 0 ? (
            <div className="px-4 py-10 text-center font-mono text-xs text-faint">{running ? t("sniffer.waiting") : t("sniffer.idle")}</div>
          ) : (
            packets.map((p) => (
              <div key={p.id} className="grid grid-cols-[90px_60px_1.4fr_1.4fr_60px_1.6fr] border-b border-line font-mono text-[11px] hover:bg-panel-2">
                <div className="px-3 py-1.5 text-faint">{new Date(p.timestamp_ms).toLocaleTimeString()}</div>
                <div className="px-3 py-1.5"><span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded ${PROTO_BADGE[p.protocol] ?? "text-dim bg-elevated"}`}>{p.protocol.toUpperCase()}</span></div>
                <div className="px-3 py-1.5 text-txt truncate">{p.src_ip ?? p.src_mac}{p.src_port != null ? `:${p.src_port}` : ""}</div>
                <div className="px-3 py-1.5 text-txt truncate">{p.dst_ip ?? p.dst_mac}{p.dst_port != null ? `:${p.dst_port}` : ""}</div>
                <div className="px-3 py-1.5 text-dim">{p.size}</div>
                <div className="px-3 py-1.5 text-dim truncate">{p.info}</div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
