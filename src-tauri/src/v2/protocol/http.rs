//! HTTP/1.1（cleartext over TCP over IPv4 over Ethernet）。
//!
//! 这是 Layer 7 payload 构造器：把 method/path/headers/body 序列化为 HTTP/1.1
//! 请求字节，再复用 TCP builder 产出完整以太网帧。它不实现 TCP 三次握手、seq/ack
//! 状态管理或 TLS/HTTPS。

use serde::{Deserialize, Serialize};
use specta::Type;

use super::tcp::{build_tcp, TcpSpec};
use super::BuildError;

/// HTTP/1.1 请求帧规格。L2/L3/L4 字段与 TcpSpec 对齐，应用层字段负责生成 TCP payload。
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct HttpSpec {
    // 以太网头
    pub dst_mac: String,
    pub src_mac: String,
    // IPv4 头（暴露的子集）
    pub ttl: u8,
    pub identification: u16,
    pub src_ip: String,
    pub dst_ip: String,
    // TCP 头
    pub src_port: u16,
    pub dst_port: u16,
    pub seq: u32,
    pub ack: u32,
    /// 数据偏移（以 4 字节为单位），无选项时为 5。会被 TCP builder clamp 到 [5,15]。
    pub data_offset: u8,
    pub flag_urg: bool,
    pub flag_ack: bool,
    pub flag_psh: bool,
    pub flag_rst: bool,
    pub flag_syn: bool,
    pub flag_fin: bool,
    pub window_size: u16,
    pub checksum: Option<u16>,
    pub urgent_pointer: u16,
    // HTTP 应用层
    pub method: String,
    pub host: String,
    pub path: String,
    /// 每行一个 header，形如 `Name: value`。允许空行；换行会规范化为 CRLF。
    pub headers: String,
    pub body: String,
}

pub fn build_http(spec: &HttpSpec) -> Result<Vec<u8>, BuildError> {
    let payload = build_http_request(spec)?;
    let tcp = TcpSpec {
        dst_mac: spec.dst_mac.clone(),
        src_mac: spec.src_mac.clone(),
        ttl: spec.ttl,
        identification: spec.identification,
        src_ip: spec.src_ip.clone(),
        dst_ip: spec.dst_ip.clone(),
        src_port: spec.src_port,
        dst_port: spec.dst_port,
        seq: spec.seq,
        ack: spec.ack,
        data_offset: spec.data_offset,
        flag_urg: spec.flag_urg,
        flag_ack: spec.flag_ack,
        flag_psh: spec.flag_psh,
        flag_rst: spec.flag_rst,
        flag_syn: spec.flag_syn,
        flag_fin: spec.flag_fin,
        window_size: spec.window_size,
        checksum: spec.checksum,
        urgent_pointer: spec.urgent_pointer,
        payload_hex: bytes_to_hex(payload.as_bytes()),
    };
    build_tcp(&tcp)
}

fn build_http_request(spec: &HttpSpec) -> Result<String, BuildError> {
    let method = spec.method.trim().to_ascii_uppercase();
    if method.is_empty() || !method.chars().all(is_http_token_char) {
        return Err(BuildError::InvalidHttpField {
            field: "method".into(),
            reason: "必须是非空 HTTP token".into(),
        });
    }

    let host = spec.host.trim();
    if host.is_empty() || host.contains(['\r', '\n']) {
        return Err(BuildError::InvalidHttpField {
            field: "host".into(),
            reason: "Host 不能为空且不能包含换行".into(),
        });
    }

    let path = normalize_path(&spec.path);
    if path.contains(['\r', '\n']) {
        return Err(BuildError::InvalidHttpField {
            field: "path".into(),
            reason: "Path 不能包含换行".into(),
        });
    }

    let mut out = String::new();
    out.push_str(&method);
    out.push(' ');
    out.push_str(&path);
    out.push_str(" HTTP/1.1\r\n");
    out.push_str("Host: ");
    out.push_str(host);
    out.push_str("\r\n");

    for line in normalized_header_lines(&spec.headers)? {
        out.push_str(&line);
        out.push_str("\r\n");
    }

    out.push_str("\r\n");
    out.push_str(&spec.body);
    Ok(out)
}

fn normalize_path(path: &str) -> String {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        "/".into()
    } else if trimmed.starts_with('/') || trimmed.starts_with('*') {
        trimmed.into()
    } else {
        format!("/{trimmed}")
    }
}

