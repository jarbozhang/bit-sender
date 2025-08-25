/**
 * Wireshark Hex Dump 格式处理工具
 */

/**
 * 解析 Hex Dump 格式的文本数据
 * 支持 Wireshark 导出的标准格式：
 * 0000  ff ff ff ff ff ff 00 11  22 33 44 55 08 06 00 01
 * 0010  08 00 06 04 00 01 00 11  22 33 44 55 c0 a8 01 01
 * 
 * @param {string} hexDumpText - Hex Dump 格式的文本
 * @returns {string} - 连续的十六进制字符串，如 "ffff..."
 */
export function parseHexDump(hexDumpText) {
  if (!hexDumpText || typeof hexDumpText !== 'string') {
    return '';
  }

  // 移除空行并分割成行
  const lines = hexDumpText.trim().split('\n').filter(line => line.trim());
  let hexData = '';

  for (const line of lines) {
    // 匹配标准 Hex Dump 格式行
    // 格式：偏移量 + 空格 + 十六进制数据（可能有多个分组）
    const match = line.match(/^[0-9a-fA-F]{4}\s+((?:[0-9a-fA-F]{2}\s*)+)/);
    
    if (match) {
      // 提取十六进制数据部分，移除所有空格
      const hexPart = match[1].replace(/\s+/g, '');
      hexData += hexPart;
    } else {
      // 尝试匹配纯十六进制行（无偏移量）
      const pureHexMatch = line.match(/^([0-9a-fA-F\s]+)$/);
      if (pureHexMatch) {
        hexData += pureHexMatch[1].replace(/\s+/g, '');
      }
    }
  }

  return hexData.toUpperCase();
}

/**
 * 将十六进制字符串转换为 Hex Dump 格式
 * 
 * @param {string} hexString - 连续的十六进制字符串
 * @param {number} bytesPerLine - 每行显示的字节数，默认16
 * @returns {string} - Hex Dump 格式的文本
 */
export function generateHexDump(hexString, bytesPerLine = 16) {
  if (!hexString || typeof hexString !== 'string') {
    return '';
  }

  // 确保是偶数长度
  if (hexString.length % 2 !== 0) {
    hexString = '0' + hexString;
  }

  const result = [];
  let offset = 0;

  // 按字节分组
  for (let i = 0; i < hexString.length; i += bytesPerLine * 2) {
    const lineData = hexString.substr(i, bytesPerLine * 2);
    
    // 格式化偏移量（4位十六进制）
    const offsetStr = offset.toString(16).toUpperCase().padStart(4, '0');
    
    // 将字节数据分组，每两个字符（1字节）加一个空格
    const formattedBytes = [];
    for (let j = 0; j < lineData.length; j += 2) {
      formattedBytes.push(lineData.substr(j, 2));
    }
    
    // 每8个字节增加额外空格（模拟Wireshark格式）
    let formattedLine = '';
    for (let k = 0; k < formattedBytes.length; k++) {
      if (k > 0 && k % 8 === 0) {
        formattedLine += ' '; // 额外空格
      }
      formattedLine += ' ' + formattedBytes[k];
    }
    
    // 添加行到结果
    result.push(`${offsetStr} ${formattedLine.trimStart()}`);
    offset += bytesPerLine;
  }

  return result.join('\n');
}

/**
 * 验证十六进制字符串格式
 * 
 * @param {string} hexString - 要验证的字符串
 * @returns {boolean} - 是否为有效的十六进制字符串
 */
export function isValidHexString(hexString) {
  if (!hexString || typeof hexString !== 'string') {
    return false;
  }
  
  // 移除所有空格和换行符
  const cleaned = hexString.replace(/\s+/g, '');
  
  // 检查是否只包含十六进制字符
  return /^[0-9a-fA-F]*$/.test(cleaned) && cleaned.length % 2 === 0;
}

/**
 * 清理十六进制字符串（移除空格、换行等）
 * 
 * @param {string} hexString - 要清理的字符串
 * @returns {string} - 清理后的十六进制字符串
 */
export function cleanHexString(hexString) {
  if (!hexString || typeof hexString !== 'string') {
    return '';
  }
  
  return hexString.replace(/\s+/g, '').toUpperCase();
}

