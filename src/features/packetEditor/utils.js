function formatSingleValue(k, v, protoKey) {
  if (v === undefined || v === null || String(v).trim() === "") return null;

  // MAC
  if (k.toLowerCase().includes("mac") && typeof v === "string") {
    if (v.includes(":")) {
      return v
        .split(":")
        .map((seg) =>
          isNaN(parseInt(seg, 16)) ? "??" : seg.toUpperCase().padStart(2, "0")
        )
        .join(" ");
    } else if (/^[0-9a-fA-F]+$/.test(v)) {
      return (
        v
          .replace(/[^0-9a-fA-F]/g, "")
          .toUpperCase()
          .match(/.{1,2}/g)
          ?.join(" ") || "??"
      );
    } else {
      return "??";
    }
  }
  // Type/ether_type 字段，优先按 hex 处理
  if (
    ["type", "ether_type", "ttl", "protocol", "opcode", "hwtype", "prototype" ].includes(k.toLowerCase()) &&
    typeof v === "string"
  ) {
    let hex = v
      .replace(/^0x/i, "")
      .replace(/[^0-9a-fA-F]/g, "")
      .toUpperCase();
    if (hex.length % 2 !== 0) hex = "0" + hex;
    return hex.match(/.{1,2}/g)?.join(" ") || null;
  }
  // IP
  if (k.toLowerCase().includes("ip") && typeof v === "string") {
    if (v.includes(".")) {
      return v
        .split(".")
        .map((seg) =>
          isNaN(parseInt(seg, 10))
            ? "??"
            : parseInt(seg, 10).toString(16).toUpperCase().padStart(2, "0")
        )
        .join(" ");
    } else if (/^[0-9a-fA-F]+$/.test(v)) {
      return (
        v
          .replace(/[^0-9a-fA-F]/g, "")
          .toUpperCase()
          .match(/.{1,2}/g)
          ?.join(" ") || "??"
      );
    } else {
      return "??";
    }
  }
  // Multi-byte numeric fields
  if (["port", "seq", "ack"].some((fx) => k.toLowerCase().includes(fx))) {
    const num = typeof v === "number" ? v : parseInt(v, 10);
    const hex = isNaN(num)
      ? null
      : num
          .toString(16)
          .toUpperCase()
          .padStart(k.toLowerCase().includes("port") ? 4 : 8, "0");
    return hex?.match(/.{1,2}/g)?.join(" ") || null;
  }
  // Single-byte numeric fields
  // if (
  //   ["ttl", "protocol", "opcode", "hwtype"].some((fx) =>
  //     k.toLowerCase().includes(fx)
  //   )
  // ) {
  //   const num = typeof v === "number" ? v : parseInt(v, 10);
  //   return isNaN(num) ? null : num.toString(16).toUpperCase().padStart(2, "0");
  // }
  // Payload/data 字段，TCP/UDP 支持字符串和十六进制，其他协议只允许十六进制，奇数位自动补零
  if (["data", "payload"].includes(k.toLowerCase()) && typeof v === "string") {
    const clean = v.replace(/\s/g, "");
    if (protoKey === "tcp" || protoKey === "udp") {
      if (/^[0-9a-fA-F]+$/.test(clean) && clean.length % 2 === 0) {
        return clean
          .match(/.{1,2}/g)
          .map((x) => x.toUpperCase())
          .join(" ");
      }
      return clean
        .split("")
        .map((c) => c.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0"))
        .join(" ");
    } else {
      if (/^[0-9a-fA-F]+$/.test(clean)) {
        let hex = clean.length % 2 === 0 ? clean : clean + "0";
        return hex
          .match(/.{1,2}/g)
          .map((x) => x.toUpperCase())
          .join(" ");
      }
      return "??";
    }
  }
  if (typeof v === "string") {
    return v
      .split("")
      .map((c) => c.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0"))
      .join(" ");
  }
  if (typeof v === "number") {
    return v.toString(16).toUpperCase().padStart(2, "0");
  }
  return null;
}

export function hexPreview(obj, proto) {
  const parts = proto.fields
    .map((f) => {
      const value = obj[f.key];
      const valueToFormat =
        value === undefined || value === null || String(value).trim() === ""
          ? f.placeholder
          : value;
      if (
        valueToFormat === undefined ||
        valueToFormat === null ||
        String(valueToFormat).trim() === ""
      ) {
        return null;
      }
      return formatSingleValue(f.key, valueToFormat, proto.key);
    })
    .filter((p) => p !== null && p !== "");

  let hexString = parts.join(" ");
  hexString = hexString.replace(/\s+/g, " ").trim();

  let bytesArray = hexString === "" ? [] : hexString.split(" ");

  // Pad to 64 bytes if it's an Ethernet frame
  if (bytesArray.length < 64) {
    const paddingCount = 64 - bytesArray.length;
    const padding = Array(paddingCount).fill("00");
    bytesArray.push(...padding);
  }

  if (bytesArray.length === 0) {
    return "";
  }

  // Format with newlines every 16 bytes
  const lines = [];
  for (let i = 0; i < bytesArray.length; i += 16) {
    lines.push(bytesArray.slice(i, i + 16).join(" "));
  }

  return lines.join("\n");
}
