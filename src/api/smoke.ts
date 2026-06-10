import { commands, type PacketSpec } from "./bindings";

// 类型安全冒烟测试。
// PacketSpec 是按 `protocol` 标签的可辨识联合，字段与类型均来自后端 specta
// 自动生成的 bindings.ts（单一事实来源）：
//   - ether_type 是 number，写成字符串 "0806" 则 TS 编译失败；
//   - protocol 标签拼错、该变体字段缺失或字段名拼错（如 dstMac）→ TS 编译失败。
// 这正是 v2 根治"前后端字段契约靠碰巧一致"的机制——契约漂移在编译期被拦截。
const sample: PacketSpec = {
  kind: "ethernet",
  dst_mac: "FF:FF:FF:FF:FF:FF",
  src_mac: "00:11:22:33:44:55",
  ether_type: 0x0806,
  payload_hex: "0001",
};

export async function smokePacketPreview(): Promise<string | null> {
  const res = await commands.buildPacketPreviewV2(sample);
  return res.status === "ok" ? res.data : null;
}
