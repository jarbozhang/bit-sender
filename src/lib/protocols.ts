import type { PacketSpec } from "../api/bindings";

// 前端协议字段元数据：驱动表单渲染 + 类型安全地构造强类型 PacketSpec。
// 字段命名与后端 spec 完全一致（单一事实来源由 bindings.ts 保证，buildSpec 返回 PacketSpec
// 时若漏填/错填字段，TS 编译即失败）。

export type ProtoKey = "ethernet" | "arp" | "ipv4" | "ipv6" | "tcp" | "http" | "udp" | "icmp";

/** 字段种类，决定输入校验与构造时的转换。 */
export type FieldKind =
  | "mac" // MAC 地址字符串
  | "ip" // IPv4 字符串
  | "hex" // payload 十六进制串
  | "text" // 应用层明文，单行文本
  | "textarea" // 应用层明文，多行文本
  | "dec" // 十进制整数
  | "hexnum" // 十六进制整数（如 ether_type）
  | "flag" // 布尔（TCP flags）
  | "optdec"; // 可选十进制：空 → null（自动算，如校验和）

export type GroupKey = "eth" | "ip" | "ip6" | "l4" | "app" | "arp" | "payload";

export const GROUPS: Record<GroupKey, { tag: string; accent: string }> = {
  eth: { tag: "ETHERNET II", accent: "text-violet" },
  ip: { tag: "INTERNET PROTOCOL V4", accent: "text-cyan" },
  ip6: { tag: "INTERNET PROTOCOL V6", accent: "text-cyan" },
  l4: { tag: "TRANSPORT", accent: "text-amber" },
  app: { tag: "APPLICATION", accent: "text-signalgreen" },
  arp: { tag: "ADDRESS RESOLUTION", accent: "text-amber" },
  payload: { tag: "PAYLOAD", accent: "text-dim" },
};

export interface ProtoField {
  key: string;
  label: string;
  kind: FieldKind;
  group: GroupKey;
  def: string | boolean;
  placeholder?: string;
}

export interface ProtoDef {
  key: ProtoKey;
  label: string;
  hint?: string;
  fields: ProtoField[];
}

const ETH: ProtoField[] = [
  { key: "dst_mac", label: "目的 MAC", kind: "mac", group: "eth", def: "FF:FF:FF:FF:FF:FF" },
  { key: "src_mac", label: "源 MAC", kind: "mac", group: "eth", def: "00:11:22:33:44:55" },
];

const IP_SUBSET: ProtoField[] = [
  { key: "src_ip", label: "源 IP", kind: "ip", group: "ip", def: "192.168.1.100" },
  { key: "dst_ip", label: "目的 IP", kind: "ip", group: "ip", def: "192.168.1.1" },
  { key: "ttl", label: "TTL", kind: "dec", group: "ip", def: "64" },
  { key: "identification", label: "标识", kind: "dec", group: "ip", def: "0" },
];

