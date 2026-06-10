import { describe, it, expect } from "vitest";
import { toHexRows, byteLength } from "./hexdump";

describe("toHexRows", () => {
  it("16 字节一行", () => {
    const rows = toHexRows("00".repeat(20));
    expect(rows.length).toBe(2);
    expect(rows[0].offset).toBe("0000");
    expect(rows[0].bytes.length).toBe(16);
    expect(rows[1].offset).toBe("0010");
    expect(rows[1].bytes.length).toBe(4);
  });

  it("ASCII 可打印字符", () => {
    const rows = toHexRows("414243"); // ABC
    expect(rows[0].ascii).toBe("ABC");
  });

  it("非可打印字节渲染为 ·", () => {
    const rows = toHexRows("00ff");
    expect(rows[0].ascii).toBe("··");
  });
});

describe("byteLength", () => {
  it("统计字节数（忽略非 hex 字符）", () => {
    expect(byteLength("DEADBEEF")).toBe(4);
    expect(byteLength("DE AD BE EF")).toBe(4);
    expect(byteLength("")).toBe(0);
  });
});
