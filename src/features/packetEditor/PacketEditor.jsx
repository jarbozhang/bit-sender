import React from "react";
import { PROTOCOLS, RULES } from './config';
import { hexPreview } from './utils';
import { usePacketEditor } from './usePacketEditor';

const PacketEditor = () => {
  const {
    proto,
    fields,
    rules,
    handleProtoChange,
    handleFieldChange,
    handleRuleChange,
  } = usePacketEditor();

  return (
    <div>
      <div className="mb-4 flex items-center gap-4">
        <label className="font-medium">协议类型：</label>
        <select
          className="border rounded px-2 py-1"
          value={proto.key}
          onChange={handleProtoChange}
        >
          {PROTOCOLS.map((p) => (
            <option key={p.key} value={p.key}>
              {p.name}
            </option>
          ))}
        </select>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {proto.fields.map((f) => (
          <div key={f.key} className="flex flex-col gap-1">
            <label className="font-medium">{f.label}</label>
            <input
              className="border rounded px-2 py-1"
              type={f.type}
              placeholder={f.placeholder}
              value={fields[f.key] || ""}
              maxLength={f.maxLength}
              onChange={(e) => handleFieldChange(f.key, f.type === "number" ? Number(e.target.value) : e.target.value, f.maxLength)}
              onPaste={(e) => {
                const paste = (e.clipboardData || window.clipboardData).getData('text');
                if (paste.length > f.maxLength) {
                  alert(`粘贴内容超出最大长度（${f.maxLength}）！`);
                  e.preventDefault();
                }
              }}
            />
            <div className="flex items-center gap-2 text-sm text-gray-500 mt-1">
              <span>规则：</span>
              <select
                className="border rounded px-1 py-0.5"
                value={rules[f.key] || "fixed"}
                onChange={(e) => handleRuleChange(f.key, e.target.value)}
              >
                {RULES.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-6">
        <label className="font-medium">报文内容预览（16进制）</label>
        <div className="bg-gray-100 rounded p-3 font-mono text-sm mt-2 break-all">
          {hexPreview(fields, proto.fields) || <span className="text-gray-400">请填写字段以预览报文内容</span>}
        </div>
      </div>
    </div>
  );
};

export default PacketEditor; 