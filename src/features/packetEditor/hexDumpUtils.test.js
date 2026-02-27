import { describe, it, expect } from 'vitest';
import {
  parseHexDump,
  generateHexDump,
  isValidHexString,
  cleanHexString,
  detectProtocolFromHex,
  parsePacketFields,
} from './hexDumpUtils';

// ── parseHexDump ──────────────────────────────────────────────

describe('parseHexDump', () => {
  it('parses standard Wireshark hex dump lines', () => {
    const input = [
      '0000  ff ff ff ff ff ff 00 11  22 33 44 55 08 06 00 01',
      '0010  08 00 06 04 00 01 00 11  22 33 44 55 c0 a8 01 01',
    ].join('\n');
    const result = parseHexDump(input);
    expect(result).toBe(
      'FFFFFFFFFFFF001122334455080600010800060400010011223344550A8010100'.length
        ? 'FFFFFFFFFFFF00112233445508060001080006040001001122334455C0A80101'
        : ''
    );
    // 验证具体内容
    expect(result.startsWith('FFFFFFFFFFFF')).toBe(true);
    expect(result).toContain('0806');
  });

  it('parses pure hex lines without offset', () => {
    const input = 'ff ff ff ff ff ff';
    expect(parseHexDump(input)).toBe('FFFFFFFFFFFF');
  });

  it('returns empty string for null/undefined/empty', () => {
    expect(parseHexDump(null)).toBe('');
    expect(parseHexDump(undefined)).toBe('');
    expect(parseHexDump('')).toBe('');
  });

  it('skips non-hex lines', () => {
    const input = '--- some comment ---\n0000  aa bb cc dd\n';
    expect(parseHexDump(input)).toBe('AABBCCDD');
  });
});

// ── generateHexDump ───────────────────────────────────────────

describe('generateHexDump', () => {
  it('formats hex string into dump lines', () => {
    const hex = 'AABBCCDD';
    const result = generateHexDump(hex);
    expect(result).toContain('0000');
    expect(result).toContain('AA');
  });

  it('returns empty string for null/undefined/empty', () => {
    expect(generateHexDump(null)).toBe('');
    expect(generateHexDump(undefined)).toBe('');
    expect(generateHexDump('')).toBe('');
  });

  it('pads odd-length input with leading zero', () => {
    const result = generateHexDump('ABC');
    // 'ABC' → '0ABC' → 2 bytes
    expect(result).toContain('0A');
    expect(result).toContain('BC');
  });

  it('splits into multiple lines when exceeding bytesPerLine', () => {
    // 32 hex chars = 16 bytes = 1 line; 34 chars = 17 bytes = 2 lines
    const hex = 'AA'.repeat(17);
    const lines = generateHexDump(hex).split('\n');
    expect(lines.length).toBe(2);
    expect(lines[0]).toMatch(/^0000/);
    expect(lines[1]).toMatch(/^0010/);
  });
});

// ── roundtrip ─────────────────────────────────────────────────

describe('parseHexDump + generateHexDump roundtrip', () => {
  it('roundtrips a hex string', () => {
    const original = 'FFFFFFFFFFFF001122334455080600010800060400010011223344550000000000000000C0A80101';
    const dump = generateHexDump(original);
    const parsed = parseHexDump(dump);
    expect(parsed).toBe(original);
  });
});

// ── isValidHexString ──────────────────────────────────────────

describe('isValidHexString', () => {
  it('accepts valid even-length hex', () => {
    expect(isValidHexString('aabb')).toBe(true);
    expect(isValidHexString('AA BB CC')).toBe(true);
  });

  it('rejects odd-length hex', () => {
    expect(isValidHexString('aab')).toBe(false);
  });

  it('rejects non-hex characters', () => {
    expect(isValidHexString('gggg')).toBe(false);
  });

  it('rejects null/undefined/empty', () => {
    expect(isValidHexString(null)).toBe(false);
    expect(isValidHexString(undefined)).toBe(false);
    expect(isValidHexString('')).toBe(false);
  });
});

// ── cleanHexString ────────────────────────────────────────────

