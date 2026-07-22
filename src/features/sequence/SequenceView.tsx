import { useState } from "react";
import { useEditor } from "../../contexts/editor";
import { getProto, buildSpec } from "../../lib/protocols";
import { api, type SequenceStep } from "../../lib/api";
import { useNetwork } from "../../contexts/network";
import { useI18n } from "../../contexts/i18n";
import { useSequence, type SeqItem } from "../../contexts/sequence";

let seqCounter = 0;

export function SequenceView() {
  const { proto, values } = useEditor();
  const { selected } = useNetwork();
  const { t } = useI18n();
  const { seq, setSeq, loopCount, setLoopCount } = useSequence();
  const [msg, setMsg] = useState<{ kind: "ok" | "err" | "idle"; text: string }>({ kind: "idle", text: t("footer.ready") });

  const addCurrent = () => {
    seqCounter += 1;
    setSeq((s) => [
      ...s,
      { id: `seq-${seqCounter}`, name: t("sequence.pktName", { proto: getProto(proto).label, n: s.length + 1 }), proto, values: { ...values }, delayMs: 100, enabled: true },
    ]);
  };
  const remove = (id: string) => setSeq((s) => s.filter((p) => p.id !== id));
  const move = (i: number, dir: -1 | 1) => {
    setSeq((s) => {
      const j = i + dir;
      if (j < 0 || j >= s.length) return s;
      const next = [...s];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  };
  const update = (id: string, patch: Partial<SeqItem>) =>
    setSeq((s) => s.map((p) => (p.id === id ? { ...p, ...patch } : p)));

  const enabled = seq.filter((p) => p.enabled);

  const start = async () => {
    if (!selected) {
      setMsg({ kind: "err", text: t("common.selectNicFirst") });
      return;
    }
    try {
      const steps: SequenceStep[] = enabled.map((p) => ({
        spec: buildSpec(p.proto, p.values),
        delay_ms: p.delayMs,
      }));
      const id = await api.startSequence(steps, selected.name, loopCount);
      setMsg({ kind: "ok", text: t("sequence.started", { id: id.slice(0, 8) }) });
    } catch (e) {
      setMsg({ kind: "err", text: String(e) });
    }
  };

  return (
    <div className="boot">
      <div className="flex items-center gap-3 mb-4">
        <h1 className="font-display font-semibold text-[15px] tracking-[0.16em] uppercase">{t("sequence.title")}</h1>
        <span className="font-mono text-[11px] text-faint tracking-wide">{t("sequence.subtitle")}</span>
        <span className="flex-1 h-px" style={{ background: "repeating-linear-gradient(90deg,rgb(var(--line)) 0 6px,transparent 6px 12px)" }} />
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        <button onClick={addCurrent} className="font-display text-xs uppercase tracking-wide px-3.5 py-2 rounded border border-amber-dim text-amber bg-amber/10 hover:bg-amber/20 transition">{t("sequence.addCurrent")}</button>
        <div className="flex items-center gap-2 ml-auto">
          <span className="font-mono text-[11px] text-dim">{t("sequence.loop")}</span>
          <input type="number" min={1} value={loopCount} onChange={(e) => setLoopCount(Math.max(1, Number(e.target.value)))} className="w-20 font-mono text-[12px] text-amber bg-bg border border-line-bright rounded px-2 py-1.5 outline-none focus:border-amber" />
          <span className="font-mono text-[11px] text-dim">{t("sequence.loopUnit")}</span>
        </div>
      </div>

      {seq.length === 0 ? (
        <div className="border border-line rounded py-12 text-center font-mono text-xs text-faint">
          {t("sequence.empty")}
        </div>
      ) : (
        <div className="space-y-2">
          {seq.map((p, i) => (
            <div key={p.id} className={`flex items-center gap-3 border rounded p-3 ${p.enabled ? "border-line bg-panel" : "border-line bg-panel opacity-50"}`}>
              <input type="checkbox" checked={p.enabled} onChange={(e) => update(p.id, { enabled: e.target.checked })} className="accent-amber" />
              <span className="w-7 h-7 grid place-items-center bg-elevated rounded-full font-mono text-[11px] text-dim">{i + 1}</span>
              <input value={p.name} onChange={(e) => update(p.id, { name: e.target.value })} className="flex-1 font-ui text-sm text-txt bg-transparent outline-none focus:bg-bg rounded px-1.5 py-1" />
              <span className="font-mono text-[9px] px-1.5 py-0.5 rounded bg-cyan/10 text-cyan uppercase">{getProto(p.proto).label}</span>
              <div className="flex items-center gap-1.5">
                <input type="number" min={0} step={10} value={p.delayMs} onChange={(e) => update(p.id, { delayMs: Math.max(0, Number(e.target.value)) })} className="w-20 font-mono text-[12px] text-txt bg-bg border border-line-bright rounded px-2 py-1 outline-none focus:border-amber" />
                <span className="font-mono text-[10px] text-faint">ms</span>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => move(i, -1)} disabled={i === 0} className="p-1 text-faint hover:text-dim disabled:opacity-30">▲</button>
                <button onClick={() => move(i, 1)} disabled={i === seq.length - 1} className="p-1 text-faint hover:text-dim disabled:opacity-30">▼</button>
                <button onClick={() => remove(p.id)} className="p-1 text-signalred/70 hover:text-signalred">✕</button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center gap-3 mt-4 pt-4 border-t border-line">
        <span className="font-mono text-[11px] text-dim">{t("sequence.summary", { total: seq.length, enabled: enabled.length })}</span>
        <span className={`font-mono text-[11px] ml-auto whitespace-pre-line break-words ${msg.kind === "ok" ? "text-signalgreen" : msg.kind === "err" ? "text-signalred" : "text-faint"}`}>{msg.text}</span>
        <button onClick={start} disabled={enabled.length === 0} className="font-display text-xs uppercase tracking-wide px-4 py-2 rounded border border-amber-dim text-amber bg-amber/10 hover:bg-amber/20 hover:shadow-glow-amber disabled:opacity-40 transition">
          {t("sequence.start")}
        </button>
      </div>
    </div>
  );
}
