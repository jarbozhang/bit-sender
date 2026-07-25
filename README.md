<div align="center">

# BitSender

**Cross-platform network packet crafting, sending, and capturing. One native GUI.**

Build raw L2 frames field by field, fire them at line rate, and sniff the wire back, all from a fast desktop app. Rust builds and sends the bytes via libpcap/Npcap; the React frontend never guesses a field.

[![CI](https://github.com/jarbozhang/bit-sender/actions/workflows/ci.yml/badge.svg)](https://github.com/jarbozhang/bit-sender/actions/workflows/ci.yml)
[![Latest release](https://img.shields.io/github/v/release/jarbozhang/bit-sender?display_name=tag)](https://github.com/jarbozhang/bit-sender/releases/latest)
![Platforms](https://img.shields.io/badge/platforms-macOS%20%7C%20Windows%20%7C%20Linux-blue)
![Built with Tauri](https://img.shields.io/badge/built%20with-Tauri%202-24C8B8)

[中文文档](./README.zh-CN.md) · [Download](../../releases/latest)

<img src="./docs/demo.gif" alt="BitSender: live layer-colored hex scope, protocol switching, and dark/light themes" width="860">

</div>

---

## Why BitSender

Most packet tools make you pick one job. Wireshark captures but won't craft. Scapy crafts but you write Python. Colasoft Packet Builder crafts but it's Windows-only and dated. hping is CLI-only.

BitSender does both, with a GUI, on all three platforms:

- **Craft frames across L2–L7, field by field** — Ethernet II, ARP, IPv4, IPv6, TCP, UDP, ICMP, plus HTTP/1.1 cleartext request payloads over TCP. Real checksums (IP / TCP-UDP pseudo-header / ICMP, per RFC 1071 and 768), or set them yourself to forge malformed packets on purpose.
- **Live hex scope** — every byte is colored by protocol layer as you type (Ethernet / IP / transport / payload). Import and export Wireshark-style hex dumps.
- **Send one, or send a flood** — test-send a single frame, or batch at a set rate with exact stop conditions: count, duration, or manual.
- **Sniff with honest stats** — packets-per-second is computed over the last *complete* second from pcap header timestamps, not a hand-wavy counter that drifts. (v1 couldn't count pps right. v2 can.)
- **Sequences and response monitoring** — fire ordered, timed packet sequences, or send ICMP/ARP probes and measure RTT.
- **Templates, dark/light theme, English/中文** — all persisted.

> Above: the packet editor's hex scope colors every byte by protocol layer, live as you edit, plus protocol switching and dark/light themes. HTTP support crafts raw HTTP/1.1 bytes inside a TCP payload; it is not a stateful HTTP client or HTTPS/TLS stack.

## Install

Grab a build from [Releases](../../releases/latest).

**macOS** — remove the quarantine flag after install (builds aren't notarized yet):

```bash
xattr -cr /Applications/BitSender.app
```

Sending and capturing need root:

```bash
sudo /Applications/BitSender.app/Contents/MacOS/BitSender
```

**Windows** — install [Npcap](https://npcap.com/#download) first (check "WinPcap API compatible mode"). Run as Administrator to send or capture.

**Linux** — needs `libpcap` and the webkit2gtk runtime libs. Run with `sudo` or grant `CAP_NET_RAW`.

## Development

Node 22+, pnpm 11+, Rust stable.

```bash
pnpm install
pnpm tauri dev          # full app (send/capture need sudo)
pnpm dev                # frontend only, port 1420
pnpm tauri build        # release bundle → src-tauri/target/release/bundle/
```

Test matrix:

| Command | Covers |
|---|---|
| `pnpm typecheck` | TypeScript compile-time contract check |
| `pnpm test` | vitest unit tests |
| `pnpm test:e2e` | Playwright UI flows (mocked Tauri IPC) |
| `cd src-tauri && cargo test` | Rust golden-byte tests + regenerates `bindings.ts` |
| `cd src-tauri && cargo clippy --all-targets -- -D warnings` | zero-warning gate |

Byte-level correctness is guarded by the cargo golden tests; UI flows by e2e. Real on-wire send/capture needs a privileged real machine and is verified by hand.

## Contributing

Issues and PRs welcome, especially new protocols and capture/analysis features. See [中文文档](./README.zh-CN.md) for the Chinese version of this README.

## Sponsors

BitSender's development is supported by its sponsors — thank you. 💛

<a href="https://github.com/tmhenry"><img src="https://github.com/tmhenry.png" width="64" height="64" alt="tmhenry"></a>
<img src="./docs/sponsors/zhun.jpg" width="64" height="64" alt="Zhun">
<a href="https://github.com/burgerSun"><img src="./docs/sponsors/burgersun.jpg" width="64" height="64" alt="burgerSun"></a>

[**@tmhenry**](https://github.com/tmhenry) · **Zhun** · [**@burgerSun**](https://github.com/burgerSun)
