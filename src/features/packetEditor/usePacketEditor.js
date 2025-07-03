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
    if (typeof value === "string" && value.length > maxLength) {
      alert(`输入内容超出最大长度（${maxLength}）！`);
      return;
    }
    setFields((prev) => ({ ...prev, [key]: value }));
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