import { describe, it, expect } from "vitest";
import { buildSpec, defaultValues, PROTOCOLS } from "./protocols";

describe("buildSpec", () => {
  it("每个协议都能构造带 kind 标签的 spec", () => {
    for (const p of PROTOCOLS) {
      const spec = buildSpec(p.key, defaultValues(p.key));
      expect(spec.kind).toBe(p.key);
    }
  });

  it("ether_type 十六进制串转 number", () => {
    const spec = buildSpec("ethernet", { ...defaultValues("ethernet"), ether_type: "0806" });
    expect(spec).toMatchObject({ kind: "ethernet", ether_type: 0x0806 });
  });

  it("TCP flag 是布尔", () => {
    const spec = buildSpec("tcp", { ...defaultValues("tcp"), flag_syn: true, flag_ack: false });
    if (spec.kind === "tcp") {
      expect(spec.flag_syn).toBe(true);
      expect(spec.flag_ack).toBe(false);
    }
  });

  it("空校验和 → null（后端自动算）", () => {
    const spec = buildSpec("udp", { ...defaultValues("udp"), checksum: "" });
    if (spec.kind === "udp") expect(spec.checksum).toBeNull();
  });

  it("dec 字段转 number", () => {
    const spec = buildSpec("tcp", { ...defaultValues("tcp"), dst_port: "443" });
    if (spec.kind === "tcp") expect(spec.dst_port).toBe(443);
  });

  it("HTTP 字段保持明文字符串并带默认 ACK/PSH", () => {
    const spec = buildSpec("http", {
      ...defaultValues("http"),
      method: "POST",
      path: "/api",
      headers: "Content-Type: text/plain",
      body: "ping",
    });
    if (spec.kind === "http") {
      expect(spec.method).toBe("POST");
      expect(spec.path).toBe("/api");
      expect(spec.headers).toBe("Content-Type: text/plain");
      expect(spec.body).toBe("ping");
      expect(spec.flag_ack).toBe(true);
      expect(spec.flag_psh).toBe(true);
      expect(spec.dst_port).toBe(80);
    }
  });
});

describe("defaultValues", () => {
  it("覆盖协议声明的所有字段", () => {
    for (const p of PROTOCOLS) {
      const v = defaultValues(p.key);
      for (const f of p.fields) expect(v).toHaveProperty(f.key);
    }
  });
});
