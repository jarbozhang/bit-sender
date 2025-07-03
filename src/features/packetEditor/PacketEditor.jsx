import React, { useState } from "react";

const PROTOCOLS = [
  {
    name: "以太网",
    key: "ethernet",
    fields: [
      { label: "源MAC地址", key: "srcMac", type: "text", placeholder: "00:11:22:33:44:55" },
      { label: "目的MAC地址", key: "dstMac", type: "text", placeholder: "AA:BB:CC:DD:EE:FF" },
      { label: "类型", key: "type", type: "text", placeholder: "0x0800" },
    ],
  },
  {
    name: "ARP",
    key: "arp",
    fields: [
      { label: "硬件类型", key: "hwType", type: "number", placeholder: "1" },
      { label: "协议类型", key: "protoType", type: "text", placeholder: "0x0800" },
      { label: "操作码", key: "opcode", type: "number", placeholder: "1" },
      { label: "发送方MAC", key: "srcMac", type: "text", placeholder: "00:11:22:33:44:55" },
      { label: "发送方IP", key: "srcIp", type: "text", placeholder: "192.168.1.1" },
      { label: "目标MAC", key: "dstMac", type: "text", placeholder: "AA:BB:CC:DD:EE:FF" },
      { label: "目标IP", key: "dstIp", type: "text", placeholder: "192.168.1.2" },
    ],
  },
  {
    name: "IPv4",
    key: "ipv4",
    fields: [
      { label: "源IP地址", key: "srcIp", type: "text", placeholder: "192.168.1.1" },
      { label: "目的IP地址", key: "dstIp", type: "text", placeholder: "192.168.1.2" },
      { label: "协议", key: "protocol", type: "number", placeholder: "6 (TCP)" },
      { label: "TTL", key: "ttl", type: "number", placeholder: "64" },
    ],
  },
  {
    name: "UDP",
    key: "udp",
    fields: [
      { label: "源端口", key: "srcPort", type: "number", placeholder: "12345" },
      { label: "目的端口", key: "dstPort", type: "number", placeholder: "80" },
      { label: "数据", key: "data", type: "text", placeholder: "hello" },
    ],
  },
  {
    name: "TCP",
    key: "tcp",
    fields: [
      { label: "源端口", key: "srcPort", type: "number", placeholder: "12345" },
      { label: "目的端口", key: "dstPort", type: "number", placeholder: "80" },
      { label: "序列号", key: "seq", type: "number", placeholder: "0" },
      { label: "确认号", key: "ack", type: "number", placeholder: "0" },
      { label: "数据", key: "data", type: "text", placeholder: "hello" },
    ],
  },
];

const RULES = [
  { label: "固定", value: "fixed" },
  { label: "自增", value: "inc" },
  { label: "自减", value: "dec" },
];

function hexPreview(obj) {
  return Object.values(obj)
    .map((v) => {
      if (typeof v === "number") return v.toString(16).padStart(2, "0");
      if (typeof v === "string")
        return v
          .split("")
          .map((c) => c.charCodeAt(0).toString(16).padStart(2, "0"))
          .join("");
      return "";
    })
    .join(" ");
}

const PacketEditor = () => {
  const [proto, setProto] = useState(PROTOCOLS[0]);
  const [fields, setFields] = useState({});
  const [rules, setRules] = useState({});

  const handleProtoChange = (e) => {
    const p = PROTOCOLS.find((x) => x.key === e.target.value);
    setProto(p);
    setFields({});
    setRules({});
  };

  const handleFieldChange = (key, value) => {
    setFields((prev) => ({ ...prev, [key]: value }));
  };

  const handleRuleChange = (key, value) => {
    setRules((prev) => ({ ...prev, [key]: value }));
  };

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
              onChange={(e) => handleFieldChange(f.key, f.type === "number" ? Number(e.target.value) : e.target.value)}
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
          {hexPreview(fields) || <span className="text-gray-400">请填写字段以预览报文内容</span>}
        </div>
      </div>
    </div>
  );
};

export default PacketEditor; 