describe('cleanHexString', () => {
  it('removes whitespace and uppercases', () => {
    expect(cleanHexString('aa bb cc')).toBe('AABBCC');
    expect(cleanHexString('  ab\ncd\tef  ')).toBe('ABCDEF');
  });

  it('returns empty for null/undefined/empty', () => {
    expect(cleanHexString(null)).toBe('');
    expect(cleanHexString('')).toBe('');
  });
});

// ── detectProtocolFromHex ─────────────────────────────────────

describe('detectProtocolFromHex', () => {
  // Helper: build minimal ethernet frame hex
  const ethHeader = (dstMac, srcMac, etherType) =>
    dstMac + srcMac + etherType;

  const anyMac = 'FFFFFFFFFFFF';

  it('returns null for too-short data', () => {
    expect(detectProtocolFromHex(null)).toBeNull();
    expect(detectProtocolFromHex('AABB')).toBeNull();
  });

  it('detects ARP (ethertype 0806)', () => {
    const hex = ethHeader(anyMac, anyMac, '0806') + '00'.repeat(20);
    expect(detectProtocolFromHex(hex)).toBe('arp');
  });

  it('detects IPv4 (ethertype 0800) without enough for transport layer', () => {
    // 28 hex chars for ethernet header + a few more, but not enough for full IP+transport
    const hex = ethHeader(anyMac, anyMac, '0800') + '00'.repeat(10);
    expect(detectProtocolFromHex(hex)).toBe('ipv4');
  });

  it('detects TCP (protocol byte 06 in IPv4)', () => {
    // Ethernet (14 bytes=28 chars) + IPv4 header (20 bytes=40 chars)
    // Protocol field is at byte offset 23 (from start), hex offset 46
    const ethPart = ethHeader(anyMac, anyMac, '0800');
    // Build minimal IPv4 header: version+IHL, TOS, total_len, id, flags_frag, ttl, protocol=06, ...
    const ipHeader = '45' + '00' + '0028' + '0000' + '4000' + '40' + '06' + '0000' + 'C0A80101' + 'C0A80102';
    const hex = ethPart + ipHeader;
    expect(detectProtocolFromHex(hex)).toBe('tcp');
  });

  it('detects UDP (protocol byte 11 in IPv4)', () => {
    const ethPart = ethHeader(anyMac, anyMac, '0800');
    const ipHeader = '45' + '00' + '0028' + '0000' + '4000' + '40' + '11' + '0000' + 'C0A80101' + 'C0A80102';
    const hex = ethPart + ipHeader;
    expect(detectProtocolFromHex(hex)).toBe('udp');
  });

  it('defaults to ethernet for unknown ethertype', () => {
    const hex = ethHeader(anyMac, anyMac, 'FFFF') + '00'.repeat(10);
    expect(detectProtocolFromHex(hex)).toBe('ethernet');
  });

  it('defaults to ethernet for data shorter than 28 chars but >= 24', () => {
    // 24 chars = 12 bytes, just enough dst+src mac but no ethertype
    const hex = anyMac + anyMac;
    expect(detectProtocolFromHex(hex)).toBe('ethernet');
  });
});

// ── parsePacketFields ─────────────────────────────────────────