/**
 * 尝试从 Hex Dump 数据自动识别协议类型
 * 
 * @param {string} hexData - 十六进制数据
 * @returns {string|null} - 识别的协议类型，如 'ethernet', 'arp', 'ipv4' 等
 */
export function detectProtocolFromHex(hexData) {
  if (!hexData || hexData.length < 24) { // 至少需要12字节（以太网头部的一部分）
    return null;
  }

  const cleanHex = cleanHexString(hexData);
  
  // 检查以太网类型字段（第13-14字节，索引24-27）
  if (cleanHex.length >= 28) {
    const etherType = cleanHex.substr(24, 4);
    
    switch (etherType) {
      case '0806':
        return 'arp';
      case '0800':
        // IPv4数据包，检查是否有足够长度来识别更高层协议
        if (cleanHex.length >= 68) { // 至少需要完整的以太网+IPv4头部 + 部分传输层
          const protocol = cleanHex.substr(46, 2);
          switch (protocol) {
            case '06':
              return 'tcp';
            case '11':
              return 'udp';
            default:
              return 'ipv4';
          }
        }
        return 'ipv4';
      default:
        // 对于其他类型或未知类型，默认为以太网
        return 'ethernet';
    }
  }
  
  return 'ethernet'; // 默认以太网
}

/**
 * 从十六进制数据中解析数据包字段
 * 
 * @param {string} hexData - 十六进制数据
 * @param {string} protocol - 协议类型
 * @returns {object} - 解析出的字段对象
 */
export function parsePacketFields(hexData, protocol) {
  if (!hexData || !protocol) {
    return {};
  }

  const cleanHex = cleanHexString(hexData);
  const fields = {};

  try {
    switch (protocol) {
      case 'ethernet':
        return parseEthernetFields(cleanHex);
      case 'arp':
        return parseArpFields(cleanHex);
      case 'ipv4':
        return parseIpv4Fields(cleanHex);
      case 'tcp':
        return parseTcpFields(cleanHex);
      case 'udp':
        return parseUdpFields(cleanHex);
      default:
        return {};
    }
  } catch (error) {
    console.warn('解析数据包字段时出错:', error);
    return {};
  }
}

/**
 * 解析以太网帧字段
 */
function parseEthernetFields(hexData) {
  if (hexData.length < 28) return {};
  
  return {
    dst_mac: formatMacAddress(hexData.substr(0, 12)),
    src_mac: formatMacAddress(hexData.substr(12, 12)),
    ether_type: hexData.substr(24, 4),
    data: hexData.length > 28 ? hexData.substr(28) : ''
  };
}

/**
 * 解析ARP数据包字段
 */
function parseArpFields(hexData) {
  if (hexData.length < 56) return {};
  
  return {
    dst_mac: formatMacAddress(hexData.substr(0, 12)),
    src_mac: formatMacAddress(hexData.substr(12, 12)),
    ether_type: hexData.substr(24, 4),
    hwType: hexData.substr(28, 4),
    protoType: hexData.substr(32, 4),
    opcode: hexData.substr(38, 4),
    srcMac: formatMacAddress(hexData.substr(44, 12)),
    srcIp: formatIpAddress(hexData.substr(56, 8)),
    dstMac: formatMacAddress(hexData.substr(64, 12)),
    dstIp: formatIpAddress(hexData.substr(76, 8)),
    data: hexData.length > 84 ? hexData.substr(84) : ''
  };
}

/**
 * 解析IPv4数据包字段
 */
function parseIpv4Fields(hexData) {
  if (hexData.length < 68) return {}; // 以太网(28) + IPv4最小(40) = 68字符
  
  const versionIhl = hexData.substr(28, 2);
  const version = Math.floor(parseInt(versionIhl, 16) / 16); // 高4位
  const ihl = parseInt(versionIhl, 16) & 0x0F; // 低4位
  const ipHeaderLength = ihl * 4 * 2; // IHL字段 * 4字节 * 2字符/字节
  
  const flagsFragOffset = parseInt(hexData.substr(40, 4), 16);
  const flags = (flagsFragOffset >> 13) & 0x7; // 高3位
  const fragmentOffset = flagsFragOffset & 0x1FFF; // 低13位
  
  return {
    dst_mac: formatMacAddress(hexData.substr(0, 12)),
    src_mac: formatMacAddress(hexData.substr(12, 12)),
    ether_type: hexData.substr(24, 4),
    version: version.toString(),
    ihl: ihl.toString(),
    tos: parseInt(hexData.substr(30, 2), 16).toString(),
    total_length: parseInt(hexData.substr(32, 4), 16).toString(),
    identification: parseInt(hexData.substr(36, 4), 16).toString(),
    flags: flags.toString(),
    fragment_offset: fragmentOffset.toString(),
    ttl: parseInt(hexData.substr(44, 2), 16).toString(),
    protocol: parseInt(hexData.substr(46, 2), 16).toString(),
    header_checksum: parseInt(hexData.substr(48, 4), 16).toString(),
    srcIp: formatIpAddress(hexData.substr(52, 8)),
    dstIp: formatIpAddress(hexData.substr(60, 8)),
    data: hexData.length > (28 + ipHeaderLength) ? hexData.substr(28 + ipHeaderLength) : ''
  };
}

