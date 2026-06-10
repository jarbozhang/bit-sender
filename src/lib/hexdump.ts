// 把后端返回的连续 hex 串格式化为示波器面板用的行结构。

export interface HexRow {
  offset: string;
  bytes: string[];
  ascii: string;
}

/** 按层边界给字节上色用的区段（M2 暂只整体展示，预留给后续按协议层着色）。 */
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
      offset: (i)
        .toString(16)
        .padStart(4, "0")
        .toUpperCase(),
      bytes: chunk,
      ascii,
    });
  }
  return rows;
}

export function byteLength(hex: string): number {
  return Math.floor(hex.replace(/[^0-9a-fA-F]/g, "").length / 2);
}
