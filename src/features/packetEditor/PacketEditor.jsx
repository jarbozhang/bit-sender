import React, { useState, useEffect } from "react";
import { PROTOCOLS } from './config';
import { hexPreview } from './utils';
import { usePacketEditor } from './usePacketEditor';
import Button from '../../components/Button';
import CustomSelect from '../../components/CustomSelect';
import { useToast } from '../../contexts/ToastContext';
import { useNetwork } from '../../hooks/useNetwork';
import { useNetworkInterface } from '../../contexts/NetworkInterfaceContext';
import { useLanguage } from '../../hooks/useLanguage';
import { useTranslation } from '../../locales';
import BatchSendDialog from '../../components/BatchSendDialog';
import { FIELD_DESCRIPTIONS } from './fieldDescriptions';
import { parseHexDump, generateHexDump, isValidHexString, detectProtocolFromHex, parsePacketFields } from './hexDumpUtils';
import { initializeDefaultTemplates } from '../templateManager/defaultTemplates';

const PacketEditor = () => {
  const {
    proto,
    fields,
    rules,
    handleProtoChange,
    handleFieldChange,
    handleRuleChange,
  } = usePacketEditor();

  const { language } = useLanguage();
  const { t } = useTranslation(language);
  const { showSuccess, showError, showInfo, showSmartError } = useToast();
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
  const [showToolsMenu, setShowToolsMenu] = useState(false);
  
  // 模板管理状态 (从TemplateManager移过来)
  const [templates, setTemplates] = useState([]);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [showLoadDialog, setShowLoadDialog] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [templateDescription, setTemplateDescription] = useState('');
  const [templateTags, setTemplateTags] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

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
      showSmartError(error.message);
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

  // 加载模板
  useEffect(() => {
    loadTemplates();
  }, []);

  const loadTemplates = () => {
    try {
      const allTemplates = initializeDefaultTemplates();
      setTemplates(allTemplates);
    } catch (error) {
      console.error('加载模板失败:', error);
      showError(language === 'zh-CN' ? '加载模板失败' : 'Failed to load templates');
    }
  };

  const saveTemplates = (newTemplates) => {
    try {
      localStorage.setItem('packet-templates', JSON.stringify(newTemplates));
      setTemplates(newTemplates);
    } catch (error) {
      console.error('保存模板失败:', error);
      showError(language === 'zh-CN' ? '保存模板失败' : 'Failed to save templates');
    }
  };

  // ESC键关闭对话框、点击外部关闭工具菜单、模态框滚动锁定
  useEffect(() => {
    const handleEscapeKey = (event) => {
      if (event.key === 'Escape') {
        if (showImportDialog) {
          setShowImportDialog(false);
          setImportText('');
        }
        if (showSaveDialog) {
          setShowSaveDialog(false);
          setTemplateName('');
          setTemplateDescription('');
          setTemplateTags('');
        }
        if (showLoadDialog) {
          setShowLoadDialog(false);
          setSearchTerm('');
        }
        if (showToolsMenu) {
          setShowToolsMenu(false);
        }
      }
    };

    const handleClickOutside = (event) => {
      if (showToolsMenu && !event.target.closest('.tools-menu-container')) {
        setShowToolsMenu(false);
      }
    };

    // 模态框滚动锁定
    if (showImportDialog || showSaveDialog || showLoadDialog) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }

    document.addEventListener('keydown', handleEscapeKey);
    document.addEventListener('click', handleClickOutside);
    
    return () => {
      document.removeEventListener('keydown', handleEscapeKey);
      document.removeEventListener('click', handleClickOutside);
      // 清理时恢复滚动
      document.body.style.overflow = 'unset';
    };
  }, [showImportDialog, showSaveDialog, showLoadDialog, showToolsMenu]);

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
    showInfo(t('batchSend.taskStarted', {}, { frequency }));
  };

  // 结束任务
  const handleBatchStop = () => {
    setBatchStatus(null);
    setShowBatchDialog(false);
    setBatchMode('setup');
    showInfo(t('batchSend.taskEnded'));
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
      showError(t('export.noData'));
      return;
    }
    
    try {
      // 将预览的十六进制转换为连续字符串
      const hexString = previewHex.replace(/\s+/g, '');
      const hexDump = generateHexDump(hexString);
      
      // 生成默认文件名
      const defaultFileName = `packet_${proto.key}_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.txt`;
      
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
        
        showSuccess(t('export.success', {}, { path: filePath }));
      }
      
    } catch (error) {
      console.error('导出失败:', error);
      const errorMessage = error?.message || error?.toString() || '未知错误';
      showError(t('export.error', {}, { error: errorMessage }));
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
          showSuccess(t('import.fileImportSuccess'));
          setShowImportDialog(false);
          setImportText('');
        }
      }
      
    } catch (error) {
      console.error('文件导入失败:', error);
      const errorMessage = error?.message || error?.toString() || '未知错误';
      showError(t('import.fileImportError') + ': ' + errorMessage);
    }
  };

  // 处理导入的数据（从文本框或文件）
  const processImportedData = (dataText) => {
    if (!dataText || !dataText.trim()) {
      showError(t('import.noData'));
      return;
    }

    try {
      // 解析 Hex Dump 格式
      const hexData = parseHexDump(dataText);
      
      if (!hexData) {
        showError(t('import.parseError'));
        return;
      }

      if (!isValidHexString(hexData)) {
        showError(t('import.invalidHex'));
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
              showInfo(t('import.autoDetectedWithFields', {}, { protocol: t(targetProto.nameKey) }));
            }, 100);
          } else {
            showInfo(t('import.autoDetected', {}, { protocol: t(targetProto.nameKey) }));
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
      showError((language === 'zh-CN' ? '导入失败: ' : 'Import failed: ') + error.message);
      return false;
    }
  };

  // 处理文本框导入
  const handleImport = () => {
    processImportedData(importText);
  };

  // 加载模板
  const handleLoadTemplate = (template) => {
    // 切换协议
    handleProtoChangeWrap({ target: { value: template.protocol } });
    
    // 延迟填充字段，确保协议切换完成
    setTimeout(() => {
      Object.entries(template.fields).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
          // 检查是否是动态占位符，如果是则不填充，保持空值让系统使用占位符
          if (value === '__LOCAL_MAC__' || value === '__LOCAL_IP__') {
            // 对于动态占位符，我们清空字段值，这样系统会使用占位符
            handleFieldChangeWrap(key, '');
          } else {
            handleFieldChangeWrap(key, value);
          }
        }
      });
    }, 100);
  };

  // 保存模板
  const handleSaveTemplate = () => {
    if (!templateName.trim()) {
      showError(t('template.nameRequired'));
      return;
    }

    const currentPacket = getCurrentPacketData();
    if (!currentPacket.protocol || !currentPacket.fields) {
      showError(language === 'zh-CN' ? '当前没有有效的数据包配置' : 'No valid packet configuration available');
      return;
    }

    // 处理字段值，将本机MAC/IP恢复为占位符
    const processedFields = {};
    Object.entries(currentPacket.fields).forEach(([key, value]) => {
      if (typeof value === 'string' && value.trim() !== '') {
        if (key.toLowerCase().includes('mac') && /^[0-9a-fA-F]{2}:[0-9a-fA-F]{2}:[0-9a-fA-F]{2}:[0-9a-fA-F]{2}:[0-9a-fA-F]{2}:[0-9a-fA-F]{2}$/i.test(value)) {
          if (['src_mac', 'srcmac', 'source_mac'].includes(key.toLowerCase())) {
            processedFields[key] = '__LOCAL_MAC__';
            return;
          }
        }
        if (key.toLowerCase().includes('ip') && /^\d+\.\d+\.\d+\.\d+$/.test(value)) {
          if (['src_ip', 'srcip', 'source_ip'].includes(key.toLowerCase())) {
            processedFields[key] = '__LOCAL_IP__';
            return;
          }
        }
      }
      processedFields[key] = value;
    });

    const newTemplate = {
      id: Date.now().toString(),
      name: templateName.trim(),
      description: templateDescription.trim(),
      protocol: currentPacket.protocol,
      fields: processedFields,
      tags: templateTags.split(',').map(tag => tag.trim()).filter(tag => tag),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const existingIndex = templates.findIndex(t => t.name === newTemplate.name);
    let newTemplates;
    
    if (existingIndex >= 0) {
      newTemplates = [...templates];
      newTemplates[existingIndex] = { ...newTemplates[existingIndex], ...newTemplate, updatedAt: new Date().toISOString() };
      showSuccess(t('template.updateSuccess'));
    } else {
      newTemplates = [...templates, newTemplate];
      showSuccess(t('template.saveSuccess'));
    }

    saveTemplates(newTemplates);
    setShowSaveDialog(false);
    setTemplateName('');
    setTemplateDescription('');
    setTemplateTags('');
  };

  // 加载选中的模板
  const handleLoadFromTemplateList = (template) => {
    handleLoadTemplate(template);
    setShowLoadDialog(false);
    showInfo(t('template.loadSuccess') + `：${template.name}`);
  };

  // 删除模板
  const handleDeleteTemplate = (templateId) => {
    if (window.confirm(t('template.deleteConfirm'))) {
      const newTemplates = templates.filter(t => t.id !== templateId);
      saveTemplates(newTemplates);
      showSuccess(t('template.deleteSuccess'));
    }
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
          <label className="font-medium text-gray-700 dark:text-gray-300">{t('packet.protocol')}：</label>
          <CustomSelect
            value={proto.key}
            onChange={handleProtoChangeWrap}
            options={PROTOCOLS.map((p) => ({
              value: p.key,
              label: t(p.nameKey || p.name)
            }))}
            placeholder={t('packet.selectProtocol')}
          />
        </div>
        
        {/* 工具菜单按钮 */}
        <div className="relative ml-auto tools-menu-container">
          <button
            onClick={() => setShowToolsMenu(!showToolsMenu)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors duration-150"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
            </svg>
            {t('packet.tools')}
            <svg className={`w-3 h-3 transition-transform duration-150 ${showToolsMenu ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {/* 工具菜单下拉框 */}
          {showToolsMenu && (
            <div className="absolute right-0 top-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-md shadow-lg z-20 min-w-[200px]">
              <div className="py-1">
                {/* 模板管理 */}
                <div className="px-3 py-2 text-xs font-medium text-gray-500 dark:text-gray-400 border-b border-gray-100 dark:border-gray-700">
                  {t('packet.templateManager')}
                </div>
                <button
                  onClick={() => {
                    setShowSaveDialog(true);
                    setShowToolsMenu(false);
                  }}
                  className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                  {t('packet.saveTemplate')}
                </button>
                <button
                  onClick={() => {
                    setShowLoadDialog(true);
                    setShowToolsMenu(false);
                  }}
                  className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" />
                  </svg>
                  {t('packet.loadTemplate')} ({templates.length})
                </button>

                {/* 分隔线 */}
                <div className="border-t border-gray-100 dark:border-gray-700 my-1"></div>

                {/* 导入导出 */}
                <div className="px-3 py-2 text-xs font-medium text-gray-500 dark:text-gray-400 border-b border-gray-100 dark:border-gray-700">
                  {t('packet.dataExchange')}
                </div>
                <button
                  onClick={() => {
                    setShowImportDialog(true);
                    setShowToolsMenu(false);
                  }}
                  className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" />
                  </svg>
                  {t('packet.importPacket')}
                </button>
                <button
                  onClick={() => {
                    handleExportHexDump();
                    setShowToolsMenu(false);
                  }}
                  className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                  {t('packet.exportPacket')}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {headerFields.map((f) => (
          <div key={f.key} className="flex flex-col gap-1 relative">
            <label className="font-medium text-gray-700 dark:text-gray-300 flex items-center gap-2">
              {t(f.labelKey || f.label)}
              {t(`fields.${f.key}`, '') && (
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
                      {t(`fields.${f.key}`)}
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
            {t(dataField.labelKey || dataField.label)}
            {t(`fields.${dataField.key}`, '') && (
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
                    {t(`fields.${dataField.key}`)}
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
        <label className="font-medium text-gray-700 dark:text-gray-300">{t('packet.preview')}</label>
        <pre className="bg-gray-100 dark:bg-gray-900 rounded p-3 font-mono text-sm mt-2 whitespace-pre-wrap break-words text-gray-600 dark:text-gray-400">
          {hexPreview(fields, proto, localMac, localIp) || <span className="text-gray-500">{t('packet.previewPlaceholder')}</span>}
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
            {isTestSending ? t('packet.sending') : t('packet.testSend')}
          </Button>
          <Button
            variant={isTested ? "primary" : "secondary"}
            size="lg"
            onClick={() => {
              if (!isTested) {
                showError(t('packet.testSuccess'));
                return;
              }
              handleBatchSend();
            }}
            className={`flex-1 sm:flex-none ${!isTested ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            {t('packet.batchSend')}
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
              {t('import.title')}
            </h2>
            
            <div className="mb-4">
              <label className="block mb-2 text-sm text-gray-600 dark:text-gray-400">
                {t('import.inputMethod')}：
              </label>
              <div className="flex gap-2 mb-4">
                <button
                  onClick={handleImportFromFile}
                  className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded flex items-center gap-2"
                >
                  📁 {t('import.fromFile')}
                </button>
                <span className="text-gray-400 dark:text-gray-500 flex items-center">{t('import.or')}</span>
                <span className="text-gray-600 dark:text-gray-400 flex items-center">{t('import.manualPaste')}</span>
              </div>
              
              <label className="block mb-2 text-sm text-gray-600 dark:text-gray-400">
                {t('import.placeholder')}
              </label>
              <div className="text-xs text-gray-500 dark:text-gray-500 mb-2">
                {t('import.formatExample')}<br/>
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
                {t('common.cancel')}
              </button>
              <button
                className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded"
                onClick={handleImport}
                disabled={!importText.trim()}
              >
                {t('import.importText')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 保存模板对话框 */}
      {showSaveDialog && (
        <div 
          className="fixed inset-0 bg-black/30 flex items-center justify-center z-50"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowSaveDialog(false);
              setTemplateName('');
              setTemplateDescription('');
              setTemplateTags('');
            }
          }}
        >
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 min-w-[500px] max-w-[600px] w-full mx-4">
            <h2 className="text-lg font-bold mb-4 text-gray-800 dark:text-gray-100">
              {t('template.save')}
            </h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  {t('template.name')} <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                  placeholder={t('template.namePlaceholder')}
                  value={templateName}
                  onChange={(e) => setTemplateName(e.target.value)}
                  maxLength={50}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  {t('template.description')}
                </label>
                <textarea
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                  placeholder={t('template.descriptionPlaceholder')}
                  value={templateDescription}
                  onChange={(e) => setTemplateDescription(e.target.value)}
                  rows={3}
                  maxLength={200}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  {t('template.tags')}
                </label>
                <input
                  type="text"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                  placeholder={t('template.tagsPlaceholder')}
                  value={templateTags}
                  onChange={(e) => setTemplateTags(e.target.value)}
                />
              </div>
            </div>
            
            <div className="flex justify-end gap-2 mt-6">
              <button
                className="px-4 py-2 border rounded-md hover:bg-gray-50 dark:hover:bg-gray-700"
                onClick={() => {
                  setShowSaveDialog(false);
                  setTemplateName('');
                  setTemplateDescription('');
                  setTemplateTags('');
                }}
              >
                {t('common.cancel')}
              </button>
              <button
                className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-md"
                onClick={handleSaveTemplate}
                disabled={!templateName.trim()}
              >
                {t('common.save')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 加载模板对话框 */}
      {showLoadDialog && (
        <div 
          className="fixed inset-0 bg-black/30 flex items-center justify-center z-50"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowLoadDialog(false);
              setSearchTerm('');
            }
          }}
        >
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 min-w-[700px] max-w-[800px] w-full mx-4 max-h-[80vh] flex flex-col">
            <h2 className="text-lg font-bold mb-4 text-gray-800 dark:text-gray-100">
              {t('template.load')}
            </h2>
            
            {/* 搜索框 */}
            <div className="mb-4">
              <input
                type="text"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                placeholder={t('template.searchPlaceholder')}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>

            {/* 模板列表 */}
            <div className="flex-1 overflow-y-auto">
              {templates.filter(template => 
                template.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                template.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
                template.tags.some(tag => tag.toLowerCase().includes(searchTerm.toLowerCase()))
              ).length === 0 ? (
                <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                  {templates.length === 0 ? t('template.noTemplates') : t('template.noMatchingTemplates')}
                </div>
              ) : (
                <div className="space-y-3">
                  {templates.filter(template => 
                    template.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                    template.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
                    template.tags.some(tag => tag.toLowerCase().includes(searchTerm.toLowerCase()))
                  ).map((template) => (
                    <div
                      key={template.id}
                      className="border border-gray-200 dark:border-gray-600 rounded-lg p-4 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                    >
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <h3 className="font-semibold text-gray-900 dark:text-gray-100">
                              {template.name}
                            </h3>
                            <span className="px-2 py-1 text-xs bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 rounded">
                              {template.protocol}
                            </span>
                          </div>
                          
                          {template.description && (
                            <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                              {template.description}
                            </p>
                          )}
                          
                          <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-gray-500">
                            <span>{t('template.created')}: {new Date(template.createdAt).toLocaleDateString()}</span>
                            <span>{t('template.fields')}: {Object.keys(template.fields).length} {language === 'zh-CN' ? '个' : ''}</span>
                            {template.tags.length > 0 && (
                              <div className="flex gap-1">
                                {template.tags.map((tag, index) => (
                                  <span key={index} className="px-1 py-0.5 bg-gray-200 dark:bg-gray-600 rounded text-xs">
                                    {tag}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                        
                        <div className="flex gap-2 ml-4">
                          <button
                            className="px-3 py-1 text-xs bg-green-500 hover:bg-green-600 text-white rounded"
                            onClick={() => handleLoadFromTemplateList(template)}
                          >
                            {language === 'zh-CN' ? '加载' : 'Load'}
                          </button>
                          <button
                            className="px-3 py-1 text-xs bg-red-500 hover:bg-red-600 text-white rounded"
                            onClick={() => handleDeleteTemplate(template.id)}
                          >
                            {t('common.delete')}
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            
            <div className="flex justify-end gap-2 mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
              <button
                className="px-4 py-2 border rounded-md hover:bg-gray-50 dark:hover:bg-gray-700"
                onClick={() => {
                  setShowLoadDialog(false);
                  setSearchTerm('');
                }}
              >
                {t('common.close')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PacketEditor; 