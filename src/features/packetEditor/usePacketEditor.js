import { useState } from 'react';
import { PROTOCOLS } from './config';

export const usePacketEditor = () => {
  const [proto, setProto] = useState(PROTOCOLS[0]);
  const [fields, setFields] = useState({});
  const [rules, setRules] = useState({});

  const handleProtoChange = (e) => {
    const p = PROTOCOLS.find((x) => x.key === e.target.value);
    setProto(p);
    setFields({});
    setRules({});
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

  const handleRuleChange = (key, value) => {
    setRules((prev) => ({ ...prev, [key]: value }));
  };

  return {
    proto,
    fields,
    rules,
    handleProtoChange,
    handleFieldChange,
    handleRuleChange,
  };
}; 