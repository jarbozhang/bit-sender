import React, { useState } from "react";
import { PROTOCOLS, RULES } from './config';
import { hexPreview } from './utils';
import { usePacketEditor } from './usePacketEditor';
import Button from '../../components/Button';
import { useToast } from '../../contexts/ToastContext';
import { useNetwork } from '../../hooks/useNetwork';

const PacketEditor = () => {
  const {
    proto,
    fields,
    rules,
    handleProtoChange,
    handleFieldChange,
    handleRuleChange,
  } = usePacketEditor();

  const { showSuccess, showError, showInfo } = useToast();
  const { sendPacket } = useNetwork();
  const [isTestSending, setIsTestSending] = useState(false);

  const dataField = proto.fields.find(f => f.key === 'data');
  const headerFields = proto.fields.filter(f => f.key !== 'data');

  const handleTestSend = async () => {
    setIsTestSending(true);
    try {
      // 构建报文数据
      const packetData = {
        protocol: proto.key,
        fields: { ...fields },
        payload: fields.data || null
      };

      const result = await sendPacket(packetData);
      showSuccess(result.message);
    } catch (error) {
      showError(error.message);
    } finally {
      setIsTestSending(false);
    }
  };

  const handleBatchSend = () => {
    // TODO: 跳转到发送与抓包页面
    showInfo("即将跳转到发送与抓包页面...");
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md border border-gray-200 dark:border-gray-700 p-8">
      <div className="mb-4 flex items-center gap-4">
        <label className="font-medium text-gray-700 dark:text-gray-300">协议类型：</label>
        <select
          className="border rounded px-2 py-1 bg-gray-50 dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100"
          value={proto.key}
          onChange={handleProtoChange}
        >
          {PROTOCOLS.map((p) => (
            <option key={p.key} value={p.key} className="text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-700">
              {p.name}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {headerFields.map((f) => (
          <div key={f.key} className="flex flex-col gap-1">
            <label className="font-medium text-gray-700 dark:text-gray-300">{f.label}</label>
            <input
              className="border rounded px-2 py-1 bg-gray-50 dark:bg-gray-700 border-gray-300 dark:border-gray-600 focus:ring-blue-500 focus:border-blue-500 text-gray-900 dark:text-gray-100"
              type={f.type}
              placeholder={f.placeholder}
              value={fields[f.key] || ""}
              maxLength={f.maxLength}
              onChange={(e) => handleFieldChange(f.key, e.target.value, f.maxLength)}
              onPaste={(e) => {
                const paste = (e.clipboardData || window.clipboardData).getData('text');
                if (paste.length > f.maxLength) {
                  alert(`粘贴内容超出最大长度（${f.maxLength}）！`);
                  e.preventDefault();
                }
              }}
            />
            <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 mt-1">
              <span>规则：</span>
              <select
                className="border rounded px-1 py-0.5 bg-gray-50 dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100"
                value={rules[f.key] || "fixed"}
                onChange={(e) => handleRuleChange(f.key, e.target.value)}
              >
                {RULES.map((r) => (
                  <option key={r.value} value={r.value} className="text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-700">
                    {r.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        ))}
      </div>

      {dataField && (
        <div className="mt-4">
          <label className="font-medium text-gray-700 dark:text-gray-300">{dataField.label}</label>
          <textarea
            className="border rounded px-2 py-1 mt-1 w-full font-mono text-sm bg-gray-50 dark:bg-gray-700 border-gray-300 dark:border-gray-600 focus:ring-blue-500 focus:border-blue-500 text-gray-900 dark:text-gray-100"
            rows="5"
            placeholder={dataField.placeholder}
            value={fields.data || ""}
            maxLength={dataField.maxLength}
            onChange={(e) =>
              handleFieldChange(dataField.key, e.target.value, dataField.maxLength)
            }
          />
        </div>
      )}

      <div className="mt-6">
        <label className="font-medium text-gray-700 dark:text-gray-300">报文内容预览（16进制）</label>
        <pre className="bg-gray-100 dark:bg-gray-900 rounded p-3 font-mono text-sm mt-2 whitespace-pre-wrap break-words text-gray-600 dark:text-gray-400">
          {hexPreview(fields, proto) || <span className="text-gray-500">请填写字段以预览报文内容</span>}
        </pre>
      </div>

      {/* 操作按钮区域 */}
      <div className="mt-8 pt-6 border-t border-gray-200 dark:border-gray-700">
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Button
            variant="primary"
            size="lg"
            loading={isTestSending}
            onClick={handleTestSend}
            className="flex-1 sm:flex-none"
          >
            {isTestSending ? "发送中..." : "测试发送"}
          </Button>
          <Button
            variant="secondary"
            size="lg"
            onClick={handleBatchSend}
            className="flex-1 sm:flex-none"
          >
            批量发送
          </Button>
        </div>
      </div>
    </div>
  );
};

export default PacketEditor; 