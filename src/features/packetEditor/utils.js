export function hexPreview(obj, protoFields) {
  return protoFields
    .map((f) => {
      const k = f.key;
      const v = obj[k];
      // MAC 地址特殊处理
      if (k.toLowerCase().includes("mac") && typeof v === "string") {
        if (v.includes(":")) {
          // 冒号分隔
          return v
            .split(":")
            .map((seg) => {
              const num = parseInt(seg, 16);
              return isNaN(num) ? "??" : seg.toUpperCase().padStart(2, "0");
            })
            .join(" ");
        } else if (/^[0-9a-fA-F]+$/.test(v)) {
          // 任意长度的16进制字符串
          return v
            .replace(/[^0-9a-fA-F]/g, "")
            .toUpperCase()
            .match(/.{1,2}/g)
            .join(" ");
        } else {
          return "??";
        }
      }
      // type 字段特殊处理
      if (k.toLowerCase() === "type" && typeof v === "string") {
        let hex = v.replace(/^0x/i, "").replace(/[^0-9a-fA-F]/g, "").toUpperCase();
        if (hex.length % 2 !== 0) hex = "0" + hex;
        return hex.match(/.{1,2}/g)?.join(" ") || "";
      }
      // IP 地址格式化
      if (k.toLowerCase().includes("ip") && typeof v === "string") {
        if (v.includes(".")) {
          // 点分十进制
          return v
            .split(".")
            .map(seg => {
              const num = parseInt(seg, 10);
              return isNaN(num) ? "??" : num.toString(16).toUpperCase().padStart(2, "0");
            })
            .join(" ");
        } else if (/^[0-9a-fA-F]+$/.test(v)) {
          // 连续8位16进制字符串
          return v
            .replace(/[^0-9a-fA-F]/g, "")
            .toUpperCase()
            .match(/.{1,2}/g)
            .join(" ");
        } else {
          return "??";
        }
      }
      // 端口、TTL、协议等数字字段
      if (["port", "ttl", "protocol", "seq", "ack", "opcode", "hwtype"].some(fx => k.toLowerCase().includes(fx))) {
        if (typeof v === "number") return v.toString(16).toUpperCase().padStart(4, "0");
        if (typeof v === "string" && v !== "") {
          const num = parseInt(v, 10);
          return isNaN(num) ? "??" : num.toString(16).toUpperCase().padStart(4, "0");
        }
      }
      if (typeof v === "number") return v.toString(16).toUpperCase().padStart(2, "0");
      if (typeof v === "string")
        return v
          .split("")
          .map((c) => c.charCodeAt(0).toString(16).padStart(2, "0"))
          .join("");
      return "";
    })
    .join(" ");
} 