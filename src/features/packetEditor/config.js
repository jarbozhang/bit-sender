export const PROTOCOLS = [
  {
    name: "以太网",
    key: "ethernet",
    fields: [
      { label: "目的MAC地址", key: "dst_mac", type: "text", placeholder: "AA:BB:CC:DD:EE:FF", maxLength: 12 },
      { label: "源MAC地址", key: "src_mac", type: "text", placeholder: "00:11:22:33:44:55", maxLength: 12 },
      { label: "类型", key: "ether_type", type: "text", placeholder: "0800", maxLength: 4 },
      { label: "Payload / 数据", key: "data", type: "text", placeholder: "00", maxLength: 256 },
    ],
  },
  {
    name: "ARP",
    key: "arp",
    fields: [
      { label: "硬件类型", key: "hwType", type: "number", placeholder: "1", maxLength: 4 },
      { label: "协议类型", key: "protoType", type: "text", placeholder: "0800", maxLength: 6 },
      { label: "操作码", key: "opcode", type: "number", placeholder: "1", maxLength: 4 },
      { label: "发送方MAC", key: "srcMac", type: "text", placeholder: "00:11:22:33:44:55", maxLength: 17 },
      { label: "发送方IP", key: "srcIp", type: "text", placeholder: "192.168.1.1", maxLength: 15 },
      { label: "目标MAC", key: "dstMac", type: "text", placeholder: "AA:BB:CC:DD:EE:FF", maxLength: 17 },
      { label: "目标IP", key: "dstIp", type: "text", placeholder: "192.168.1.2", maxLength: 15 },
      { label: "Payload / 数据", key: "data", type: "text", placeholder: "00", maxLength: 256 },
    ],
  },
  {
    name: "IPv4",
    key: "ipv4",
    fields: [
      { label: "源IP地址", key: "srcIp", type: "text", placeholder: "192.168.1.1", maxLength: 15 },
      { label: "目的IP地址", key: "dstIp", type: "text", placeholder: "192.168.1.2", maxLength: 15 },
      { label: "协议", key: "protocol", type: "number", placeholder: "6", maxLength: 3 },
      { label: "TTL", key: "ttl", type: "number", placeholder: "64", maxLength: 3 },
      { label: "Payload / 数据", key: "data", type: "text", placeholder: "00", maxLength: 256 },
    ],
  },
  {
    name: "UDP",
    key: "udp",
    fields: [
      { label: "源端口", key: "srcPort", type: "number", placeholder: "12345", maxLength: 5 },
      { label: "目的端口", key: "dstPort", type: "number", placeholder: "80", maxLength: 5 },
      { label: "Payload / 数据", key: "data", type: "text", placeholder: "hello", maxLength: 256 },
    ],
  },
  {
    name: "TCP",
    key: "tcp",
    fields: [
      { label: "源端口", key: "srcPort", type: "number", placeholder: "12345", maxLength: 5 },
      { label: "目的端口", key: "dstPort", type: "number", placeholder: "80", maxLength: 5 },
      { label: "序列号", key: "seq", type: "number", placeholder: "0", maxLength: 10 },
      { label: "确认号", key: "ack", type: "number", placeholder: "0", maxLength: 10 },
      { label: "Payload / 数据", key: "data", type: "text", placeholder: "hello", maxLength: 256 },
    ],
  },
];

export const RULES = [
  { label: "固定", value: "fixed" },
  { label: "自增", value: "inc" },
  { label: "自减", value: "dec" },
]; 