/**
 * 解析TCP数据包字段
 */
function parseTcpFields(hexData) {
  const ipv4Fields = parseIpv4Fields(hexData);
  if (hexData.length < 88) return ipv4Fields; // 以太网(14) + IPv4(20) + TCP最小(20) = 54字节 = 108字符
  
  const tcpStart = 68; // 以太网(28) + IPv4(40) 
  
  return {
    ...ipv4Fields,
    srcPort: parseInt(hexData.substr(tcpStart, 4), 16).toString(),
    dstPort: parseInt(hexData.substr(tcpStart + 4, 4), 16).toString(),
    seq: parseInt(hexData.substr(tcpStart + 8, 8), 16).toString(),
    ack: parseInt(hexData.substr(tcpStart + 16, 8), 16).toString(),
    data_offset: Math.floor(parseInt(hexData.substr(tcpStart + 24, 1), 16) / 4).toString(),
    reserved: '0',
    flag_urg: (parseInt(hexData.substr(tcpStart + 25, 1), 16) & 0x2) ? '1' : '0',
    flag_ack: (parseInt(hexData.substr(tcpStart + 25, 1), 16) & 0x1) ? '1' : '0',
    flag_psh: (parseInt(hexData.substr(tcpStart + 26, 1), 16) & 0x8) ? '1' : '0',
    flag_rst: (parseInt(hexData.substr(tcpStart + 26, 1), 16) & 0x4) ? '1' : '0',
    flag_syn: (parseInt(hexData.substr(tcpStart + 26, 1), 16) & 0x2) ? '1' : '0',
    flag_fin: (parseInt(hexData.substr(tcpStart + 26, 1), 16) & 0x1) ? '1' : '0',
    window_size: parseInt(hexData.substr(tcpStart + 28, 4), 16).toString(),
    checksum: parseInt(hexData.substr(tcpStart + 32, 4), 16).toString(),
    urgent_pointer: parseInt(hexData.substr(tcpStart + 36, 4), 16).toString(),
    data: hexData.length > (tcpStart + 40) ? hexData.substr(tcpStart + 40) : ''
  };
}

/**
 * 解析UDP数据包字段
 */
function parseUdpFields(hexData) {
  const ipv4Fields = parseIpv4Fields(hexData);
  if (hexData.length < 84) return ipv4Fields; // 以太网(14) + IPv4(20) + UDP(8) = 42字节 = 84字符
  
  const udpStart = 68; // 以太网(28) + IPv4(40)
  
  return {
    ...ipv4Fields,
    srcPort: parseInt(hexData.substr(udpStart, 4), 16).toString(),
    dstPort: parseInt(hexData.substr(udpStart + 4, 4), 16).toString(),
    length: parseInt(hexData.substr(udpStart + 8, 4), 16).toString(),
    checksum: parseInt(hexData.substr(udpStart + 12, 4), 16).toString(),
    data: hexData.length > (udpStart + 16) ? hexData.substr(udpStart + 16) : ''
  };
}

/**
 * 格式化MAC地址
 */
function formatMacAddress(hexMac) {
  if (!hexMac || hexMac.length !== 12) return '';
  return hexMac.match(/.{2}/g).join(':').toUpperCase();
}

/**
 * 格式化IP地址
 */
function formatIpAddress(hexIp) {
  if (!hexIp || hexIp.length !== 8) return '';
  const bytes = hexIp.match(/.{2}/g);
  return bytes.map(byte => parseInt(byte, 16)).join('.');
}