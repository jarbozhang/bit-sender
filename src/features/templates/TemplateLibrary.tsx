import { useState } from "react";
import { loadTemplates, upsertTemplate, deleteTemplate, type Template } from "../../lib/templates";
import { useEditor } from "../../contexts/editor";
import { getProto } from "../../lib/protocols";
import { useI18n } from "../../contexts/i18n";

export function TemplateLibrary({ onLoaded }: { onLoaded: () => void }) {
  const { proto, values, load } = useEditor();
  const { t } = useI18n();
  const [list, setList] = useState<Template[]>(() => loadTemplates());
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");

  // 出厂模板（def-*）显示名/描述走 i18n，用户模板用存储值。
  const tplName = (tpl: Template) => (tpl.id.startsWith("def-") ? t(`tmpl.${tpl.id}.name`) : tpl.name);
  const tplDesc = (tpl: Template) => (tpl.id.startsWith("def-") ? t(`tmpl.${tpl.id}.desc`) : tpl.description);

  const filtered = list.filter(
    (tpl) =>
      tplName(tpl).toLowerCase().includes(search.toLowerCase()) ||
      tplDesc(tpl).toLowerCase().includes(search.toLowerCase()) ||
      tpl.tags.some((tag) => tag.toLowerCase().includes(search.toLowerCase())),
  );

  const doLoad = (tpl: Template) => {
    load(tpl.proto, tpl.values);
    onLoaded();
  };

  const doSave = () => {
    if (!name.trim()) return;
    const tpl: Template = {
      id: `usr-${Date.now()}`,
      name: name.trim(),
      description: desc.trim(),
      proto,
      values: { ...values },
      tags: [],
      createdAt: new Date().toISOString(),
    };
    setList(upsertTemplate(list, tpl));
    setSaving(false);
    setName("");
    setDesc("");
  };

  return (
    <div className="boot">
      <div className="flex items-center gap-3 mb-4">
        <h1 className="font-display font-semibold text-[15px] tracking-[0.16em] uppercase">{t("template.title")}</h1>
        <span className="font-mono text-[11px] text-faint tracking-wide">{t("template.subtitle")}</span>
        <span className="flex-1 h-px" style={{ background: "repeating-linear-gradient(90deg,#1b2a33 0 6px,transparent 6px 12px)" }} />
        <button onClick={() => setSaving(true)} className="font-display text-xs tracking-wide uppercase px-4 py-2 rounded border border-amber-dim text-amber bg-amber/10 hover:bg-amber/20 hover:shadow-glow-amber transition">
          {t("template.saveCurrent")}
        </button>
      </div>

      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder={t("template.search")}
        className="w-full mb-4 font-mono text-[12px] text-txt bg-bg border border-line-bright rounded px-3 py-2 outline-none focus:border-amber"
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5">
        {filtered.length === 0 ? (
          <div className="col-span-full text-center py-10 font-mono text-xs text-faint">{t("template.empty")}</div>
        ) : (
          filtered.map((tpl) => (
            <div key={tpl.id} className="bg-gradient-to-b from-panel-2 to-panel border border-line rounded p-3.5">
              <div className="flex items-center gap-2 mb-1.5">
                <span className="font-ui font-semibold text-sm text-txt">{tplName(tpl)}</span>
                <span className="font-mono text-[9px] px-1.5 py-0.5 rounded bg-cyan/10 text-cyan uppercase">{getProto(tpl.proto).label}</span>
              </div>
              {tplDesc(tpl) && <p className="text-xs text-dim mb-2">{tplDesc(tpl)}</p>}
              <div className="flex items-center gap-1.5 mb-3 flex-wrap">
                {tpl.tags.map((tag) => (
                  <span key={tag} className="font-mono text-[9px] px-1.5 py-0.5 rounded bg-elevated text-faint">{tag}</span>
                ))}
              </div>
              <div className="flex gap-2">
                <button onClick={() => doLoad(tpl)} className="font-mono text-[11px] px-3 py-1 rounded border border-amber-dim text-amber bg-amber/10 hover:bg-amber/20 transition">{t("template.loadToEditor")}</button>
                {tpl.id.startsWith("usr-") && (
                  <button onClick={() => setList(deleteTemplate(list, tpl.id))} className="font-mono text-[11px] px-3 py-1 rounded border border-signalred/40 text-signalred hover:bg-signalred/10 transition">{t("common.delete")}</button>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {saving && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={(e) => e.target === e.currentTarget && setSaving(false)}>
          <div className="bg-gradient-to-b from-panel-2 to-panel border border-line-bright rounded w-[420px] p-5">
            <div className="font-display text-sm tracking-[0.14em] text-amber mb-4">{t("template.saveTitle")}</div>
            <label className="block text-[10px] uppercase tracking-wide text-dim mb-1">{t("template.name")}</label>
            <input value={name} onChange={(e) => setName(e.target.value)} className="w-full mb-3 font-mono text-[13px] text-txt bg-bg border border-line-bright rounded px-3 py-2 outline-none focus:border-amber" />
            <label className="block text-[10px] uppercase tracking-wide text-dim mb-1">{t("template.desc")}</label>
            <input value={desc} onChange={(e) => setDesc(e.target.value)} className="w-full mb-4 font-mono text-[13px] text-txt bg-bg border border-line-bright rounded px-3 py-2 outline-none focus:border-amber" />
            <div className="text-[10px] text-faint mb-4 font-mono">{t("template.saveHint", { proto: getProto(proto).label })}</div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setSaving(false)} className="font-ui text-xs px-4 py-2 rounded border border-line-bright text-dim hover:text-txt">{t("common.cancel")}</button>
              <button onClick={doSave} disabled={!name.trim()} className="font-display text-xs uppercase px-4 py-2 rounded border border-amber-dim text-amber bg-amber/10 hover:bg-amber/20 disabled:opacity-50 transition">{t("common.save")}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
