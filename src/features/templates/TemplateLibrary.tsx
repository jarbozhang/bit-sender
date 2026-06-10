import { useState } from "react";
import { loadTemplates, upsertTemplate, deleteTemplate, type Template } from "../../lib/templates";
import { useEditor } from "../../contexts/editor";
import { getProto } from "../../lib/protocols";

export function TemplateLibrary({ onLoaded }: { onLoaded: () => void }) {
  const { proto, values, load } = useEditor();
  const [list, setList] = useState<Template[]>(() => loadTemplates());
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");

  const filtered = list.filter(
    (t) =>
      t.name.toLowerCase().includes(search.toLowerCase()) ||
      t.description.toLowerCase().includes(search.toLowerCase()) ||
      t.tags.some((tag) => tag.toLowerCase().includes(search.toLowerCase())),
  );

  const doLoad = (t: Template) => {
    load(t.proto, t.values);
    onLoaded();
  };

  const doSave = () => {
    if (!name.trim()) return;
    const t: Template = {
      id: `usr-${Date.now()}`,
      name: name.trim(),
      description: desc.trim(),
      proto,
      values: { ...values },
      tags: [],
      createdAt: new Date().toISOString(),
    };
    setList(upsertTemplate(list, t));
    setSaving(false);
    setName("");
    setDesc("");
  };

  return (
    <div className="boot">
      <div className="flex items-center gap-3 mb-4">
        <h1 className="font-display font-semibold text-[15px] tracking-[0.16em] uppercase">Template Library</h1>
        <span className="font-mono text-[11px] text-faint tracking-wide">// 模板库 · 本地保存</span>
        <span className="flex-1 h-px" style={{ background: "repeating-linear-gradient(90deg,#1b2a33 0 6px,transparent 6px 12px)" }} />
        <button onClick={() => setSaving(true)} className="font-display text-xs tracking-wide uppercase px-4 py-2 rounded border border-amber-dim text-amber bg-amber/10 hover:bg-amber/20 hover:shadow-glow-amber transition">
          保存当前为模板
        </button>
      </div>

      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="搜索模板名称 / 描述 / 标签…"
        className="w-full mb-4 font-mono text-[12px] text-txt bg-bg border border-line-bright rounded px-3 py-2 outline-none focus:border-amber"
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5">
        {filtered.length === 0 ? (
          <div className="col-span-full text-center py-10 font-mono text-xs text-faint">无匹配模板</div>
        ) : (
          filtered.map((t) => (
            <div key={t.id} className="bg-gradient-to-b from-panel-2 to-panel border border-line rounded p-3.5">
              <div className="flex items-center gap-2 mb-1.5">
                <span className="font-ui font-semibold text-sm text-txt">{t.name}</span>
                <span className="font-mono text-[9px] px-1.5 py-0.5 rounded bg-cyan/10 text-cyan uppercase">{getProto(t.proto).label}</span>
              </div>
              {t.description && <p className="text-xs text-dim mb-2">{t.description}</p>}
              <div className="flex items-center gap-1.5 mb-3 flex-wrap">
                {t.tags.map((tag) => (
                  <span key={tag} className="font-mono text-[9px] px-1.5 py-0.5 rounded bg-elevated text-faint">{tag}</span>
                ))}
              </div>
              <div className="flex gap-2">
                <button onClick={() => doLoad(t)} className="font-mono text-[11px] px-3 py-1 rounded border border-amber-dim text-amber bg-amber/10 hover:bg-amber/20 transition">加载到编辑器</button>
                {t.id.startsWith("usr-") && (
                  <button onClick={() => setList(deleteTemplate(list, t.id))} className="font-mono text-[11px] px-3 py-1 rounded border border-signalred/40 text-signalred hover:bg-signalred/10 transition">删除</button>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {saving && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={(e) => e.target === e.currentTarget && setSaving(false)}>
          <div className="bg-gradient-to-b from-panel-2 to-panel border border-line-bright rounded w-[420px] p-5">
            <div className="font-display text-sm tracking-[0.14em] text-amber mb-4">◈ 保存模板</div>
            <label className="block text-[10px] uppercase tracking-wide text-dim mb-1">名称</label>
            <input value={name} onChange={(e) => setName(e.target.value)} className="w-full mb-3 font-mono text-[13px] text-txt bg-bg border border-line-bright rounded px-3 py-2 outline-none focus:border-amber" />
            <label className="block text-[10px] uppercase tracking-wide text-dim mb-1">描述</label>
            <input value={desc} onChange={(e) => setDesc(e.target.value)} className="w-full mb-4 font-mono text-[13px] text-txt bg-bg border border-line-bright rounded px-3 py-2 outline-none focus:border-amber" />
            <div className="text-[10px] text-faint mb-4 font-mono">将保存当前编辑器的 {getProto(proto).label} 配置</div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setSaving(false)} className="font-ui text-xs px-4 py-2 rounded border border-line-bright text-dim hover:text-txt">取消</button>
              <button onClick={doSave} disabled={!name.trim()} className="font-display text-xs uppercase px-4 py-2 rounded border border-amber-dim text-amber bg-amber/10 hover:bg-amber/20 disabled:opacity-50 transition">保存</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
