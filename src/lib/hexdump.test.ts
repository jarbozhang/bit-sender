import { describe, it, expect } from "vitest";
import { toHexRows, byteLength, parseHexDump, generateHexDump, macFromHex } from "./hexdump";

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

describe("parseHexDump", () => {
  it("解析结构化 dump（跳过偏移列，停在 ASCII 区）", () => {
    const dump = "0000  ff ff ff ff ff ff 00 11 22 33 44 55 08 00";
    expect(parseHexDump(dump)).toBe("FFFFFFFFFFFF0011223344550800");
  });
  it("解析纯 hex（含空格）", () => {
    expect(parseHexDump("de ad be ef")).toBe("DEADBEEF");
  });
  it("解析纯连续 hex", () => {
    expect(parseHexDump("deadbeef")).toBe("DEADBEEF");
  });
  it("generate → parse 往返还原（不可打印字节）", () => {
    const hex = "00010203040506070809";
    expect(parseHexDump(generateHexDump(hex))).toBe(hex);
  });
});

describe("macFromHex", () => {
  it("12 hex → 冒号大写 MAC", () => {
    expect(macFromHex("aabbccddeeff")).toBe("AA:BB:CC:DD:EE:FF");
  });
});
