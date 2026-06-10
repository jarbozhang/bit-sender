// 把后端返回的连续 hex 串格式化为示波器面板用的行结构 + Wireshark 风格 dump 导入/导出。

export interface HexRow {
  offset: string;
  bytes: string[];
  ascii: string;
}

export function toHexRows(hex: string, perRow = 16): HexRow[] {
  const clean = hex.replace(/[^0-9a-fA-F]/g, "");
  const bytes: string[] = [];
  for (let i = 0; i + 1 < clean.length; i += 2) {
    bytes.push(clean.slice(i, i + 2).toUpperCase());
  }
  const rows: HexRow[] = [];
  for (let i = 0; i < bytes.length; i += perRow) {
    const chunk = bytes.slice(i, i + perRow);
    const ascii = chunk
      .map((b) => {
        const c = parseInt(b, 16);
        return c >= 32 && c < 127 ? String.fromCharCode(c) : "·";
      })
      .join("");
    rows.push({
      offset: i.toString(16).padStart(4, "0").toUpperCase(),
      bytes: chunk,
      ascii,
    });
  }
  return rows;
}

export function byteLength(hex: string): number {
  return Math.floor(hex.replace(/[^0-9a-fA-F]/g, "").length / 2);
}

/** 连续 hex → Wireshark 风格 hex dump 文本（offset + 16 字节 + ASCII）。用于导出。 */
export function generateHexDump(hex: string): string {
  return toHexRows(hex)
    .map((r) => `${r.offset}  ${r.bytes.join(" ").padEnd(16 * 3 - 1)}  ${r.ascii}`)
    .join("\n");
}

/**
 * 解析 hex dump 文本为连续大写 hex 串。
 * 兼容：① Wireshark/通用「offset  字节…  ascii」格式；② 纯 hex（有/无空格/冒号分隔）。
 */
export function parseHexDump(text: string): string {
  const bytes: string[] = [];
  let structured = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const tokens = line.split(/\s+/);
    if (tokens.length > 1) {
      structured = true;
      // 行首若是 >2 位的纯 hex（或带冒号），视作偏移列，跳过。
      const head = tokens[0].replace(/:$/, "");
      const start = /^[0-9a-fA-F]+$/.test(head) && head.length > 2 ? 1 : 0;
      for (let i = start; i < tokens.length; i++) {
        if (/^[0-9a-fA-F]{2}$/.test(tokens[i])) bytes.push(tokens[i]);
        else break; // 进入 ASCII 区，本行结束
      }
    }
  }
  if (structured && bytes.length) return bytes.join("").toUpperCase();
  // 回退：当作纯 hex，去掉所有非 hex 字符后按偶数长度截取。
  const clean = text.replace(/[^0-9a-fA-F]/g, "");
  return clean.slice(0, clean.length - (clean.length % 2)).toUpperCase();
}

/** 12 位 hex → 冒号分隔大写 MAC。 */
export function macFromHex(h: string): string {
  return (h.match(/.{2}/g) ?? []).join(":").toUpperCase();
}
