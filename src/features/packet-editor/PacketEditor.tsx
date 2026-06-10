import { useState, useEffect, useMemo } from "react";
import { api } from "../../lib/api";
import {
  PROTOCOLS,
  getProto,
  defaultValues,
  buildSpec,
  GROUPS,
  type ProtoKey,
  type ProtoField,
  type GroupKey,
} from "../../lib/protocols";
import { toHexRows, byteLength, generateHexDump, parseHexDump, macFromHex } from "../../lib/hexdump";
import { useNetwork } from "../../contexts/network";
import { useEditor } from "../../contexts/editor";
import { BatchDialog } from "./BatchDialog";
import { useI18n } from "../../contexts/i18n";

type SendMsg = { kind: "ok" | "err" | "idle"; text: string };

export function PacketEditor() {
  const { selected } = useNetwork();
  const { proto, values, setProto, setValue, load } = useEditor();
  const { t, lang } = useI18n();
  const [previewHex, setPreviewHex] = useState("");
  const [previewErr, setPreviewErr] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sendMsg, setSendMsg] = useState<SendMsg>({ kind: "idle", text: "" });
  const [showBatch, setShowBatch] = useState(false);

  const def = getProto(proto);

  // 字段按组聚合（保持声明顺序）
  const groups = useMemo(() => {
    const order: GroupKey[] = [];
    const map = new Map<GroupKey, ProtoField[]>();
    for (const f of def.fields) {
      if (!map.has(f.group)) {
        map.set(f.group, []);
        order.push(f.group);
      }
      map.get(f.group)!.push(f);
    }
    return order.map((g) => [g, map.get(g)!] as const);
  }, [def]);

  // 防抖构建后端预览
  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(() => {
      api
        .buildPreview(buildSpec(proto, values))
        .then((hex) => {
          if (!cancelled) {
            setPreviewHex(hex);
            setPreviewErr(null);
          }
        })
        .catch((e) => {
          if (!cancelled) setPreviewErr(String(e));
        });
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [proto, values]);

  const onSend = async () => {
    if (!selected) {
      setSendMsg({ kind: "err", text: t("common.selectNicFirst") });
      return;
    }
    setSending(true);
    try {
      const r = await api.sendPacket(buildSpec(proto, values), selected.name);
      setSendMsg({ kind: "ok", text: t("editor.sent", { bytes: r.bytes, iface: r.interface }) });
    } catch (e) {
      setSendMsg({ kind: "err", text: String(e) });
    } finally {
      setSending(false);
    }
  };

  const L = lang === "zh-CN";

  const onExport = async () => {
    if (!previewHex) {
      setSendMsg({ kind: "err", text: L ? "无报文可导出" : "Nothing to export" });
      return;
    }
    try {
      const { save } = await import("@tauri-apps/plugin-dialog");
      const path = await save({
        defaultPath: `packet_${proto}.txt`,
        filters: [{ name: "Text", extensions: ["txt"] }],
      });
      if (path) {
        const { writeTextFile } = await import("@tauri-apps/plugin-fs");
        await writeTextFile(path, generateHexDump(previewHex));
        setSendMsg({ kind: "ok", text: (L ? "已导出到 " : "Exported to ") + path });
      }
    } catch (e) {
      setSendMsg({ kind: "err", text: String(e) });
    }
  };

  const onImport = async () => {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const sel = await open({ multiple: false, filters: [{ name: "Text", extensions: ["txt"] }] });
      if (typeof sel !== "string") return;
      const { readTextFile } = await import("@tauri-apps/plugin-fs");
      const hex = parseHexDump(await readTextFile(sel));
      if (hex.length < 28) {
        setSendMsg({ kind: "err", text: L ? "解析失败：帧太短" : "Parse failed: frame too short" });
        return;
      }
      // 以 ethernet 协议精确还原：以太头 + 其余字节作 payload，重建即得原帧。
      load("ethernet", {
        dst_mac: macFromHex(hex.slice(0, 12)),
        src_mac: macFromHex(hex.slice(12, 24)),
        ether_type: hex.slice(24, 28),
        payload_hex: hex.slice(28),
      });
      setSendMsg({ kind: "ok", text: L ? "已导入报文（以太网层还原）" : "Imported packet (restored as Ethernet)" });
    } catch (e) {
      setSendMsg({ kind: "err", text: String(e) });
    }
  };

  const rows = toHexRows(previewHex);

  return (
    <div className="boot">
      {/* 视图标题 */}
      <div className="flex items-center gap-3 mb-4">
        <h1 className="font-display font-semibold text-[15px] tracking-[0.16em] uppercase">{t("editor.title")}</h1>
        <span className="font-mono text-[11px] text-faint tracking-wide">{t("editor.subtitle")}</span>
        <span className="flex-1 h-px" style={{ background: "repeating-linear-gradient(90deg,#1b2a33 0 6px,transparent 6px 12px)" }} />
        <button onClick={onImport} className="font-mono text-[11px] px-2.5 py-1 rounded border border-line-bright text-dim hover:text-cyan hover:border-cyan/40 transition">{L ? "导入" : "Import"}</button>
        <button onClick={onExport} className="font-mono text-[11px] px-2.5 py-1 rounded border border-line-bright text-dim hover:text-amber hover:border-amber-dim transition">{L ? "导出" : "Export"}</button>
      </div>

      {/* 协议 tab */}
      <div className="flex gap-0.5 mb-[18px] border-b border-line">
        {PROTOCOLS.map((p) => (
          <button
            key={p.key}
            onClick={() => setProto(p.key)}
            className={`font-display font-medium text-xs tracking-[0.1em] px-[18px] py-2.5 relative transition ${proto === p.key ? "text-amber" : "text-dim hover:text-txt"}`}
          >
            {p.label}
            {p.hint && <span className="font-mono text-[9px] opacity-60 ml-1.5">{p.hint}</span>}
            {proto === p.key && <span className="absolute left-0 right-0 -bottom-px h-0.5 bg-amber" style={{ boxShadow: "0 0 10px rgba(255,178,36,.45)" }} />}
          </button>
        ))}
      </div>

      {/* 编辑器主网格 */}
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_420px] gap-[18px] items-start">
        {/* 字段分组 */}
        <div className="flex flex-col gap-3.5">
          {groups.map(([g, fields]) => {
            const flags = fields.filter((f) => f.kind === "flag");
            const normal = fields.filter((f) => f.kind !== "flag");
            return (
              <div key={g} className="bg-gradient-to-b from-panel-2 to-panel border border-line rounded overflow-hidden">
                <header className="flex items-center gap-2.5 px-3.5 py-2.5 border-b border-line bg-elevated/60">
                  <span className={`font-mono text-[10px] font-semibold tracking-[0.12em] uppercase ${GROUPS[g].accent}`}>{GROUPS[g].tag}</span>
                </header>
                {normal.length > 0 && (
                  <div className="grid grid-cols-2 lg:grid-cols-3 gap-px bg-line">
                    {normal.map((f) => (
                      <div key={f.key} className="bg-panel px-3.5 py-2.5 flex flex-col gap-1">
                        <label className="text-[10px] tracking-wide uppercase text-dim">{t(`field.${f.key}`)}</label>
                        <input
                          value={String(values[f.key] ?? "")}
                          onChange={(e) => setValue(f.key, e.target.value)}
                          placeholder={f.placeholder}
                          spellCheck={false}
                          className="font-mono text-[13px] font-medium text-txt bg-bg border border-line-bright rounded px-2.5 py-1.5 outline-none focus:border-amber focus:shadow-glow-amber transition w-full"
                        />
                      </div>
                    ))}
                  </div>
                )}
                {flags.length > 0 && (
                  <div className="flex gap-1.5 flex-wrap px-3.5 py-2.5 border-t border-line">
                    <span className="text-[10px] text-dim uppercase tracking-wide self-center mr-1">{t("editor.flags")}</span>
                    {flags.map((f) => {
                      const on = Boolean(values[f.key]);
                      return (
                        <button
                          key={f.key}
                          onClick={() => setValue(f.key, !on)}
                          className={`font-mono text-[10px] font-semibold tracking-wide border rounded px-2.5 py-1 transition ${on ? "text-amber border-amber-dim bg-amber/10 shadow-glow-amber" : "text-faint border-line-bright hover:text-dim"}`}
                        >
                          {f.label}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* 示波器 + 控制台 */}
        <div className="flex flex-col gap-3.5 xl:sticky xl:top-0">
          <div className="scanlines border border-line-bright rounded overflow-hidden" style={{ background: "linear-gradient(180deg,#08110f,#060c0c)", boxShadow: "inset 0 0 60px -20px rgba(54,224,207,.18)" }}>
            <header className="flex items-center gap-2.5 px-3.5 py-2.5 border-b border-line relative z-10">
              <span className="font-display text-[11px] tracking-[0.16em] text-cyan" style={{ textShadow: "0 0 10px rgba(54,224,207,.35)" }}>{t("editor.scope")}</span>
              <span className="ml-auto font-mono text-[10px] text-dim">{t("editor.scopeLen")} <b className="text-cyan">{byteLength(previewHex)}</b> B</span>
            </header>
            <div className="relative z-10 px-3.5 py-3 font-mono text-[12px] leading-[1.85] min-h-[160px]">
              {previewErr ? (
                <div className="text-signalred text-[11px]">⚠ {previewErr}</div>
              ) : rows.length === 0 ? (
                <div className="text-faint text-[11px]">{t("editor.scopeEmpty")}</div>
              ) : (
                rows.map((r) => (
                  <div key={r.offset} className="grid grid-cols-[42px_1fr_130px] gap-3.5">
                    <span className="text-faint">{r.offset}</span>
                    <span className="text-txt tracking-[0.06em]">{r.bytes.join(" ")}</span>
                    <span className="text-dim tracking-[0.12em]">{r.ascii}</span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* 发送控制台 */}
          <div className="bg-gradient-to-b from-panel-2 to-panel border border-line rounded p-3.5">
            <div className="grid grid-cols-2 gap-2.5">
              <button
                onClick={onSend}
                disabled={sending}
                className="font-display font-semibold text-xs tracking-[0.1em] uppercase py-2.5 rounded border border-amber-dim text-amber bg-amber/[0.08] hover:bg-amber/[0.16] hover:shadow-glow-amber transition flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-amber" style={{ boxShadow: "0 0 8px #ffb224" }} />
                {sending ? t("editor.sending") : t("editor.testSend")}
              </button>
              <button
                onClick={() => (selected ? setShowBatch(true) : setSendMsg({ kind: "err", text: t("common.selectNicFirst") }))}
                className="font-display font-semibold text-xs tracking-[0.1em] uppercase py-2.5 rounded border border-line-bright text-dim bg-elevated hover:text-cyan hover:border-cyan/40 transition"
              >
                {t("editor.batch")} ▸
              </button>
            </div>
            <div className={`mt-3 pt-3 border-t border-line font-mono text-[11px] flex items-center gap-2 ${sendMsg.kind === "ok" ? "text-signalgreen" : sendMsg.kind === "err" ? "text-signalred" : "text-dim"}`}>
              <span>{sendMsg.kind === "ok" ? "●" : sendMsg.kind === "err" ? "✕" : "○"}</span>
              <span className="truncate">{sendMsg.kind === "idle" ? t("editor.ready") : sendMsg.text}</span>
            </div>
          </div>
        </div>
      </div>

      <BatchDialog
        visible={showBatch}
        onClose={() => setShowBatch(false)}
        spec={buildSpec(proto, values)}
        interfaceName={selected?.name ?? null}
      />
    </div>
  );
}
