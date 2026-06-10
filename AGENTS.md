# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## Project Overview

BitSender（比达发包器）— a cross-platform network packet crafting/sending/capturing tool built with **Tauri 2 + React 18**. Supports Ethernet, ARP, IPv4, TCP, UDP, ICMP protocols.

## Commands

```bash
pnpm install              # Install dependencies
pnpm tauri dev             # Full dev mode (Vite + Tauri, requires Rust toolchain)
pnpm dev                   # Frontend only, port 1420
pnpm tauri build           # Production build → src-tauri/target/release/bundle/

# Rust tests
cd src-tauri && cargo test

# Release (syncs version across package.json, Cargo.toml, tauri.conf.json)
pnpm release               # auto-increment minor
pnpm release:patch         # increment patch
./scripts/release.sh 1.2.3 # specific version
```

## Architecture

### Frontend (`src/`)
- React 18 with JSX, functional components + hooks, no TypeScript
- Tailwind CSS 3 for styling (dark mode via `dark:` variants)
- Vite 6 bundler, pnpm package manager
- No third-party UI library — all components are custom

**Component hierarchy:**
```
App → ToastProvider → NetworkInterfaceProvider → BatchTaskProvider → AppContent (tab routing)
```

Three main tabs: PacketEditor, NetworkSniffer, TemplateManager (ResponseMonitor exists but is hidden)

**Key directories:**
- `features/` — main functional modules (packetEditor, networkSniffer, templateManager, responseMonitor)
- `contexts/` — React Context providers for global state (BatchTask, NetworkInterface, Toast)
- `hooks/` — custom hooks (`useNetwork` wraps Tauri invoke calls, `useTheme`, `useLanguage`)
- `locales/` — i18n with `zh-CN.json` / `en-US.json`, custom `useTranslation` hook

### Backend (`src-tauri/`)
- Rust with Tauri 2.x, tokio async runtime
- `lib.rs` — all Tauri command definitions and app setup
- `network/mod.rs` — shared types, `send_packet`, TaskMap type aliases
- `network/packet_builder.rs` — raw packet byte construction per protocol
- `network/interface.rs` — pcap device wrapper, NetworkSender
- `network/packet_sniffer.rs` — SnifferManager for async packet capture
- `network/sequence_sender.rs` — sequential packet sending with loop support
- `network/interface_manager.rs` — network adapter isolation/restore (platform-specific)

### Frontend ↔ Backend Communication
All via Tauri `invoke()`. Key commands: `send_packet`, `build_packet_preview`, `get_network_interfaces`, `start_batch_send`/`stop_batch_send`/`get_batch_send_status`, `start_sequence_send`/`stop_sequence_send`, `start_packet_capture`/`stop_packet_capture`/`get_captured_packets`.

## Version Management

Version must be updated in **3 files simultaneously**:
1. `package.json` — `version`
2. `src-tauri/Cargo.toml` — `[package] version`
3. `src-tauri/tauri.conf.json` — `version`

Always use `scripts/release.sh` to avoid desync.

## Platform Requirements

- **Windows**: Npcap required (WinPcap API compat mode)
- **macOS**: `xattr -cr` after install; sending packets needs sudo
- **Linux**: `libpcap-dev` + Webkit2Gtk system deps
