import React, { useState, useEffect } from "react";
import { PROTOCOLS } from './config';
import { hexPreview } from './utils';
import { usePacketEditor } from './usePacketEditor';
import Button from '../../components/Button';
import { useToast } from '../../contexts/ToastContext';
import { useNetwork } from '../../hooks/useNetwork';
import { useNetworkInterface } from '../../contexts/NetworkInterfaceContext';
import BatchSendDialog from '../../components/BatchSendDialog';
import { FIELD_DESCRIPTIONS } from './fieldDescriptions';

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
  const { sendPacket, getNetworkInterfaces } = useNetwork();
  // 新增本机MAC/IP
  const [localMac, setLocalMac] = useState("");
  const [localIp, setLocalIp] = useState("");

  useEffect(() => {
    // 获取本机网卡信息，取第一个有效网卡
    getNetworkInterfaces().then((interfaces) => {
      if (Array.isArray(interfaces)) {
        const iface = interfaces.find(i => i.mac && i.mac !== "00:00:00:00:00:00" && i.addresses && i.addresses.length > 0);
        if (iface) {
          setLocalMac(iface.mac);
          const ipv4 = (iface.addresses || []).find(addr => /^\d+\.\d+\.\d+\.\d+$/.test(addr));
          setLocalIp(ipv4);
        }
      }
    });
  }, []);


  const [isTestSending, setIsTestSending] = useState(false);
  const { selectedInterface, setShowSelectModal } = useNetworkInterface();
  const [isTested, setIsTested] = useState(false);
  const [pendingSend, setPendingSend] = useState(false);
  const [showBatchDialog, setShowBatchDialog] = useState(false);
  const [batchStatus, setBatchStatus] = useState(null); // mock 统计数据
  const [batchMode, setBatchMode] = useState('setup'); // 'setup' | 'stats'
  const [showTooltip, setShowTooltip] = useState(null);

  const dataField = proto.fields.find(f => f.key === 'data');
  const headerFields = proto.fields.filter(f => f.key !== 'data');


  // 新增：监听 selectedInterface 变化，自动更新 localMac/localIp
  useEffect(() => {
    if (selectedInterface) {
      console.log("🚀 ~ useEffect ~ selectedInterface:", selectedInterface)
      setLocalMac(selectedInterface.mac || "");
      const ipv4 = (selectedInterface.addresses || []).find(addr => /^\d+\.\d+\.\d+\.\d+$/.test(addr));
      setLocalIp(ipv4 || "");
    }
  }, [selectedInterface]);

  const handleTestSend = async () => {
    doTestSend();
  };

  const doTestSend = async () => {
    const netIf = selectedInterface;
    if (!netIf) {
      setPendingSend(true);
      setShowSelectModal(true);
      return;
    }
    setIsTestSending(true);
    try {
      const completeFields = {};
      proto.fields.forEach(f => {
        let value = (fields[f.key] === undefined || fields[f.key] === null || String(fields[f.key]).trim() === '')
          ? f.placeholder
          : fields[f.key];
        
        // 处理动态占位符
        if (value === "__LOCAL_MAC__") {
          value = localMac;
        } else if (value === "__LOCAL_IP__") {
          value = localIp;
        }
        
        completeFields[f.key] = value;
      });
      // 处理payload数据，确保与预览一致
      let processedPayload = null;
      if (completeFields.data) {
        const dataValue = completeFields.data.trim();
        if (dataValue) {
          // 使用与hexPreview相同的逻辑处理数据
          const isHexData = /^[0-9a-fA-F\s]*$/.test(dataValue) && dataValue.replace(/\s/g, '').length % 2 === 0;
          if (proto.key === "tcp" || proto.key === "udp") {
            if (isHexData) {
              // 已经是十六进制格式
              processedPayload = dataValue.replace(/\s/g, '');
            } else {
              // 转换字符串为十六进制
              processedPayload = dataValue
                .split('')
                .map(c => c.charCodeAt(0).toString(16).padStart(2, '0'))
                .join('');
            }
          } else {
            // 其他协议只允许十六进制
            if (isHexData) {
              processedPayload = dataValue.replace(/\s/g, '');
            } else {
              throw new Error(`协议 ${proto.key} 只支持十六进制数据格式`);
            }
          }
        }
      }
      
      const packetData = {
        protocol: proto.key,
        fields: completeFields,
        payload: processedPayload
      };
      const result = await sendPacket(packetData, netIf?.name || netIf);
      showSuccess(result.message);
      setIsTested(true);
    } catch (error) {
      showError(error.message);
    } finally {
      setIsTestSending(false);
    }
  };

  useEffect(() => {
    if (pendingSend && selectedInterface) {
      setPendingSend(false);
      doTestSend();
    }
  }, [pendingSend, selectedInterface]);

  const handleBatchSend = () => {
    setShowBatchDialog(true);
    setBatchMode('setup');
  };

  // 批量发送弹框确认
  const handleBatchConfirm = (frequency) => {
    // 不关闭弹框，切换到统计信息模式
    setBatchMode('stats');
    setBatchStatus({
      startTime: new Date().toLocaleTimeString(),
      sentCount: 0,
      speed: frequency,
    });
    showInfo(`已提交批量发送任务，频率：${frequency} 次/秒`);
  };

  // 结束任务
  const handleBatchStop = () => {
    setBatchStatus(null);
    setShowBatchDialog(false);
    setBatchMode('setup');
    showInfo('批量发送任务已结束');
  };

  // 取消弹框
  const handleBatchCancel = () => {
    setShowBatchDialog(false);
    setBatchMode('setup');
  };

  // 编辑内容时重置测试状态
  const handleProtoChangeWrap = (e) => {
    setIsTested(false);
    handleProtoChange(e);
  };
  const handleFieldChangeWrap = (key, value, maxLength) => {
    setIsTested(false);
    handleFieldChange(key, value, maxLength);
  };
  const handleRuleChangeWrap = (key, value) => {
    setIsTested(false);
    handleRuleChange(key, value);
  };

  // 构造当前报文数据
  const getCurrentPacketData = () => {
    const completeFields = {};
    proto.fields.forEach(f => {
      let value = (fields[f.key] === undefined || fields[f.key] === null || String(fields[f.key]).trim() === '')
        ? f.placeholder
        : fields[f.key];
      
      // 处理动态占位符
      if (value === "__LOCAL_MAC__") {
        value = localMac;
      } else if (value === "__LOCAL_IP__") {
        value = localIp;
      }
      
      completeFields[f.key] = value;
    });
    // 处理payload数据，确保与预览一致
    let processedPayload = null;
    if (completeFields.data) {
      const dataValue = completeFields.data.trim();
      if (dataValue) {
        // 使用与hexPreview相同的逻辑处理数据
        const isHexData = /^[0-9a-fA-F\s]*$/.test(dataValue) && dataValue.replace(/\s/g, '').length % 2 === 0;
        if (proto.key === "tcp" || proto.key === "udp") {
          if (isHexData) {
            // 已经是十六进制格式
            processedPayload = dataValue.replace(/\s/g, '');
          } else {
            // 转换字符串为十六进制
            processedPayload = dataValue
              .split('')
              .map(c => c.charCodeAt(0).toString(16).padStart(2, '0'))
              .join('');
          }
        } else {
          // 其他协议只允许十六进制
          if (isHexData) {
            processedPayload = dataValue.replace(/\s/g, '');
          } else {
            // 对于非TCP/UDP协议，如果不是十六进制，则返回原始数据
            processedPayload = dataValue.replace(/\s/g, '');
          }
        }
      }
    }
    
    return {
      protocol: proto.key,
      fields: completeFields,
      payload: processedPayload
    };
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md border border-gray-200 dark:border-gray-700 p-8">
      <div className="mb-4 flex items-center gap-4">
        <label className="font-medium text-gray-700 dark:text-gray-300">协议类型：</label>
        <select
          className="border rounded px-2 py-1 bg-gray-50 dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100"
          value={proto.key}
          onChange={handleProtoChangeWrap}
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
          <div key={f.key} className="flex flex-col gap-1 relative">
            <label className="font-medium text-gray-700 dark:text-gray-300 flex items-center gap-2">
              {f.label}
              {FIELD_DESCRIPTIONS[f.key] && (
                <div className="relative inline-block">
                  <button
                    type="button"
                    className="w-4 h-4 rounded-full bg-blue-500 text-white text-xs flex items-center justify-center hover:bg-blue-600 transition-colors"
                    onMouseEnter={() => setShowTooltip(f.key)}
                    onMouseLeave={() => setShowTooltip(null)}
                    onClick={() => setShowTooltip(showTooltip === f.key ? null : f.key)}
                  >
                    ?
                  </button>
                  {showTooltip === f.key && (
                    <div className="absolute z-50 w-80 p-3 mt-1 text-sm bg-gray-900 text-white rounded-lg shadow-lg border left-0 top-full">
                      <div className="absolute -top-1 left-3 w-2 h-2 bg-gray-900 rotate-45"></div>
                      {FIELD_DESCRIPTIONS[f.key]}
                    </div>
                  )}
                </div>
              )}
            </label>
            <input
              className="border rounded px-2 py-1 bg-gray-50 dark:bg-gray-700 border-gray-300 dark:border-gray-600 focus:ring-blue-500 focus:border-blue-500 text-gray-900 dark:text-gray-100"
              type={f.type}
              placeholder={
                f.placeholder === "__LOCAL_MAC__" ? localMac :
                f.placeholder === "__LOCAL_IP__" ? localIp :
                f.placeholder
              }
              value={fields[f.key] || ""}
              maxLength={f.maxLength}
              onChange={(e) => handleFieldChangeWrap(f.key, e.target.value, f.maxLength)}
              onPaste={(e) => {
                const paste = (e.clipboardData || window.clipboardData).getData('text');
                if (paste.length > f.maxLength) {
                  alert(`粘贴内容超出最大长度（${f.maxLength}）！`);
                  e.preventDefault();
                }
              }}
            />
          </div>
        ))}
      </div>

      {dataField && (
        <div className="mt-4 relative">
          <label className="font-medium text-gray-700 dark:text-gray-300 flex items-center gap-2">
            {dataField.label}
            {FIELD_DESCRIPTIONS[dataField.key] && (
              <div className="relative inline-block">
                <button
                  type="button"
                  className="w-4 h-4 rounded-full bg-blue-500 text-white text-xs flex items-center justify-center hover:bg-blue-600 transition-colors"
                  onMouseEnter={() => setShowTooltip(dataField.key)}
                  onMouseLeave={() => setShowTooltip(null)}
                  onClick={() => setShowTooltip(showTooltip === dataField.key ? null : dataField.key)}
                >
                  ?
                </button>
                {showTooltip === dataField.key && (
                  <div className="absolute z-50 w-80 p-3 mt-1 text-sm bg-gray-900 text-white rounded-lg shadow-lg border left-0 top-full">
                    <div className="absolute -top-1 left-3 w-2 h-2 bg-gray-900 rotate-45"></div>
                    {FIELD_DESCRIPTIONS[dataField.key]}
                  </div>
                )}
              </div>
            )}
          </label>
          <textarea
            className="border rounded px-2 py-1 mt-1 w-full font-mono text-sm bg-gray-50 dark:bg-gray-700 border-gray-300 dark:border-gray-600 focus:ring-blue-500 focus:border-blue-500 text-gray-900 dark:text-gray-100"
            rows="5"
            placeholder={
              dataField.placeholder === "__LOCAL_MAC__" ? localMac :
              dataField.placeholder === "__LOCAL_IP__" ? localIp :
              dataField.placeholder
            }
            value={fields.data || ""}
            maxLength={dataField.maxLength}
            onChange={(e) => handleFieldChangeWrap(dataField.key, e.target.value, dataField.maxLength)}
          />
        </div>
      )}

      <div className="mt-6">
        <label className="font-medium text-gray-700 dark:text-gray-300">报文内容预览（16进制）</label>
        <pre className="bg-gray-100 dark:bg-gray-900 rounded p-3 font-mono text-sm mt-2 whitespace-pre-wrap break-words text-gray-600 dark:text-gray-400">
          {hexPreview(fields, proto, localMac, localIp) || <span className="text-gray-500">请填写字段以预览报文内容</span>}
        </pre>
      </div>

      {/* 操作按钮区域 */}
      <div className="mt-8 pt-6 border-t border-gray-200 dark:border-gray-700">
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Button
            variant={isTested ? "secondary" : "primary"}
            size="lg"
            loading={isTestSending}
            onClick={handleTestSend}
            className="flex-1 sm:flex-none"
          >
            {isTestSending ? "发送中..." : "测试发送"}
          </Button>
          <Button
            variant={isTested ? "primary" : "secondary"}
            size="lg"
            onClick={() => {
              if (!isTested) {
                showError("测试发送成功之后才能批量发送");
                return;
              }
              handleBatchSend();
            }}
            className={`flex-1 sm:flex-none ${!isTested ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            批量发送
          </Button>
        </div>
      </div>
      <BatchSendDialog
        visible={showBatchDialog}
        onConfirm={handleBatchConfirm}
        onCancel={handleBatchCancel}
        status={batchMode === 'stats' ? batchStatus : null}
        onStop={handleBatchStop}
        packetData={getCurrentPacketData()}
        interfaceName={selectedInterface?.name}
      />
    </div>
  );
};

export default PacketEditor; 