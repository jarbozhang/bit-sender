function formatSingleValue(k, v, protoKey) {
  if (v === undefined || v === null || String(v).trim() === "") return null;

  // Type/ether_type 字段，优先按 hex 处理
  if ( typeof v === "string") {
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
  if (
    ["ttl", "protocol", "tos", "version", "ihl", "flags"].some((fx) =>
      k.toLowerCase().includes(fx)
    )
  ) {
    const num = typeof v === "number" ? v : parseInt(v, 10);
    return isNaN(num) ? null : num.toString(16).toUpperCase().padStart(2, "0");
  }
  
  // Multi-byte numeric fields (2-4 bytes)
  if (["total_length", "identification", "header_checksum", "fragment_offset"].includes(k.toLowerCase())) {
    const num = typeof v === "number" ? v : parseInt(v, 10);
    if (isNaN(num)) return null;
    
    let hexLength = 4; // 默认2字节
    if (k.toLowerCase() === "fragment_offset") {
      // fragment_offset需要与flags合并处理
      return null; // 特殊处理，稍后修复
    }
    
    const hex = num.toString(16).toUpperCase().padStart(hexLength, "0");
    return hex.match(/.{1,2}/g)?.join(" ") || null;
  }
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

// IPv4专用格式化函数
function formatIpv4Packet(obj, proto, localMac = "", localIp = "") {
  const getValue = (key, placeholder) => {
    let value = obj[key];
    if (value === undefined || value === null || String(value).trim() === "") {
      value = placeholder;
    }
    if (value === "__LOCAL_MAC__") return localMac;
    if (value === "__LOCAL_IP__") return localIp;
    return value;
  };

  const parts = [];
  
  // 以太网头
  const dstMac = getValue("dst_mac", "AA:BB:CC:DD:EE:FF");
  const srcMac = getValue("src_mac", localMac);
  const etherType = getValue("ether_type", "0800");
  
  // 处理目的MAC
  if (dstMac && dstMac.includes(":")) {
    const macBytes = dstMac.split(":").map(b => b.toUpperCase().padStart(2, "0"));
    parts.push(...macBytes);
  } else if (dstMac && /^[0-9a-fA-F]+$/.test(dstMac.replace(/[^0-9a-fA-F]/g, ""))) {
    const cleanMac = dstMac.replace(/[^0-9a-fA-F]/g, "").toUpperCase();
    const macBytes = cleanMac.match(/.{1,2}/g) || [];
    parts.push(...macBytes.slice(0, 6));
  }
  
  // 处理源MAC
  if (srcMac && srcMac.includes(":")) {
    const macBytes = srcMac.split(":").map(b => b.toUpperCase().padStart(2, "0"));
    parts.push(...macBytes);
  } else if (srcMac && /^[0-9a-fA-F]+$/.test(srcMac.replace(/[^0-9a-fA-F]/g, ""))) {
    const cleanMac = srcMac.replace(/[^0-9a-fA-F]/g, "").toUpperCase();
    const macBytes = cleanMac.match(/.{1,2}/g) || [];
    parts.push(...macBytes.slice(0, 6));
  }
  
  // 处理以太网类型
  if (etherType) {
    const cleanType = etherType.replace(/[^0-9a-fA-F]/g, "").toUpperCase().padStart(4, "0");
    parts.push(cleanType.substr(0, 2), cleanType.substr(2, 2));
  }
  
  // IPv4头 - 特殊处理组合字段
  const version = parseInt(getValue("version", "4"), 10) || 4;
  const ihl = parseInt(getValue("ihl", "5"), 10) || 5;
  const versionIhl = (version << 4) | ihl;
  parts.push(versionIhl.toString(16).toUpperCase().padStart(2, "0"));
  
  const tos = parseInt(getValue("tos", "0"), 10) || 0;
  parts.push(tos.toString(16).toUpperCase().padStart(2, "0"));
  
  const totalLength = parseInt(getValue("total_length", "0"), 10) || 0;
  const totalLengthHex = totalLength.toString(16).toUpperCase().padStart(4, "0");
  parts.push(totalLengthHex.substr(0, 2), totalLengthHex.substr(2, 2));
  
  const identification = parseInt(getValue("identification", "0"), 10) || 0;
  const idHex = identification.toString(16).toUpperCase().padStart(4, "0");
  parts.push(idHex.substr(0, 2), idHex.substr(2, 2));
  
  // flags + fragment_offset 合并处理
  const flags = parseInt(getValue("flags", "2"), 10) || 2;
  const fragmentOffset = parseInt(getValue("fragment_offset", "0"), 10) || 0;
  const flagsFragOffset = (flags << 13) | (fragmentOffset & 0x1FFF);
  const flagsFragHex = flagsFragOffset.toString(16).toUpperCase().padStart(4, "0");
  parts.push(flagsFragHex.substr(0, 2), flagsFragHex.substr(2, 2));
  
  const ttl = parseInt(getValue("ttl", "64"), 10) || 64;
  parts.push(ttl.toString(16).toUpperCase().padStart(2, "0"));
  
  const protocol = parseInt(getValue("protocol", "6"), 10) || 6;
  parts.push(protocol.toString(16).toUpperCase().padStart(2, "0"));
  
  const headerChecksum = parseInt(getValue("header_checksum", "0"), 10) || 0;
  const checksumHex = headerChecksum.toString(16).toUpperCase().padStart(4, "0");
  parts.push(checksumHex.substr(0, 2), checksumHex.substr(2, 2));
  
  // IP地址
  const srcIp = getValue("srcIp", localIp);
  const dstIp = getValue("dstIp", "192.168.1.2");
  
  if (srcIp && srcIp.includes(".")) {
    const srcBytes = srcIp.split(".").map(n => parseInt(n, 10).toString(16).toUpperCase().padStart(2, "0"));
    parts.push(...srcBytes);
  } else {
    parts.push("C0", "A8", "01", "01"); // 默认192.168.1.1
  }
  
  if (dstIp && dstIp.includes(".")) {
    const dstBytes = dstIp.split(".").map(n => parseInt(n, 10).toString(16).toUpperCase().padStart(2, "0"));
    parts.push(...dstBytes);
  } else {
    parts.push("C0", "A8", "01", "02"); // 默认192.168.1.2
  }
  
  // payload
  const data = getValue("data", "00");
  if (data && typeof data === "string") {
    const clean = data.replace(/\s/g, "");
    if (/^[0-9a-fA-F]+$/.test(clean)) {
      let hex = clean.length % 2 === 0 ? clean : clean + "0";
      const dataBytes = hex.match(/.{1,2}/g) || [];
      parts.push(...dataBytes.map(b => b.toUpperCase()));
    }
  }
  
  // 填充到64字节
  while (parts.length < 64) {
    parts.push("00");
  }
  
  // 格式化输出
  const lines = [];
  for (let i = 0; i < parts.length; i += 16) {
    lines.push(parts.slice(i, i + 16).join(" "));
  }
  
  return lines.join("\n");
}

export function hexPreview(obj, proto, localMac = "", localIp = "") {
  // 特殊处理IPv4协议的字段组合
  if (proto.key === 'ipv4') {
    return formatIpv4Packet(obj, proto, localMac, localIp);
  }
  
  const parts = proto.fields
    .map((f) => {
      const value = obj[f.key];
      let valueToFormat =
        value === undefined || value === null || String(value).trim() === ""
          ? f.placeholder
          : value;
      
      // 处理动态占位符
      if (valueToFormat === "__LOCAL_MAC__") {
        valueToFormat = localMac;
      } else if (valueToFormat === "__LOCAL_IP__") {
        valueToFormat = localIp;
      }
      
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