export const PROTOCOLS: ProtoDef[] = [
  {
    key: "ethernet",
    label: "ETH",
    fields: [
      ...ETH,
      { key: "ether_type", label: "类型", kind: "hexnum", group: "eth", def: "0800", placeholder: "0800" },
      { key: "payload_hex", label: "Payload (hex)", kind: "hex", group: "payload", def: "" },
    ],
  },
  {
    key: "arp",
    label: "ARP",
    fields: [
      { key: "dst_mac", label: "目的 MAC", kind: "mac", group: "eth", def: "FF:FF:FF:FF:FF:FF" },
      { key: "src_mac", label: "源 MAC", kind: "mac", group: "eth", def: "00:11:22:33:44:55" },
      { key: "hw_type", label: "硬件类型", kind: "dec", group: "arp", def: "1" },
      { key: "proto_type", label: "协议类型", kind: "hexnum", group: "arp", def: "0800" },
      { key: "hw_size", label: "硬件长度", kind: "dec", group: "arp", def: "6" },
      { key: "proto_size", label: "协议长度", kind: "dec", group: "arp", def: "4" },
      { key: "opcode", label: "操作码", kind: "dec", group: "arp", def: "1", placeholder: "1=请求 2=应答" },
      { key: "sender_mac", label: "发送方 MAC", kind: "mac", group: "arp", def: "00:11:22:33:44:55" },
      { key: "sender_ip", label: "发送方 IP", kind: "ip", group: "arp", def: "192.168.1.100" },
      { key: "target_mac", label: "目标 MAC", kind: "mac", group: "arp", def: "00:00:00:00:00:00" },
      { key: "target_ip", label: "目标 IP", kind: "ip", group: "arp", def: "192.168.1.1" },
      { key: "payload_hex", label: "Payload (hex)", kind: "hex", group: "payload", def: "" },
    ],
  },
  {
    key: "ipv4",
    label: "IPv4",
    fields: [
      ...ETH,
      { key: "version", label: "版本", kind: "dec", group: "ip", def: "4" },
      { key: "ihl", label: "头长(IHL)", kind: "dec", group: "ip", def: "5" },
      { key: "dscp_ecn", label: "DSCP/ECN", kind: "dec", group: "ip", def: "0" },
      { key: "identification", label: "标识", kind: "dec", group: "ip", def: "0" },
      { key: "flags", label: "标志", kind: "dec", group: "ip", def: "2", placeholder: "2=DF" },
      { key: "fragment_offset", label: "片偏移", kind: "dec", group: "ip", def: "0" },
      { key: "ttl", label: "TTL", kind: "dec", group: "ip", def: "64" },
      { key: "protocol", label: "协议号", kind: "dec", group: "ip", def: "6", placeholder: "6=TCP 17=UDP 1=ICMP" },
      { key: "checksum", label: "校验和", kind: "optdec", group: "ip", def: "", placeholder: "留空自动算" },
      { key: "src_ip", label: "源 IP", kind: "ip", group: "ip", def: "192.168.1.100" },
      { key: "dst_ip", label: "目的 IP", kind: "ip", group: "ip", def: "192.168.1.1" },
      { key: "payload_hex", label: "Payload (hex)", kind: "hex", group: "payload", def: "" },
    ],
  },
  {
    key: "ipv6",
    label: "IPv6",
    hint: "0x86DD",
    fields: [
      ...ETH,
      { key: "src_ip", label: "源 IPv6", kind: "ip", group: "ip6", def: "2001:db8::1" },
      { key: "dst_ip", label: "目的 IPv6", kind: "ip", group: "ip6", def: "2001:db8::2" },
      { key: "traffic_class", label: "流量类别", kind: "dec", group: "ip6", def: "0" },
      { key: "flow_label", label: "流标签", kind: "dec", group: "ip6", def: "0" },
      { key: "next_header", label: "下一头部", kind: "dec", group: "ip6", def: "59", placeholder: "59=无 58=ICMPv6 6=TCP 17=UDP" },
      { key: "hop_limit", label: "跳数限制", kind: "dec", group: "ip6", def: "64" },
      { key: "payload_hex", label: "Payload (hex)", kind: "hex", group: "payload", def: "" },
    ],
  },
  {
    key: "tcp",
    label: "TCP",
    hint: "0x06",
    fields: [
      ...ETH,
      ...IP_SUBSET,
      { key: "src_port", label: "源端口", kind: "dec", group: "l4", def: "54321" },
      { key: "dst_port", label: "目的端口", kind: "dec", group: "l4", def: "80" },
      { key: "seq", label: "序列号", kind: "dec", group: "l4", def: "0" },
      { key: "ack", label: "确认号", kind: "dec", group: "l4", def: "0" },
      { key: "data_offset", label: "数据偏移", kind: "dec", group: "l4", def: "5" },
      { key: "window_size", label: "窗口", kind: "dec", group: "l4", def: "8192" },
      { key: "checksum", label: "校验和", kind: "optdec", group: "l4", def: "", placeholder: "留空自动算" },
      { key: "urgent_pointer", label: "紧急指针", kind: "dec", group: "l4", def: "0" },
      { key: "flag_urg", label: "URG", kind: "flag", group: "l4", def: false },
      { key: "flag_ack", label: "ACK", kind: "flag", group: "l4", def: false },
      { key: "flag_psh", label: "PSH", kind: "flag", group: "l4", def: false },
      { key: "flag_rst", label: "RST", kind: "flag", group: "l4", def: false },
      { key: "flag_syn", label: "SYN", kind: "flag", group: "l4", def: true },
      { key: "flag_fin", label: "FIN", kind: "flag", group: "l4", def: false },
      { key: "payload_hex", label: "Payload (hex)", kind: "hex", group: "payload", def: "" },
    ],
  },
  {
    key: "http",
    label: "HTTP",
    hint: "L7",
    fields: [
      ...ETH,
      ...IP_SUBSET,
      { key: "src_port", label: "源端口", kind: "dec", group: "l4", def: "54321" },
      { key: "dst_port", label: "目的端口", kind: "dec", group: "l4", def: "80" },
      { key: "seq", label: "序列号", kind: "dec", group: "l4", def: "1" },
      { key: "ack", label: "确认号", kind: "dec", group: "l4", def: "1" },
      { key: "data_offset", label: "数据偏移", kind: "dec", group: "l4", def: "5" },
      { key: "window_size", label: "窗口", kind: "dec", group: "l4", def: "8192" },
      { key: "checksum", label: "校验和", kind: "optdec", group: "l4", def: "", placeholder: "留空自动算" },
      { key: "urgent_pointer", label: "紧急指针", kind: "dec", group: "l4", def: "0" },
      { key: "flag_urg", label: "URG", kind: "flag", group: "l4", def: false },
      { key: "flag_ack", label: "ACK", kind: "flag", group: "l4", def: true },
      { key: "flag_psh", label: "PSH", kind: "flag", group: "l4", def: true },
      { key: "flag_rst", label: "RST", kind: "flag", group: "l4", def: false },
      { key: "flag_syn", label: "SYN", kind: "flag", group: "l4", def: false },
      { key: "flag_fin", label: "FIN", kind: "flag", group: "l4", def: false },
      { key: "method", label: "方法", kind: "text", group: "app", def: "GET", placeholder: "GET" },
      { key: "host", label: "Host", kind: "text", group: "app", def: "example.com", placeholder: "example.com" },
      { key: "path", label: "路径", kind: "text", group: "app", def: "/", placeholder: "/" },
      { key: "headers", label: "Headers", kind: "textarea", group: "app", def: "Connection: close", placeholder: "Header: value" },
      { key: "body", label: "Body", kind: "textarea", group: "app", def: "", placeholder: "optional request body" },
    ],
  },
  {
    key: "udp",
    label: "UDP",
    hint: "0x11",
    fields: [
      ...ETH,
      ...IP_SUBSET,
      { key: "src_port", label: "源端口", kind: "dec", group: "l4", def: "12345" },
      { key: "dst_port", label: "目的端口", kind: "dec", group: "l4", def: "53" },
      { key: "checksum", label: "校验和", kind: "optdec", group: "l4", def: "", placeholder: "留空自动算" },
      { key: "payload_hex", label: "Payload (hex)", kind: "hex", group: "payload", def: "" },
    ],
  },
  {
    key: "icmp",
    label: "ICMP",
    hint: "0x01",
    fields: [
      ...ETH,
      ...IP_SUBSET,
      { key: "icmp_type", label: "类型", kind: "dec", group: "l4", def: "8", placeholder: "8=Echo请求" },
      { key: "icmp_code", label: "代码", kind: "dec", group: "l4", def: "0" },
      { key: "rest_of_header", label: "其余头部", kind: "dec", group: "l4", def: "65537", placeholder: "Echo: id<<16|seq" },
      { key: "checksum", label: "校验和", kind: "optdec", group: "l4", def: "", placeholder: "留空自动算" },
      { key: "payload_hex", label: "Payload (hex)", kind: "hex", group: "payload", def: "" },
    ],
  },
];

