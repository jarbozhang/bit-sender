import { type ProtoKey, defaultValues } from "./protocols";

// 报文模板：纯前端 localStorage 持久化（v2 用强类型 {proto, values} 格式，
// 修复 v1 出厂模板用 'ipv4'/'eth' 等编辑器不存在的协议名导致静默退化的 bug）。

export interface Template {
  id: string;
  name: string;
  description: string;
  proto: ProtoKey;
  values: Record<string, string | boolean>;
  tags: string[];
  createdAt: string;
}

const KEY = "bitsender-v2-templates";

/** 以某协议默认值为底，覆盖少量关键字段，生成模板值。 */
function tmpl(proto: ProtoKey, over: Record<string, string | boolean>): Record<string, string | boolean> {
  return { ...defaultValues(proto), ...over };
}

export const DEFAULT_TEMPLATES: Template[] = [
  {
    id: "def-arp-request",
    name: "ARP 请求 · 网络发现",
    description: "广播 ARP 请求，探测局域网内某 IP 的 MAC",
    proto: "arp",
    values: tmpl("arp", {
      dst_mac: "FF:FF:FF:FF:FF:FF",
      opcode: "1",
      target_mac: "00:00:00:00:00:00",
      target_ip: "192.168.1.1",
    }),
    tags: ["ARP", "发现", "常用"],
    createdAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "def-tcp-syn",
    name: "TCP SYN · 端口探测",
    description: "TCP SYN 包，用于端口连通性探测",
    proto: "tcp",
    values: tmpl("tcp", { dst_port: "80", flag_syn: true, flag_ack: false, seq: "1000" }),
    tags: ["TCP", "扫描"],
    createdAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "def-udp-dns",
    name: "UDP DNS 查询",
    description: "向 53 端口发送 DNS 查询（payload 为 example.com A 记录查询）",
    proto: "udp",
    values: tmpl("udp", {
      dst_port: "53",
      dst_ip: "8.8.8.8",
      payload_hex: "0001010000010000000000000377777706676f6f676c6503636f6d0000010001",
    }),
    tags: ["UDP", "DNS"],
    createdAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "def-icmp-ping",
    name: "ICMP Echo · Ping",
    description: "ICMP Echo 请求（ping）",
    proto: "icmp",
    values: tmpl("icmp", { icmp_type: "8", rest_of_header: "65537", payload_hex: "6162636465666768" }),
    tags: ["ICMP", "连通性"],
    createdAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "def-eth-broadcast",
    name: "以太网广播",
    description: "自定义以太网广播帧",
    proto: "ethernet",
    values: tmpl("ethernet", { dst_mac: "FF:FF:FF:FF:FF:FF", ether_type: "0800", payload_hex: "48656c6c6f" }),
    tags: ["以太网", "广播"],
    createdAt: "2026-01-01T00:00:00.000Z",
  },
];

/** 读取模板：首次或缺失默认模板时补齐（保留用户自定义）。 */
export function loadTemplates(): Template[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) {
      localStorage.setItem(KEY, JSON.stringify(DEFAULT_TEMPLATES));
      return DEFAULT_TEMPLATES;
    }
    const stored: Template[] = JSON.parse(raw);
    const ids = new Set(stored.map((t) => t.id));
    const missing = DEFAULT_TEMPLATES.filter((d) => !ids.has(d.id));
    if (missing.length > 0) {
      const merged = [...stored, ...missing];
      localStorage.setItem(KEY, JSON.stringify(merged));
      return merged;
    }
    return stored;
  } catch {
    return [];
  }
}

export function persist(list: Template[]): void {
  localStorage.setItem(KEY, JSON.stringify(list));
}

export function upsertTemplate(list: Template[], t: Template): Template[] {
  const i = list.findIndex((x) => x.id === t.id || x.name === t.name);
  const next = i >= 0 ? list.map((x, idx) => (idx === i ? t : x)) : [...list, t];
  persist(next);
  return next;
}

export function deleteTemplate(list: Template[], id: string): Template[] {
  const next = list.filter((t) => t.id !== id);
  persist(next);
  return next;
}
