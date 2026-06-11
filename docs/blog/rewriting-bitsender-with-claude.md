# How I rewrote BitSender in a weekend with Claude Code

BitSender is a cross-platform packet crafting and capture tool: a desktop GUI where you
build a raw Ethernet frame field by field, send it through libpcap, and sniff the wire
back. The v1 worked, mostly. But two things had been bothering me for months, and over
one weekend I threw the whole thing away and rewrote it from scratch with
[Claude Code](https://claude.com/claude-code) (the Fable 5 model).

This is the honest version of what that was like: what the rewrite fixed, the two design
decisions that mattered, and what AI-assisted work actually felt like when the bar is
"the bytes have to be exactly right," not "the demo works."

## Two things that itched

**1. The frontend↔backend contract was held together by luck.**

v1 passed packet fields from React to Rust as a `HashMap<String, String>`. The Rust side
pulled values out by key, parsed them, and filled in silent defaults when a key was
missing or malformed. So if the frontend sent `ttl` but Rust read `time_to_live`, nothing
broke loudly. You got a packet. It just wasn't the packet you asked for. Every field was a
chance for the two sides to quietly disagree, and the only way to find out was to inspect
the bytes on the wire.

**2. The packets-per-second counter was a lie.**

v1's sniffer counted packets in a wall-clock window and divided. Under bursty traffic the
number jumped around so much it was useless. For a tool whose whole job is "did my packets
go out at the rate I asked," a pps number you can't trust is a real defect, not a polish
item.

Both of these are correctness problems. Neither is fixable with a coat of paint. So:
full rewrite, correctness first.

## The core idea: one type, exported

The thing that root-fixes the "contract by luck" problem is making the contract impossible
to get wrong. In v2, Rust owns a single strongly-typed enum:

```rust
#[derive(Serialize, Deserialize, Type)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum PacketSpec {
    Ethernet(EthernetSpec),
    Arp(ArpSpec),
    Ipv4(Ipv4Spec),
    Ipv6(Ipv6Spec),
    Tcp(TcpSpec),
    Udp(UdpSpec),
    Icmp(IcmpSpec),
}
```

[tauri-specta](https://github.com/specta-rs/tauri-specta) exports this enum, and every
Tauri command signature, into a generated `bindings.ts` during `cargo test`. The frontend
imports those generated types. Now a field name typo or a type mismatch doesn't produce a
wrong packet at runtime, it fails `tsc` at **compile time**. The contract can't drift,
because there's only one source of truth and the other side is generated from it.

One gotcha worth writing down: the serde tag is `kind`, not `protocol`. `Ipv4Spec` already
has a `protocol` field (the IP protocol number), and if you use `tag = "protocol"`, the
generated TypeScript discriminated union collapses to `never` because the tag key collides
with a real field. Twenty minutes of "why is my type `never`" before that clicked.

## Golden bytes: the test that matters for a packet tool

Here's the thing about a packet builder: "the function returns without erroring" tells you
nothing. The only test that matters is "byte 23 is exactly `0x06`." So every protocol in
v2 has golden-byte tests, hand-derived from the RFCs:

```rust
assert_eq!(frame.len(), 60);                            // min Ethernet frame, padded
assert_eq!(frame[14 + 9], IP_PROTO_UDP);                // IP header byte 9 == 17
assert_eq!(&udp[0..2], &[0x30, 0x39]);                  // src port 12345 -> 0x3039 BE
assert_eq!(&udp[2..4], &[0x00, 0x35]);                  // dst port 53    -> 0x0035
assert_eq!(&udp[4..6], &[0x00, 0x0C]);                  // length 8 + 4   -> 12
assert_eq!(&frame[42..46], &[0xDE, 0xAD, 0xBE, 0xEF]);  // payload lands intact
```

The expected values aren't computed by the code under test. They're worked out by hand
from RFC 768/791/1071 and pinned. Checksums too: IPv4 header checksum, the TCP/UDP
pseudo-header checksum, ICMP, all verified against known references. 56 of these across the
seven protocols. If a byte-order flip or an offset-by-one ever sneaks in, a specific
assertion fails and points at the exact byte. That's the whole game for this kind of tool.

## The pps fix: count the last *complete* second

The honest-stats fix is small but it's the difference between a number you trust and one
you don't. The capture thread is the single source of truth. It timestamps packets from
the pcap header (not from when the UI happened to poll), and computes pps over the last
*complete* one-second window, sliding. The in-progress second is never shown, so the
number doesn't twitch. A bounded buffer drops display packets under load and reports how
many it dropped, instead of lying by omission.

## What working with Claude Code actually felt like

The speed is real, but it's not the interesting part. The interesting part is where the
leverage went.

What it was great at: generating the seven protocol builders in parallel and, more
importantly, generating their golden-byte tests from the RFC field layouts. Writing 56
hand-derived byte assertions is exactly the tedious, error-prone work that used to make me
skip thorough tests. Here it cost minutes, so there was no excuse to skip it.

Where I had to hold the line: the tests are the contract. I didn't let it mark a protocol
"done" until the golden bytes were pinned and green. AI is happy to write code that looks
right. The defense against "looks right" is the same as it's always been: assertions that
fail loudly when it isn't. The difference is that AI also writes those assertions fast, so
the rigor got cheaper, not more expensive.

The serde `never` bug above is a good example of the actual loop: it wrote something
plausible, `tsc` went red in a way neither of us predicted, and we traced it to the tag
collision together. The compiler was the referee. That's the pattern, lean on the type
system and the test suite as the things that can't be charmed by plausible-looking code.

## Receipts

- One strongly-typed `PacketSpec`, exported to TypeScript by tauri-specta. Field mismatches
  fail at compile time.
- 56 golden-byte tests asserting exact bytes against RFC references.
- Playwright e2e covering the UI flows (mocked IPC), vitest unit tests, `cargo clippy`
  with `-D warnings` as a gate.
- Green CI building on macOS (ARM + Intel), Windows, and Linux.

The weekend produced a tool I trust more than the one I spent far longer on the first time.
Not because AI is magic, but because it made the careful version cheap enough that there
was no reason to ship the careless one.

Code: [github.com/jarbozhang/bit-sender](https://github.com/jarbozhang/bit-sender)
