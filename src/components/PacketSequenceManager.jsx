import React, { useState, useRef } from 'react';
import { 
  PlusIcon, 
  TrashIcon, 
  ArrowUpIcon, 
  ArrowDownIcon,
  PlayIcon,
  DocumentArrowUpIcon,
  ClipboardDocumentListIcon,
  ClockIcon
} from '@heroicons/react/24/outline';
import { useLanguage } from '../hooks/useLanguage';
import { useTranslation } from '../locales';
import { useToast } from '../contexts/ToastContext';
import Button from './Button';

const PacketSequenceManager = ({ 
  visible, 
  onClose, 
  onStartSequence,
  currentPacketData 
}) => {
  const { language } = useLanguage();
  const { t } = useTranslation(language);
  const { showSuccess, showError, showInfo } = useToast();
  
  const [sequence, setSequence] = useState([]);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [showBatchImport, setShowBatchImport] = useState(false);
  const [batchImportText, setBatchImportText] = useState('');
  const fileInputRef = useRef(null);

  // 添加当前数据包到序列
  const addCurrentPacket = () => {
    if (!currentPacketData) {
      showError(t('sequence.noCurrentPacket'));
      return;
    }
    
    const newPacket = {
      id: `packet_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name: `${t('sequence.packet')} ${sequence.length + 1}`,
      protocol: currentPacketData.protocol,
      fields: { ...currentPacketData.fields },
      payload: currentPacketData.payload,
      delayMs: 100, // 默认100ms间隔
      enabled: true
    };
    
    setSequence([...sequence, newPacket]);
    showSuccess(t('sequence.packetAdded'));
  };

  // 添加空白数据包
  const addEmptyPacket = () => {
    const newPacket = {
      id: `packet_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name: `${t('sequence.packet')} ${sequence.length + 1}`,
      protocol: 'eth',
      fields: {},
      payload: '',
      delayMs: 100,
      enabled: true
    };
    
    setSequence([...sequence, newPacket]);
  };

  // 删除数据包
  const removePacket = (index) => {
    const newSequence = sequence.filter((_, i) => i !== index);
    setSequence(newSequence);
    if (selectedIndex >= newSequence.length) {
      setSelectedIndex(-1);
    }
    showSuccess(t('sequence.packetRemoved'));
  };

  // 移动数据包位置
  const movePacket = (index, direction) => {
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= sequence.length) return;
    
    const newSequence = [...sequence];
    [newSequence[index], newSequence[newIndex]] = [newSequence[newIndex], newSequence[index]];
    setSequence(newSequence);
    
    if (selectedIndex === index) {
      setSelectedIndex(newIndex);
    } else if (selectedIndex === newIndex) {
      setSelectedIndex(index);
    }
  };

  // 更新数据包信息
  const updatePacket = (index, updates) => {
    const newSequence = [...sequence];
    newSequence[index] = { ...newSequence[index], ...updates };
    setSequence(newSequence);
  };

  // 批量导入处理
  const handleBatchImport = () => {
    if (!batchImportText.trim()) {
      showError(t('sequence.noBatchData'));
      return;
    }

    try {
      // 按行分割，每行作为一个数据包
      const lines = batchImportText.trim().split('\n').filter(line => line.trim());
      const newPackets = lines.map((line, index) => ({
        id: Date.now() + Math.random() + index,
        name: `${t('sequence.importedPacket')} ${sequence.length + index + 1}`,
        protocol: 'eth',
        fields: {},
        payload: line.trim(),
        delayMs: 100,
        enabled: true
      }));

      setSequence([...sequence, ...newPackets]);
      setBatchImportText('');
      setShowBatchImport(false);
      showSuccess(t('sequence.batchImportSuccess', {}, { count: newPackets.length }));
    } catch (error) {
      showError(t('sequence.batchImportError') + ': ' + error.message);
    }
  };

  // 从文件导入
  const handleFileImport = async () => {
    try {
      const { open } = await import('@tauri-apps/plugin-dialog');
      const selected = await open({
        multiple: true,
        filters: [
          { name: 'Text Files', extensions: ['txt'] },
          { name: 'JSON Files', extensions: ['json'] },
          { name: 'All Files', extensions: ['*'] }
        ]
      });

      if (selected && selected.length > 0) {
        const { readTextFile } = await import('@tauri-apps/plugin-fs');
        const newPackets = [];

        for (const filePath of selected) {
          const content = await readTextFile(filePath);
          const fileName = filePath.split('/').pop() || filePath.split('\\').pop();
          
          newPackets.push({
            id: Date.now() + Math.random(),
            name: fileName,
            protocol: 'eth',
            fields: {},
            payload: content.trim(),
            delayMs: 100,
            enabled: true
          });
        }

        setSequence([...sequence, ...newPackets]);
        showSuccess(t('sequence.fileImportSuccess', {}, { count: newPackets.length }));
      }
    } catch (error) {
      showError(t('sequence.fileImportError') + ': ' + error.message);
    }
  };

  // 开始序列发送
  const handleStartSequence = () => {
    const enabledPackets = sequence.filter(p => p.enabled);
    if (enabledPackets.length === 0) {
      showError(t('sequence.noEnabledPackets'));
      return;
    }

    onStartSequence(enabledPackets);
  };

  if (!visible) return null;

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[90vh] overflow-hidden">
        {/* 标题栏 */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-100">
            {t('sequence.title')}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* 工具栏 */}
        <div className="p-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/50">
          <div className="flex flex-wrap gap-2">
            <Button
              variant="primary"
              size="sm"
              onClick={addCurrentPacket}
              className="flex items-center gap-1"
            >
              <PlusIcon className="w-4 h-4" />
              {t('sequence.addCurrent')}
            </Button>
            
            <Button
              variant="secondary"
              size="sm"
              onClick={addEmptyPacket}
              className="flex items-center gap-1"
            >
              <PlusIcon className="w-4 h-4" />
              {t('sequence.addEmpty')}
            </Button>
            
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setShowBatchImport(true)}
              className="flex items-center gap-1"
            >
              <ClipboardDocumentListIcon className="w-4 h-4" />
              {t('sequence.batchImport')}
            </Button>
            
            <Button
              variant="secondary"
              size="sm"
              onClick={handleFileImport}
              className="flex items-center gap-1"
            >
              <DocumentArrowUpIcon className="w-4 h-4" />
              {t('sequence.fileImport')}
            </Button>
          </div>
        </div>

        {/* 数据包列表 */}
        <div className="flex-1 overflow-auto p-4">
          {sequence.length === 0 ? (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
              <ClipboardDocumentListIcon className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p className="text-lg font-medium mb-2">{t('sequence.empty')}</p>
              <p className="text-sm">{t('sequence.emptyHint')}</p>
            </div>
          ) : (
            <div className="space-y-2">
              {sequence.map((packet, index) => (
                <div
                  key={packet.id}
                  className={`border rounded-lg p-4 ${
                    selectedIndex === index
                      ? 'border-blue-300 bg-blue-50 dark:border-blue-600 dark:bg-blue-900/20'
                      : 'border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700'
                  } ${!packet.enabled ? 'opacity-50' : ''}`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 flex-1">
                      {/* 启用/禁用复选框 */}
                      <input
                        type="checkbox"
                        checked={packet.enabled}
                        onChange={(e) => updatePacket(index, { enabled: e.target.checked })}
                        className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                      />
                      
                      {/* 序号 */}
                      <span className="w-8 h-8 bg-gray-100 dark:bg-gray-600 rounded-full flex items-center justify-center text-sm font-medium">
                        {index + 1}
                      </span>
                      
                      {/* 数据包信息 */}
                      <div className="flex-1">
                        <input
                          type="text"
                          value={packet.name}
                          onChange={(e) => updatePacket(index, { name: e.target.value })}
                          className="font-medium text-gray-800 dark:text-gray-100 bg-transparent border-none outline-none focus:ring-1 focus:ring-blue-500 rounded px-1"
                          placeholder={t('sequence.packetName')}
                        />
                        <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                          {t('sequence.protocol')}: {packet.protocol.toUpperCase()} 
                          {packet.payload && ` | ${t('sequence.payload')}: ${packet.payload.substring(0, 30)}${packet.payload.length > 30 ? '...' : ''}`}
                        </div>
                      </div>
                      
                      {/* 延迟设置 */}
                      <div className="flex items-center gap-2">
                        <ClockIcon className="w-4 h-4 text-gray-400" />
                        <input
                          type="number"
                          value={packet.delayMs}
                          onChange={(e) => updatePacket(index, { delayMs: Math.max(0, parseInt(e.target.value) || 0) })}
                          className="w-20 px-2 py-1 text-sm border rounded dark:bg-gray-600 dark:border-gray-500"
                          min="0"
                          step="10"
                        />
                        <span className="text-xs text-gray-500">ms</span>
                      </div>
                    </div>
                    
                    {/* 操作按钮 */}
                    <div className="flex items-center gap-1 ml-4">
                      <button
                        onClick={() => movePacket(index, 'up')}
                        disabled={index === 0}
                        className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30"
                      >
                        <ArrowUpIcon className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => movePacket(index, 'down')}
                        disabled={index === sequence.length - 1}
                        className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30"
                      >
                        <ArrowDownIcon className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => removePacket(index)}
                        className="p-1 text-red-400 hover:text-red-600"
                      >
                        <TrashIcon className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 底部操作栏 */}
        <div className="p-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/50">
          <div className="flex items-center justify-between">
            <div className="text-sm text-gray-600 dark:text-gray-400">
              {t('sequence.summary', {}, { 
                total: sequence.length, 
                enabled: sequence.filter(p => p.enabled).length 
              })}
            </div>
            <div className="flex gap-3">
              <Button variant="secondary" onClick={onClose}>
                {t('common.cancel')}
              </Button>
              <Button
                variant="primary"
                onClick={handleStartSequence}
                disabled={sequence.filter(p => p.enabled).length === 0}
                className="flex items-center gap-2"
              >
                <PlayIcon className="w-4 h-4" />
                {t('sequence.startSequence')}
              </Button>
            </div>
          </div>
        </div>

        {/* 批量导入对话框 */}
        {showBatchImport && (
          <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
            <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-2xl w-full mx-4">
              <h3 className="text-lg font-semibold mb-4">{t('sequence.batchImportTitle')}</h3>
              <textarea
                value={batchImportText}
                onChange={(e) => setBatchImportText(e.target.value)}
                placeholder={t('sequence.batchImportPlaceholder')}
                className="w-full h-40 p-3 border rounded-lg dark:bg-gray-700 dark:border-gray-600"
              />
              <div className="flex justify-end gap-3 mt-4">
                <Button variant="secondary" onClick={() => setShowBatchImport(false)}>
                  {t('common.cancel')}
                </Button>
                <Button variant="primary" onClick={handleBatchImport}>
                  {t('sequence.import')}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default PacketSequenceManager;