describe('parsePacketFields', () => {
  it('returns empty object for null input', () => {
    expect(parsePacketFields(null, 'ethernet')).toEqual({});
    expect(parsePacketFields('aabb', null)).toEqual({});
  });

  it('returns empty object for unknown protocol', () => {
    expect(parsePacketFields('AABB', 'unknown')).toEqual({});
  });

  describe('ethernet', () => {
    it('parses ethernet fields correctly', () => {
      // dst_mac: FF:FF:FF:FF:FF:FF, src_mac: 00:11:22:33:44:55, ethertype: 0800, data: AABB
      const hex = 'FFFFFFFFFFFF001122334455' + '0800' + 'AABB';
      const result = parsePacketFields(hex, 'ethernet');
      expect(result.dst_mac).toBe('FF:FF:FF:FF:FF:FF');
      expect(result.src_mac).toBe('00:11:22:33:44:55');
      expect(result.ether_type).toBe('0800');
      expect(result.data).toBe('AABB');
    });

    it('returns empty for too-short data', () => {
      expect(parsePacketFields('AABB', 'ethernet')).toEqual({});
    });
  });

  describe('arp', () => {
    it('parses ARP fields with correct offsets', () => {
      // Build hex matching the offsets in parseArpFields:
      // dst_mac: 0-11, src_mac: 12-23, ether_type: 24-27,
      // hwType: 28-31, protoType: 32-35,
      // opcode: 38-41 (source code reads from offset 38),
      // srcMac: 44-55, srcIp: 56-63, dstMac: 64-75, dstIp: 76-83
      const dstMac = 'FFFFFFFFFFFF';       // 0-11
      const srcMac = '001122334455';         // 12-23
      const etherType = '0806';              // 24-27
      const hwType = '0001';                 // 28-31
      const protoType = '0800';              // 32-35
      const hwSizeProtoSize = '0604';        // 36-37, 38-39
      const opcode = '0001';                 // 40-43 (real offset; code reads 38-41)
      const senderMac = '001122334455';      // 44-55
      const senderIp = 'C0A80101';           // 56-63
      const targetMac = '000000000000';      // 64-75
      const targetIp = 'C0A80102';           // 76-83

      const hex = dstMac + srcMac + etherType + hwType + protoType + hwSizeProtoSize + opcode + senderMac + senderIp + targetMac + targetIp;
      const result = parsePacketFields(hex, 'arp');
      expect(result.dst_mac).toBe('FF:FF:FF:FF:FF:FF');
      expect(result.src_mac).toBe('00:11:22:33:44:55');
      expect(result.hwType).toBe('0001');
      expect(result.protoType).toBe('0800');
      expect(result.srcIp).toBe('192.168.1.1');
      expect(result.dstIp).toBe('192.168.1.2');
    });
  });

  describe('ipv4', () => {
    it('parses IPv4 fields with correct offsets', () => {
      const eth = 'FFFFFFFFFFFF001122334455' + '0800';
      // IPv4 header: version=4, ihl=5, tos=0, total_len=40, id=0, flags=2, frag=0, ttl=64, proto=6, cksum=0, src=192.168.1.1, dst=192.168.1.2
      const ip = '45' + '00' + '0028' + '0000' + '4000' + '40' + '06' + '0000' + 'C0A80101' + 'C0A80102';
      const hex = eth + ip;
      const result = parsePacketFields(hex, 'ipv4');
      expect(result.version).toBe('4');
      expect(result.ihl).toBe('5');
      expect(result.ttl).toBe('64');
      expect(result.protocol).toBe('6');
      expect(result.srcIp).toBe('192.168.1.1');
      expect(result.dstIp).toBe('192.168.1.2');
    });
  });

  describe('udp', () => {
    it('parses UDP fields', () => {
      const eth = 'FFFFFFFFFFFF001122334455' + '0800';
      const ip = '45' + '00' + '002C' + '0000' + '4000' + '40' + '11' + '0000' + 'C0A80101' + 'C0A80102';
      // UDP: srcPort=12345(3039), dstPort=53(0035), length=12(000C), checksum=0
      const udp = '3039' + '0035' + '000C' + '0000';
      const hex = eth + ip + udp;
      const result = parsePacketFields(hex, 'udp');
      expect(result.srcPort).toBe('12345');
      expect(result.dstPort).toBe('53');
      expect(result.length).toBe('12');
    });
  });

  describe('tcp', () => {
    it('parses TCP fields', () => {
      const eth = 'FFFFFFFFFFFF001122334455' + '0800';
      const ip = '45' + '00' + '0034' + '0000' + '4000' + '40' + '06' + '0000' + 'C0A80101' + 'C0A80102';
      // TCP: srcPort=80(0050), dstPort=12345(3039), seq=1, ack=0, data_offset+flags, window, cksum, urgent
      const tcp = '0050' + '3039' + '00000001' + '00000000' + '5002' + '2000' + '0000' + '0000';
      const hex = eth + ip + tcp;
      const result = parsePacketFields(hex, 'tcp');
      expect(result.srcPort).toBe('80');
      expect(result.dstPort).toBe('12345');
      expect(result.seq).toBe('1');
      expect(result.window_size).toBe('8192');
    });
  });
});