fn normalized_header_lines(headers: &str) -> Result<Vec<String>, BuildError> {
    let normalized = headers.replace("\r\n", "\n").replace('\r', "\n");
    let mut lines = Vec::new();
    for raw in normalized.lines() {
        let line = raw.trim();
        if line.is_empty() {
            continue;
        }
        let Some((name, value)) = line.split_once(':') else {
            return Err(BuildError::InvalidHttpField {
                field: "headers".into(),
                reason: format!("header 行缺少冒号: {line}"),
            });
        };
        let name = name.trim();
        if name.is_empty() || !name.chars().all(is_http_token_char) {
            return Err(BuildError::InvalidHttpField {
                field: "headers".into(),
                reason: format!("header 名称无效: {line}"),
            });
        }
        if name.eq_ignore_ascii_case("host") {
            return Err(BuildError::InvalidHttpField {
                field: "headers".into(),
                reason: "Host 请使用专用 host 字段，避免重复 Host header".into(),
            });
        }
        lines.push(format!("{}: {}", name, value.trim()));
    }
    Ok(lines)
}

fn is_http_token_char(c: char) -> bool {
    c.is_ascii_alphanumeric()
        || matches!(
            c,
            '!' | '#'
                | '$'
                | '%'
                | '&'
                | '\''
                | '*'
                | '+'
                | '-'
                | '.'
                | '^'
                | '_'
                | '`'
                | '|'
                | '~'
        )
}

fn bytes_to_hex(bytes: &[u8]) -> String {
    const HEX: &[u8; 16] = b"0123456789ABCDEF";
    let mut out = String::with_capacity(bytes.len() * 2);
    for &b in bytes {
        out.push(HEX[(b >> 4) as usize] as char);
        out.push(HEX[(b & 0x0F) as usize] as char);
    }
    out
}

#[cfg(test)]
mod golden {
    use super::*;
    use crate::v2::protocol::ones_complement_sum;

    fn sample() -> HttpSpec {
        HttpSpec {
            dst_mac: "FF:FF:FF:FF:FF:FF".into(),
            src_mac: "00:11:22:33:44:55".into(),
            ttl: 64,
            identification: 0,
            src_ip: "192.168.1.100".into(),
            dst_ip: "192.168.1.1".into(),
            src_port: 54321,
            dst_port: 80,
            seq: 1,
            ack: 1,
            data_offset: 5,
            flag_urg: false,
            flag_ack: true,
            flag_psh: true,
            flag_rst: false,
            flag_syn: false,
            flag_fin: false,
            window_size: 8192,
            checksum: None,
            urgent_pointer: 0,
            method: "GET".into(),
            host: "example.com".into(),
            path: "/".into(),
            headers: "Connection: close".into(),
            body: String::new(),
        }
    }

    fn tcp_payload(frame: &[u8]) -> &[u8] {
        let ip_total = u16::from_be_bytes([frame[16], frame[17]]) as usize;
        &frame[54..14 + ip_total]
    }

    fn l4_self_check_sum(frame: &[u8]) -> u16 {
        let ip_total = u16::from_be_bytes([frame[16], frame[17]]) as usize;
        let segment = &frame[34..14 + ip_total];
        let mut pseudo = Vec::new();
        pseudo.extend_from_slice(&frame[26..30]);
        pseudo.extend_from_slice(&frame[30..34]);
        pseudo.push(0);
        pseudo.push(frame[14 + 9]);
        pseudo.extend_from_slice(&(segment.len() as u16).to_be_bytes());
        pseudo.extend_from_slice(segment);
        ones_complement_sum(&pseudo)
    }

    #[test]
    fn default_get_request_is_tcp_payload() {
        let frame = build_http(&sample()).unwrap();
        assert_eq!(frame[14 + 9], super::super::IP_PROTO_TCP);
        assert_eq!(&frame[34 + 2..34 + 4], &[0x00, 0x50]);
        assert_eq!(std::str::from_utf8(tcp_payload(&frame)).unwrap(), "GET / HTTP/1.1\r\nHost: example.com\r\nConnection: close\r\n\r\n");
    }

    #[test]
    fn post_request_keeps_headers_blank_line_and_body() {
        let mut spec = sample();
        spec.method = "post".into();
        spec.path = "api".into();
        spec.headers = "Content-Type: text/plain\nX-Test: yes".into();
        spec.body = "ping".into();
        let frame = build_http(&spec).unwrap();
        assert_eq!(
            std::str::from_utf8(tcp_payload(&frame)).unwrap(),
            "POST /api HTTP/1.1\r\nHost: example.com\r\nContent-Type: text/plain\r\nX-Test: yes\r\n\r\nping"
        );
    }

    #[test]
    fn invalid_http_fields_are_rejected() {
        let mut spec = sample();
        spec.method = String::new();
        assert!(build_http(&spec).is_err());

        let mut spec = sample();
        spec.host = String::new();
        assert!(build_http(&spec).is_err());

        let mut spec = sample();
        spec.headers = "BrokenHeader".into();
        assert!(build_http(&spec).is_err());

        let mut spec = sample();
        spec.headers = "Host: duplicate.example".into();
        assert!(build_http(&spec).is_err());
    }

    #[test]
    fn tcp_checksum_self_validates_with_http_payload() {
        let frame = build_http(&sample()).unwrap();
        assert_eq!(l4_self_check_sum(&frame), 0xFFFF);
    }
}
