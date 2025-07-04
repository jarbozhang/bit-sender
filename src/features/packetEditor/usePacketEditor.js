import { useState } from 'react';
import { PROTOCOLS } from './config';

export const usePacketEditor = () => {
  const [proto, setProto] = useState(PROTOCOLS[0]);
  const [fields, setFields] = useState({});

  const handleProtoChange = (e) => {
    const p = PROTOCOLS.find((x) => x.key === e.target.value);
    setProto(p);
    setFields({});
  };

  const handleFieldChange = (key, value, maxLength) => {
    const fieldConfig = proto.fields.find(f => f.key === key);
    if (!fieldConfig) return;

    let sanitizedValue = value;

    // 1. Sanitize characters based on field
    if (typeof value === 'string') {
        let regex;
        if (key.toLowerCase().includes('mac')) {
            regex = /[^0-9a-fA-F:]/g;
        } else if (key.toLowerCase().includes('ip')) {
            regex = /[^0-9.]/g;
        } else if (fieldConfig.type === 'number') {
            regex = /[^0-9]/g;
        } else if (key.toLowerCase().includes('type')) {
            regex = /[^0-9a-fA-Fx]/g;
        }
        
        if (regex) {
            sanitizedValue = value.replace(regex, '');
        }
        // 自动格式化 MAC 地址为冒号分隔
        if (key.toLowerCase().includes('mac')) {
            let raw = sanitizedValue.replace(/[^0-9a-fA-F]/g, '').toUpperCase();
            if (raw.length === 12) {
                sanitizedValue = raw.match(/.{1,2}/g).join(':');
            }
        }
        // 非TCP/UDP协议的payload字段，自动格式化为16进制分组显示
        if ((key === 'data' || key === 'payload') && proto.key !== 'tcp' && proto.key !== 'udp') {
            let raw = sanitizedValue.replace(/[^0-9a-fA-F]/g, '').toUpperCase();
            let grouped = raw.match(/.{1,2}/g) || [];
            let lines = [];
            for (let i = 0; i < grouped.length; i += 16) {
                lines.push(grouped.slice(i, i + 16).join(' '));
            }
            sanitizedValue = lines.join('\n');
        }
    }

    // 2. Enforce maxLength
    if (typeof sanitizedValue === "string" && sanitizedValue.length > maxLength) {
        sanitizedValue = sanitizedValue.substring(0, maxLength);
    }

    // 3. Prepare final value (parse to number if needed)
    let finalValue = sanitizedValue;
    if (fieldConfig.type === 'number') {
        finalValue = sanitizedValue === '' ? '' : parseInt(sanitizedValue, 10);
        if (isNaN(finalValue)) {
            finalValue = ''; // Reset to empty if parsing fails (e.g., empty input)
        }
    }
    
    setFields((prev) => ({ ...prev, [key]: finalValue }));
  };

  return {
    proto,
    fields,
    handleProtoChange,
    handleFieldChange,
  };
}; 