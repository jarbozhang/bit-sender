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
import { parseHexDump, generateHexDump, isValidHexString, detectProtocolFromHex, parsePacketFields } from './hexDumpUtils';

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
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [importText, setImportText] = useState('');

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

  // ESC键关闭导入对话框
  useEffect(() => {
    const handleEscapeKey = (event) => {
      if (event.key === 'Escape') {
        if (showImportDialog) {
          setShowImportDialog(false);
          setImportText('');
        }
      }
    };

    if (showImportDialog) {
      document.addEventListener('keydown', handleEscapeKey);
      return () => {
        document.removeEventListener('keydown', handleEscapeKey);
      };
    }
  }, [showImportDialog]);

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

  // 导出为 Hex Dump 格式
  const handleExportHexDump = async () => {
    const previewHex = hexPreview(fields, proto, localMac, localIp);
    if (!previewHex) {
      showError('没有数据可导出，请先填写报文字段');
      return;
    }
    
    try {
      // 将预览的十六进制转换为连续字符串
      const hexString = previewHex.replace(/\s+/g, '');
      const hexDump = generateHexDump(hexString);
      
      // 生成默认文件名
      const defaultFileName = `packet_${proto.name}_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.txt`;
      
      // 使用 Tauri 的文件保存对话框
      const { save } = await import('@tauri-apps/plugin-dialog');
      
      const filePath = await save({
        defaultPath: defaultFileName,
        filters: [
          {
            name: 'Text Files',
            extensions: ['txt']
          },
          {
            name: 'All Files',
            extensions: ['*']
          }
        ]
      });
      
      if (filePath) {
        // 使用 Tauri 的文件系统 API 写入文件
        const { writeTextFile } = await import('@tauri-apps/plugin-fs');
        await writeTextFile(filePath, hexDump);
        
        showSuccess(`已导出到: ${filePath}`);
      }
      
    } catch (error) {
      console.error('导出失败:', error);
      const errorMessage = error?.message || error?.toString() || '未知错误';
      showError('导出失败: ' + errorMessage);
    }
  };

  // 从文件导入
  const handleImportFromFile = async () => {
    try {
      // 使用 Tauri 的文件打开对话框
      const { open } = await import('@tauri-apps/plugin-dialog');
      
      const selected = await open({
        multiple: false,
        filters: [
          {
            name: 'Text Files',
            extensions: ['txt']
          },
          {
            name: 'All Files',
            extensions: ['*']
          }
        ]
      });
      
      if (selected) {
        // 使用 Tauri 的文件系统 API 读取文件
        const { readTextFile } = await import('@tauri-apps/plugin-fs');
        const fileContent = await readTextFile(selected);
        
        // 处理导入的数据
        const success = processImportedData(fileContent);
        if (success) {
          showSuccess('文件导入成功');
          setShowImportDialog(false);
          setImportText('');
        }
      }
      
    } catch (error) {
      console.error('文件导入失败:', error);
      const errorMessage = error?.message || error?.toString() || '未知错误';
      showError('文件导入失败: ' + errorMessage);
    }
  };

  // 处理导入的数据（从文本框或文件）
  const processImportedData = (dataText) => {
    if (!dataText || !dataText.trim()) {
      showError('没有数据可导入');
      return;
    }

    try {
      // 解析 Hex Dump 格式
      const hexData = parseHexDump(dataText);
      
      if (!hexData) {
        showError('无法解析导入的数据，请检查格式');
        return;
      }

      if (!isValidHexString(hexData)) {
        showError('导入的数据不是有效的十六进制格式');
        return;
      }

      // 尝试自动识别协议
      const detectedProtocol = detectProtocolFromHex(hexData);
      if (detectedProtocol) {
        const targetProto = PROTOCOLS.find(p => p.key === detectedProtocol);
        if (targetProto) {
          // 先切换协议
          handleProtoChangeWrap({ target: { value: detectedProtocol } });
          
          // 解析字段并回填
          const parsedFields = parsePacketFields(hexData, detectedProtocol);
          if (parsedFields && Object.keys(parsedFields).length > 0) {
            // 批量更新字段
            setTimeout(() => {
              Object.entries(parsedFields).forEach(([key, value]) => {
                if (value !== undefined && value !== null && value !== '') {
                  handleFieldChangeWrap(key, value);
                }
              });
              showInfo(`自动识别为 ${targetProto.name} 协议并回填字段`);
            }, 100);
          } else {
            showInfo(`自动识别为 ${targetProto.name} 协议`);
          }
        }
      } else {
        // 如果无法识别协议，将数据作为 payload 处理
        handleFieldChangeWrap('data', hexData);
      }
      
      setShowImportDialog(false);
      setImportText('');
      return true;
    } catch (error) {
      showError('导入失败: ' + error.message);
      return false;
    }
  };

  // 处理文本框导入
  const handleImport = () => {
    processImportedData(importText);
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
      <div className="mb-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
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
        
        {/* 导入导出按钮 - 移动到右侧 */}
        <div className="flex items-center gap-1 ml-auto">
          <button
            onClick={() => setShowImportDialog(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors duration-150"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" />
            </svg>
            导入
          </button>
          <button
            onClick={handleExportHexDump}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors duration-150"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            导出
          </button>
        </div>
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
      
      {/* 导入对话框 */}
      {showImportDialog && (
        <div 
          className="fixed inset-0 bg-black/30 flex items-center justify-center z-50"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowImportDialog(false);
              setImportText('');
            }
          }}
        >
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 min-w-[500px] max-w-[700px] w-full mx-4">
            <h2 className="text-lg font-bold mb-4 text-gray-800 dark:text-gray-100">
              导入 Hex Dump 数据
            </h2>
            
            <div className="mb-4">
              <label className="block mb-2 text-sm text-gray-600 dark:text-gray-400">
                输入方式：
              </label>
              <div className="flex gap-2 mb-4">
                <button
                  onClick={handleImportFromFile}
                  className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded flex items-center gap-2"
                >
                  📁 从文件导入
                </button>
                <span className="text-gray-400 dark:text-gray-500 flex items-center">或</span>
                <span className="text-gray-600 dark:text-gray-400 flex items-center">手动粘贴</span>
              </div>
              
              <label className="block mb-2 text-sm text-gray-600 dark:text-gray-400">
                粘贴 Wireshark 导出的 Hex Dump 格式数据：
              </label>
              <div className="text-xs text-gray-500 dark:text-gray-500 mb-2">
                支持格式示例：<br/>
                <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded">
                  0000  ff ff ff ff ff ff 00 11  22 33 44 55 08 06 00 01
                </code>
              </div>
              <textarea
                className="w-full h-40 border rounded px-3 py-2 font-mono text-sm bg-gray-50 dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100"
                placeholder="0000  ff ff ff ff ff ff 00 11  22 33 44 55 08 06 00 01&#10;0010  08 00 06 04 00 01 00 11  22 33 44 55 c0 a8 01 01&#10;0020  00 00 00 00 00 00 c0 a8  01 02"
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    setShowImportDialog(false);
                    setImportText('');
                  }
                }}
              />
            </div>
            
            <div className="flex justify-end gap-2">
              <button
                className="px-4 py-2 border rounded hover:bg-gray-50 dark:hover:bg-gray-700"
                onClick={() => {
                  setShowImportDialog(false);
                  setImportText('');
                }}
              >
                取消
              </button>
              <button
                className="px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded"
                onClick={handleImport}
                disabled={!importText.trim()}
              >
                导入文本
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PacketEditor; 