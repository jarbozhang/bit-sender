import { useI18n } from "../../contexts/i18n";
import { useTheme } from "../../contexts/theme";

// 配置 / 设置视图。少量文案直接按 lang 内联双语（不必进 i18n 字典）。
export function ConfigView() {
  const { lang, setLang } = useI18n();
  const { theme, setTheme } = useTheme();
  const L = lang === "zh-CN";

  const card = "bg-gradient-to-b from-panel-2 to-panel border border-line rounded p-4";

  return (
    <div className="boot">
      <div className="flex items-center gap-3 mb-4">
        <h1 className="font-display font-semibold text-[15px] tracking-[0.16em] uppercase">{L ? "配置" : "Settings"}</h1>
        <span className="font-mono text-[11px] text-faint tracking-wide">// {L ? "偏好设置" : "preferences"}</span>
        <span className="flex-1 h-px" style={{ background: "repeating-linear-gradient(90deg,rgb(var(--line)) 0 6px,transparent 6px 12px)" }} />
      </div>

      <div className="space-y-3 max-w-2xl">
        {/* 语言 */}
        <div className={`${card} flex items-center justify-between`}>
          <span className="text-sm text-txt">{L ? "界面语言" : "Language"}</span>
          <div className="flex gap-1.5">
            <button
              onClick={() => setLang("zh-CN")}
              className={`font-mono text-[12px] px-3 py-1.5 rounded border transition ${L ? "text-amber border-amber-dim bg-amber/10" : "text-dim border-line-bright hover:text-txt"}`}
            >
              中文
            </button>
            <button
              onClick={() => setLang("en-US")}
              className={`font-mono text-[12px] px-3 py-1.5 rounded border transition ${!L ? "text-amber border-amber-dim bg-amber/10" : "text-dim border-line-bright hover:text-txt"}`}
            >
              English
            </button>
          </div>
        </div>

        {/* 主题 */}
        <div className={`${card} flex items-center justify-between`}>
          <span className="text-sm text-txt">{L ? "主题" : "Theme"}</span>
          <div className="flex gap-1.5">
            <button onClick={() => setTheme("dark")} className={`font-mono text-[12px] px-3 py-1.5 rounded border transition ${theme === "dark" ? "text-amber border-amber-dim bg-amber/10" : "text-dim border-line-bright hover:text-txt"}`}>◐ {L ? "深色" : "Dark"}</button>
            <button onClick={() => setTheme("light")} className={`font-mono text-[12px] px-3 py-1.5 rounded border transition ${theme === "light" ? "text-amber border-amber-dim bg-amber/10" : "text-dim border-line-bright hover:text-txt"}`}>☀ {L ? "浅色" : "Light"}</button>
          </div>
        </div>

        {/* 版本 */}
        <div className={`${card} flex items-center justify-between`}>
          <span className="text-sm text-txt">{L ? "版本" : "Version"}</span>
          <span className="font-mono text-[12px] text-cyan">v{__APP_VERSION__} · rewrite</span>
        </div>

        {/* 关于 */}
        <div className={card}>
          <div className="font-display text-xs tracking-[0.14em] uppercase text-dim mb-2">{L ? "关于" : "About"}</div>
          <p className="text-xs text-dim leading-relaxed">
            {L
              ? "BitSender（比达发包器）— 跨平台网络发包 / 抓包工具。Tauri 2 + React 18 + TypeScript，Rust 强类型协议构建 + specta 类型安全契约 + 实时校验和。"
              : "BitSender — cross-platform packet crafting / capture tool. Tauri 2 + React 18 + TypeScript, Rust strongly-typed protocol builders + specta type-safe contract + real checksums."}
          </p>
        </div>
      </div>
    </div>
  );
}
