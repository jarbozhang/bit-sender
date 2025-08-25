import React, { useState, useEffect } from 'react';
import { useToast } from '../../contexts/ToastContext';
import { initializeDefaultTemplates } from './defaultTemplates';

const TemplateManager = ({ onLoadTemplate, currentPacket }) => {
  const [templates, setTemplates] = useState([]);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [showLoadDialog, setShowLoadDialog] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [templateDescription, setTemplateDescription] = useState('');
  const [templateTags, setTemplateTags] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState(null);

  const { showSuccess, showError, showInfo } = useToast();

  // 恢复背景滚动的helper函数
  const restoreBodyScroll = () => {
    document.body.style.overflow = 'unset';
  };

  // 加载保存的模板
  useEffect(() => {
    loadTemplates();
  }, []);

  const loadTemplates = () => {
    try {
      // 初始化默认模板并加载所有模板
      const allTemplates = initializeDefaultTemplates();
      setTemplates(allTemplates);
    } catch (error) {
      console.error('加载模板失败:', error);
      showError('加载模板失败');
    }
  };

  const saveTemplates = (newTemplates) => {
    try {
      localStorage.setItem('packet-templates', JSON.stringify(newTemplates));
      setTemplates(newTemplates);
    } catch (error) {
      console.error('保存模板失败:', error);
      showError('保存模板失败');
    }
  };

  // 保存当前配置为模板
  const handleSaveTemplate = () => {
    if (!templateName.trim()) {
      showError('请输入模板名称');
      return;
    }

    if (!currentPacket.protocol || !currentPacket.fields) {
      showError('当前没有有效的数据包配置');
      return;
    }

    // 处理字段值，将本机MAC/IP恢复为占位符
    const processedFields = {};
    Object.entries(currentPacket.fields).forEach(([key, value]) => {
      if (typeof value === 'string' && value.trim() !== '') {
        // 检查是否是MAC地址字段且值看起来像是本机MAC
        if (key.toLowerCase().includes('mac') && /^[0-9a-fA-F]{2}:[0-9a-fA-F]{2}:[0-9a-fA-F]{2}:[0-9a-fA-F]{2}:[0-9a-fA-F]{2}:[0-9a-fA-F]{2}$/i.test(value)) {
          // 检查是否是常见的本机MAC字段
          if (['src_mac', 'srcmac', 'source_mac'].includes(key.toLowerCase())) {
            processedFields[key] = '__LOCAL_MAC__';
            return;
          }
        }
        // 检查是否是IP地址字段且值看起来像是本机IP
        if (key.toLowerCase().includes('ip') && /^\d+\.\d+\.\d+\.\d+$/.test(value)) {
          // 检查是否是常见的本机IP字段
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

    // 检查是否存在同名模板
    const existingIndex = templates.findIndex(t => t.name === newTemplate.name);
    let newTemplates;
    
    if (existingIndex >= 0) {
      // 更新现有模板
      newTemplates = [...templates];
      newTemplates[existingIndex] = { ...newTemplates[existingIndex], ...newTemplate, updatedAt: new Date().toISOString() };
      showSuccess('模板已更新');
    } else {
      // 添加新模板
      newTemplates = [...templates, newTemplate];
      showSuccess('模板已保存');
    }

    saveTemplates(newTemplates);
    setShowSaveDialog(false);
    setTemplateName('');
    setTemplateDescription('');
    setTemplateTags('');
    restoreBodyScroll();
  };

  // 加载选中的模板
  const handleLoadTemplate = (template) => {
    onLoadTemplate(template);
    setShowLoadDialog(false);
    restoreBodyScroll();
    showInfo(`已加载模板：${template.name}`);
  };

  // 删除模板
  const handleDeleteTemplate = (templateId) => {
    if (window.confirm('确定要删除这个模板吗？')) {
      const newTemplates = templates.filter(t => t.id !== templateId);
      saveTemplates(newTemplates);
      showSuccess('模板已删除');
    }
  };

  // 过滤模板
  const filteredTemplates = templates.filter(template => 
    template.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    template.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
    template.tags.some(tag => tag.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  // ESC键关闭对话框和阻止背景滚动
  useEffect(() => {
    const handleEscapeKey = (event) => {
      if (event.key === 'Escape') {
        if (showSaveDialog) {
          setShowSaveDialog(false);
          setTemplateName('');
          setTemplateDescription('');
          setTemplateTags('');
          restoreBodyScroll();
        }
        if (showLoadDialog) {
          setShowLoadDialog(false);
          setSearchTerm('');
          restoreBodyScroll();
        }
      }
    };

    if (showSaveDialog || showLoadDialog) {
      // 阻止背景滚动
      document.body.style.overflow = 'hidden';
      document.addEventListener('keydown', handleEscapeKey);
      
      return () => {
        // 恢复背景滚动
        document.body.style.overflow = 'unset';
        document.removeEventListener('keydown', handleEscapeKey);
      };
    }
  }, [showSaveDialog, showLoadDialog]);

  return (
    <div className="flex items-center gap-2">
      {/* 保存模板按钮 */}
      <button
        onClick={() => setShowSaveDialog(true)}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors duration-150"
        title="保存当前配置为模板"
      >
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3-3m0 0l-3 3m3-3v12" />
        </svg>
        保存模板
      </button>

      {/* 加载模板按钮 */}
      <button
        onClick={() => setShowLoadDialog(true)}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors duration-150"
        title="加载保存的模板"
      >
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" />
        </svg>
        加载模板
      </button>

      <span className="text-gray-400 dark:text-gray-500 text-xs">
        ({templates.length} 个模板)
      </span>

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
              restoreBodyScroll();
            }
          }}
        >
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 min-w-[500px] max-w-[600px] w-full mx-4">
            <h2 className="text-lg font-bold mb-4 text-gray-800 dark:text-gray-100">
              保存数据包模板
            </h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  模板名称 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                  placeholder="例如：ARP请求模板、TCP SYN攻击"
                  value={templateName}
                  onChange={(e) => setTemplateName(e.target.value)}
                  maxLength={50}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  描述
                </label>
                <textarea
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                  placeholder="描述这个模板的用途和特点..."
                  value={templateDescription}
                  onChange={(e) => setTemplateDescription(e.target.value)}
                  rows={3}
                  maxLength={200}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  标签
                </label>
                <input
                  type="text"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                  placeholder="用逗号分隔，例如：测试,网络发现,常用"
                  value={templateTags}
                  onChange={(e) => setTemplateTags(e.target.value)}
                />
              </div>

              <div className="bg-gray-50 dark:bg-gray-700 rounded-md p-3">
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">当前配置预览：</p>
                <div className="text-xs font-mono text-gray-500 dark:text-gray-500">
                  协议: {currentPacket.protocol || '未选择'} | 
                  字段: {Object.keys(currentPacket.fields || {}).length} 个
                </div>
              </div>
            </div>
            
            <div className="flex justify-end gap-2 mt-6">
              <button
                className="px-4 py-2 border rounded-md hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300"
                onClick={() => {
                  setShowSaveDialog(false);
                  setTemplateName('');
                  setTemplateDescription('');
                  setTemplateTags('');
                  restoreBodyScroll();
                }}
              >
                取消
              </button>
              <button
                className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-md"
                onClick={handleSaveTemplate}
                disabled={!templateName.trim()}
              >
                保存模板
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
              restoreBodyScroll();
            }
          }}
        >
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 min-w-[700px] max-w-[800px] w-full mx-4 max-h-[80vh] flex flex-col">
            <h2 className="text-lg font-bold mb-4 text-gray-800 dark:text-gray-100">
              加载数据包模板
            </h2>
            
            {/* 搜索框 */}
            <div className="mb-4">
              <input
                type="text"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                placeholder="搜索模板名称、描述或标签..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>

            {/* 模板列表 */}
            <div className="flex-1 overflow-y-auto">
              {filteredTemplates.length === 0 ? (
                <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                  {templates.length === 0 ? '还没有保存的模板' : '没有找到匹配的模板'}
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredTemplates.map((template) => (
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
                            <span>创建: {new Date(template.createdAt).toLocaleDateString()}</span>
                            <span>字段: {Object.keys(template.fields).length} 个</span>
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
                            onClick={() => handleLoadTemplate(template)}
                          >
                            加载
                          </button>
                          <button
                            className="px-3 py-1 text-xs bg-red-500 hover:bg-red-600 text-white rounded"
                            onClick={() => handleDeleteTemplate(template.id)}
                          >
                            删除
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
                className="px-4 py-2 border rounded-md hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300"
                onClick={() => {
                  setShowLoadDialog(false);
                  setSearchTerm('');
                  restoreBodyScroll();
                }}
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TemplateManager;