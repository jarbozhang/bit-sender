import { useState } from "react";
import { NetworkProvider, useNetwork } from "./contexts/network";
import { EditorProvider } from "./contexts/editor";
import { I18nProvider, useI18n } from "./contexts/i18n";
import { PacketEditor } from "./features/packet-editor/PacketEditor";
import { SnifferView } from "./features/sniffer/SnifferView";
import { TemplateLibrary } from "./features/templates/TemplateLibrary";
import { SequenceView } from "./features/sequence/SequenceView";
import { MonitorView } from "./features/monitor/MonitorView";

type ViewId = "editor" | "sniffer" | "sequence" | "monitor" | "templates" | "config";

const RAIL: { id: ViewId; labelKey: string; path: string }[] = [
  { id: "editor", labelKey: "nav.editor", path: "M3 11l18-8-8 18-2-7-8-3z" },
  { id: "sniffer", labelKey: "nav.sniffer", path: "M11 4a7 7 0 100 14 7 7 0 000-14zM21 21l-4.3-4.3" },
  { id: "sequence", labelKey: "nav.sequence", path: "M4 6h16M4 12h16M4 18h10" },
  { id: "monitor", labelKey: "nav.monitor", path: "M3 12h4l2 6 4-12 2 6h4" },
  { id: "templates", labelKey: "nav.templates", path: "M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z" },
  { id: "config", labelKey: "nav.config", path: "M12 9a3 3 0 100 6 3 3 0 000-6zM12 2v3M12 19v3M5 5l2 2M17 17l2 2M2 12h3M19 12h3M5 19l2-2M17 7l2-2" },
];

function Placeholder({ labelKey }: { labelKey: string }) {
  const { t } = useI18n();
  return (
    <div className="flex flex-col items-center justify-center h-full text-faint gap-3">
      <div className="font-display text-sm tracking-[0.2em]">{t(labelKey).toUpperCase()}</div>
      <div className="font-mono text-xs">// {t("placeholder.soon")}</div>
    </div>
  );
}

function NicPicker() {
  const { interfaces, selected, setSelected } = useNetwork();
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-3 font-mono text-xs bg-elevated border border-line-bright rounded px-3.5 py-1.5 hover:border-amber-dim hover:shadow-glow-amber transition"
      >
        <span className={`w-[7px] h-[7px] rounded-full ${selected ? "bg-signalgreen led" : "bg-faint"}`} style={selected ? { boxShadow: "0 0 8px #46d483" } : undefined} />
        <span className="text-txt font-semibold">{selected?.name ?? t("statusbar.selectNic")}</span>
        {selected?.addresses[0] && <><span className="text-faint">·</span><span className="text-dim">{selected.addresses[0]}</span></>}
        <span className="text-faint text-[10px]">▾</span>
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1 w-[360px] max-h-[400px] overflow-y-auto bg-panel border border-line-bright rounded shadow-xl z-50">
          {interfaces.length === 0 && <div className="px-4 py-3 text-xs text-dim font-mono">{t("statusbar.noNic")}</div>}
          {interfaces.map((i) => {
            const ipv4 = i.addresses.find((a) => /^\d+\.\d+\.\d+\.\d+$/.test(a));
            return (
              <button
                key={i.name}
                onClick={() => { setSelected(i); setOpen(false); }}
                className={`w-full text-left px-4 py-2.5 border-b border-line hover:bg-elevated transition ${selected?.name === i.name ? "bg-elevated" : ""}`}
              >
                <div className="font-mono text-xs text-txt truncate">{i.description || i.name}</div>
                <div className="font-mono text-[10px] text-dim mt-0.5">{ipv4 || t("statusbar.noIpv4")} · {i.mac || t("statusbar.noMac")}</div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Shell() {
  const [view, setView] = useState<ViewId>("editor");
  const { t, lang, setLang } = useI18n();

  return (
    <div className="h-screen grid grid-rows-[52px_1fr_26px] text-txt">
      {/* 状态栏 */}
      <header className="boot flex items-center gap-5 px-[18px] bg-gradient-to-b from-panel-2 to-panel border-b border-line-bright">
        <div className="flex items-baseline gap-2.5">
          <span className="font-display font-bold text-[18px] tracking-[0.14em]">
            BIT<span className="text-amber" style={{ textShadow: "0 0 14px rgba(255,178,36,.45)" }}>SENDER</span>
          </span>
          <span className="font-mono text-[10px] font-semibold text-cyan border border-cyan/35 rounded px-1.5 py-px tracking-wider bg-cyan/[0.08]">v2.0 · TS</span>
        </div>
        <NicPicker />
        <div className="ml-auto flex items-center gap-1.5">
          <button className="w-8 h-8 grid place-items-center text-amber border border-transparent rounded" title={t("statusbar.theme")}>◐</button>
          <button
            onClick={() => setLang(lang === "zh-CN" ? "en-US" : "zh-CN")}
            className="w-8 h-8 grid place-items-center font-mono text-[11px] text-dim hover:text-amber hover:border-line-bright hover:bg-elevated border border-transparent rounded transition"
            title={t("statusbar.lang")}
          >
            {lang === "zh-CN" ? "EN" : "中"}
          </button>
        </div>
      </header>

      {/* 工作区 */}
      <div className="grid grid-cols-[60px_1fr] min-h-0">
        <nav className="boot bg-panel border-r border-line flex flex-col items-center py-3.5 gap-1.5">
          {RAIL.map((r) => (
            <button
              key={r.id}
              onClick={() => setView(r.id)}
              title={t(r.labelKey)}
              className={`w-[42px] h-[42px] grid place-items-center rounded relative transition ${view === r.id ? "text-amber bg-amber/10" : "text-faint hover:text-dim hover:bg-elevated"}`}
            >
              {view === r.id && <span className="absolute left-[-14px] top-2 bottom-2 w-[3px] rounded-r bg-amber" style={{ boxShadow: "0 0 12px rgba(255,178,36,.45)" }} />}
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5"><path d={r.path} /></svg>
            </button>
          ))}
        </nav>

        <main className="min-w-0 overflow-y-auto px-[22px] py-[18px]">
          {view === "editor" ? (
            <PacketEditor />
          ) : view === "sniffer" ? (
            <SnifferView />
          ) : view === "templates" ? (
            <TemplateLibrary onLoaded={() => setView("editor")} />
          ) : view === "sequence" ? (
            <SequenceView />
          ) : view === "monitor" ? (
            <MonitorView />
          ) : (
            <Placeholder labelKey={RAIL.find((r) => r.id === view)!.labelKey} />
          )}
        </main>
      </div>

      {/* 底部状态条 */}
      <footer className="flex items-center gap-[18px] px-4 bg-panel border-t border-line font-mono text-[10px] text-faint tracking-wide">
        <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-signalgreen led" />{t("footer.ready")}</span>
        <span>{t("footer.driver")} <b className="text-dim font-medium">libpcap</b></span>
        <span className="ml-auto">© BitSender v2</span>
      </footer>
    </div>
  );
}

export default function App() {
  return (
    <I18nProvider>
      <NetworkProvider>
        <EditorProvider>
          <Shell />
        </EditorProvider>
      </NetworkProvider>
    </I18nProvider>
  );
}