export function getProto(key: ProtoKey): ProtoDef {
  return PROTOCOLS.find((p) => p.key === key)!;
}

/** 用字段定义生成初始值表。 */
export function defaultValues(key: ProtoKey): Record<string, string | boolean> {
  const out: Record<string, string | boolean> = {};
  for (const f of getProto(key).fields) out[f.key] = f.def;
  return out;
}

/** 把表单值表构造成强类型 PacketSpec。返回类型由 TS 校验各变体字段完整性。 */
export function buildSpec(
  proto: ProtoKey,
  v: Record<string, string | boolean>,
): PacketSpec {
  const dec = (k: string) => parseInt(String(v[k] ?? "") || "0", 10) || 0;
  const hexnum = (k: string) =>
    parseInt(String(v[k] ?? "").replace(/^0x/i, "") || "0", 16) || 0;
  const str = (k: string) => String(v[k] ?? "");
  const flag = (k: string) => Boolean(v[k]);
  const optdec = (k: string): number | null => {
    const s = String(v[k] ?? "").trim();
    return s === "" ? null : parseInt(s, 10) || 0;
  };

  switch (proto) {
    case "ethernet":
      return {
        kind: "ethernet",
        dst_mac: str("dst_mac"),
        src_mac: str("src_mac"),
        ether_type: hexnum("ether_type"),
        payload_hex: str("payload_hex"),
      };
    case "arp":
      return {
        kind: "arp",
        dst_mac: str("dst_mac"),
        src_mac: str("src_mac"),
        hw_type: dec("hw_type"),
        proto_type: hexnum("proto_type"),
        hw_size: dec("hw_size"),
        proto_size: dec("proto_size"),
        opcode: dec("opcode"),
        sender_mac: str("sender_mac"),
        sender_ip: str("sender_ip"),
        target_mac: str("target_mac"),
        target_ip: str("target_ip"),
        payload_hex: str("payload_hex"),
      };
    case "ipv4":
      return {
        kind: "ipv4",
        dst_mac: str("dst_mac"),
        src_mac: str("src_mac"),
        version: dec("version"),
        ihl: dec("ihl"),
        dscp_ecn: dec("dscp_ecn"),
        identification: dec("identification"),
        flags: dec("flags"),
        fragment_offset: dec("fragment_offset"),
        ttl: dec("ttl"),
        protocol: dec("protocol"),
        checksum: optdec("checksum"),
        src_ip: str("src_ip"),
        dst_ip: str("dst_ip"),
        payload_hex: str("payload_hex"),
      };
    case "ipv6":
      return {
        kind: "ipv6",
        dst_mac: str("dst_mac"),
        src_mac: str("src_mac"),
        traffic_class: dec("traffic_class"),
        flow_label: dec("flow_label"),
        next_header: dec("next_header"),
        hop_limit: dec("hop_limit"),
        src_ip: str("src_ip"),
        dst_ip: str("dst_ip"),
        payload_hex: str("payload_hex"),
      };
    case "tcp":
      return {
        kind: "tcp",
        dst_mac: str("dst_mac"),
        src_mac: str("src_mac"),
        ttl: dec("ttl"),
        identification: dec("identification"),
        src_ip: str("src_ip"),
        dst_ip: str("dst_ip"),
        src_port: dec("src_port"),
        dst_port: dec("dst_port"),
        seq: dec("seq"),
        ack: dec("ack"),
        data_offset: dec("data_offset"),
        flag_urg: flag("flag_urg"),
        flag_ack: flag("flag_ack"),
        flag_psh: flag("flag_psh"),
        flag_rst: flag("flag_rst"),
        flag_syn: flag("flag_syn"),
        flag_fin: flag("flag_fin"),
        window_size: dec("window_size"),
        checksum: optdec("checksum"),
        urgent_pointer: dec("urgent_pointer"),
        payload_hex: str("payload_hex"),
      };
    case "http":
      return {
        kind: "http",
        dst_mac: str("dst_mac"),
        src_mac: str("src_mac"),
        ttl: dec("ttl"),
        identification: dec("identification"),
        src_ip: str("src_ip"),
        dst_ip: str("dst_ip"),
        src_port: dec("src_port"),
        dst_port: dec("dst_port"),
        seq: dec("seq"),
        ack: dec("ack"),
        data_offset: dec("data_offset"),
        flag_urg: flag("flag_urg"),
        flag_ack: flag("flag_ack"),
        flag_psh: flag("flag_psh"),
        flag_rst: flag("flag_rst"),
        flag_syn: flag("flag_syn"),
        flag_fin: flag("flag_fin"),
        window_size: dec("window_size"),
        checksum: optdec("checksum"),
        urgent_pointer: dec("urgent_pointer"),
        method: str("method"),
        host: str("host"),
        path: str("path"),
        headers: str("headers"),
        body: str("body"),
      };
    case "udp":
      return {
        kind: "udp",
        dst_mac: str("dst_mac"),
        src_mac: str("src_mac"),
        ttl: dec("ttl"),
        identification: dec("identification"),
        src_ip: str("src_ip"),
        dst_ip: str("dst_ip"),
        src_port: dec("src_port"),
        dst_port: dec("dst_port"),
        checksum: optdec("checksum"),
        payload_hex: str("payload_hex"),
      };
    case "icmp":
      return {
        kind: "icmp",
        dst_mac: str("dst_mac"),
        src_mac: str("src_mac"),
        ttl: dec("ttl"),
        identification: dec("identification"),
        src_ip: str("src_ip"),
        dst_ip: str("dst_ip"),
        icmp_type: dec("icmp_type"),
        icmp_code: dec("icmp_code"),
        checksum: optdec("checksum"),
        rest_of_header: dec("rest_of_header"),
        payload_hex: str("payload_hex"),
      };
  }
}
