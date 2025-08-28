import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useNetworkInterface } from '../../contexts/NetworkInterfaceContext';
import { useToast } from '../../contexts/ToastContext';
import { useLanguage } from '../../hooks/useLanguage';
import { useTranslation } from '../../locales';

const NetworkSniffer = () => {
  const { selectedInterface, setShowSelectModal } = useNetworkInterface();
  const { showSuccess, showError, showInfo, showSmartError } = useToast();
  const { language } = useLanguage();
  const { t } = useTranslation(language);
  
  // 嗅探状态
  const [isSniffing, setIsSniffing] = useState(false);
  const [packets, setPackets] = useState([]);
  const [pendingSniffing, setPendingSniffing] = useState(false);
  const [statistics, setStatistics] = useState({
    totalPackets: 0,
    bytesPerSec: 0,
    packetsPerSec: 0,
    protocolStats: {
      tcp: 0,
      udp: 0,
      arp: 0,
      icmp: 0,
      other: 0
    }
  });
  
  // 过滤器状态
  const [filters, setFilters] = useState({
    protocol: 'all',
    srcMac: '',
    dstMac: '',
    srcIp: '',
    dstIp: '',
    port: ''
  });
  
  // 显示设置
  const [maxPackets, setMaxPackets] = useState(1000);
  const [autoScroll, setAutoScroll] = useState(true);
  const [showDetails, setShowDetails] = useState(null);
  const [pauseUpdates, setPauseUpdates] = useState(false);
  const [showFilters, setShowFilters] = useState(false); // 过滤器折叠状态，默认折叠
  
  // 虚拟滚动设置
  const [visibleRange, setVisibleRange] = useState({ start: 0, end: 50 });
  const ITEM_HEIGHT = 80; // 每个数据包行的估计高度
  const VISIBLE_ITEMS = 50; // 可见区域显示的数据包数量
  
  // 调试计数器和性能监控
  const [debugInfo, setDebugInfo] = useState({
    apiCalls: 0,
    packetsReceived: 0,
    lastUpdate: null,
    renderTime: 0
  });

  const doStartSniffing = async () => {
    if (!selectedInterface) return;
    
    try {
      setIsSniffing(true);
      setPackets([]);
      setStatistics({
        totalPackets: 0,
        bytesPerSec: 0,
        packetsPerSec: 0,
        protocolStats: {
          tcp: 0,
          udp: 0,
          arp: 0,
          icmp: 0,
          other: 0
        }
      });
      
      // 调用后端API启动嗅探
      const result = await invoke('start_packet_capture', {
        interfaceName: selectedInterface.name,
        filters: {
          protocol: filters.protocol === 'all' ? null : filters.protocol,
          srcMac: filters.srcMac || null,
          dstMac: filters.dstMac || null,
          srcIp: filters.srcIp || null,
          dstIp: filters.dstIp || null,
          port: filters.port || null
        }
      });
      
      showSuccess(result);
      
    } catch (error) {
      console.error('启动嗅探失败:', error);
      showSmartError('启动嗅探失败: ' + (error.message || error));
      setIsSniffing(false);
    }
  };

  // 启动嗅探
  const startSniffing = async () => {
    console.log('🚀 startSniffing called, selectedInterface:', selectedInterface);
    if (!selectedInterface) {
      console.log('🚀 No interface selected, setting pending and showing modal');
      setPendingSniffing(true);
      setShowSelectModal(true);
      return;
    }
    console.log('🚀 Interface selected, starting sniffing directly');
    doStartSniffing();
  };

  // 停止嗅探
  const stopSniffing = async () => {
    try {
      // 调用后端API停止嗅探
      const result = await invoke('stop_packet_capture');
      setIsSniffing(false);
      showInfo(result);
      
    } catch (error) {
      console.error('停止嗅探失败:', error);
      showSmartError(t('sniffer.stop') + ' failed: ' + (error.message || error));
    }
  };

  // 清空数据
  const clearData = () => {
    setPackets([]);
    setStatistics({
      totalPackets: 0,
      bytesPerSec: 0,
      packetsPerSec: 0,
      protocolStats: {
        tcp: 0,
        udp: 0,
        arp: 0,
        icmp: 0,
        other: 0
      }
    });
    // 重置接收计数器
    setDebugInfo(prev => ({
      ...prev,
      packetsReceived: 0
    }));
  };

  // 优化的过滤数据包 - 使用 useMemo 避免每次重新计算
  const filteredPackets = useMemo(() => {
    return packets.filter(packet => {
      if (filters.protocol !== 'all' && packet.protocol !== filters.protocol) return false;
      
      const srcMac = packet.src_mac || packet.srcMac || '';
      const dstMac = packet.dst_mac || packet.dstMac || '';
      const srcIp = packet.src_ip || packet.srcIp || '';
      const dstIp = packet.dst_ip || packet.dstIp || '';
      const srcPort = packet.src_port || packet.srcPort;
      const dstPort = packet.dst_port || packet.dstPort;
      
      if (filters.srcMac && !srcMac.toLowerCase().includes(filters.srcMac.toLowerCase())) return false;
      if (filters.dstMac && !dstMac.toLowerCase().includes(filters.dstMac.toLowerCase())) return false;
      if (filters.srcIp && !srcIp.includes(filters.srcIp)) return false;
      if (filters.dstIp && !dstIp.includes(filters.dstIp)) return false;
      if (filters.port && !(srcPort?.toString().includes(filters.port) || dstPort?.toString().includes(filters.port))) return false;
      return true;
    });
  }, [packets, filters]);

  // 虚拟滚动的可见数据包
  const visiblePackets = useMemo(() => {
    return filteredPackets.slice(visibleRange.start, visibleRange.end);
  }, [filteredPackets, visibleRange]);

  // 处理虚拟滚动
  const handleScroll = useCallback((e) => {
    const scrollTop = e.target.scrollTop;
    const start = Math.floor(scrollTop / ITEM_HEIGHT);
    const end = Math.min(start + VISIBLE_ITEMS, filteredPackets.length);
    
    setVisibleRange({ start, end });
  }, [filteredPackets.length]);


  // 格式化字节数
  const formatBytes = (bytes) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // 格式化时间
  const formatTime = (timestamp) => {
    return new Date(timestamp).toLocaleTimeString();
  };

  // 协议颜色映射
  const getProtocolColor = (protocol) => {
    const colors = {
      tcp: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
      udp: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
      arp: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
      icmp: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
      other: 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200'
    };
    return colors[protocol] || colors.other;
  };

  // 监听选择网卡后自动开始嗅探
  useEffect(() => {
    console.log('🚀 useEffect triggered, pendingSniffing:', pendingSniffing, 'selectedInterface:', selectedInterface);
    if (pendingSniffing && selectedInterface) {
      console.log('🚀 Both conditions met, starting sniffing automatically');
      setPendingSniffing(false);
      doStartSniffing();
    }
  }, [pendingSniffing, selectedInterface]);

  // 定时获取数据包和统计信息
  useEffect(() => {
    if (!isSniffing) {
      return;
    }

    const interval = setInterval(async () => {
      // 如果用户暂停了更新，只获取统计信息，不获取数据包
      if (pauseUpdates) {
        try {
          const stats = await invoke('get_packet_statistics');
          if (stats) {
            setStatistics({
              totalPackets: stats.total_packets || 0,
              bytesPerSec: stats.bytes_per_sec || 0,
              packetsPerSec: stats.packets_per_sec || 0,
              protocolStats: {
                tcp: stats.protocol_stats?.tcp || 0,
                udp: stats.protocol_stats?.udp || 0,
                arp: stats.protocol_stats?.arp || 0,
                icmp: stats.protocol_stats?.icmp || 0,
                other: stats.protocol_stats?.other || 0,
                ethernet: stats.protocol_stats?.ethernet || 0,
                ipv4: stats.protocol_stats?.ipv4 || 0,
              }
            });
          }
        } catch (error) {
          console.error('获取统计信息失败:', error);
        }
        return;
      }

      try {
        // 先获取统计信息
        const stats = await invoke('get_packet_statistics');
        if (stats) {
          setStatistics({
            totalPackets: stats.total_packets || 0,
            bytesPerSec: stats.bytes_per_sec || 0,
            packetsPerSec: stats.packets_per_sec || 0,
            protocolStats: {
              tcp: stats.protocol_stats?.tcp || 0,
              udp: stats.protocol_stats?.udp || 0,
              arp: stats.protocol_stats?.arp || 0,
              icmp: stats.protocol_stats?.icmp || 0,
              other: stats.protocol_stats?.other || 0,
              ethernet: stats.protocol_stats?.ethernet || 0,
              ipv4: stats.protocol_stats?.ipv4 || 0,
            }
          });
        }

        // 数据包获取数量
        const maxCount = 100;
        
        // 更新调试信息
        setDebugInfo(prev => ({ 
          ...prev, 
          apiCalls: prev.apiCalls + 1,
          lastUpdate: new Date().toLocaleTimeString()
        }));
        
        const newPackets = await invoke('get_captured_packets', { maxCount });
        
        if (newPackets && newPackets.length > 0) {
          const renderStart = performance.now();
          
          setPackets(prev => {
            // 限制显示的数据包数量，避免渲染太多DOM元素
            const combined = [...newPackets, ...prev].slice(0, maxPackets);
            return combined;
          });
          
          // 更新调试信息 - 现在后端只返回新数据包，所以可以安全累加
          setDebugInfo(prevDebug => ({ 
            ...prevDebug, 
            packetsReceived: prevDebug.packetsReceived + newPackets.length, // 累加新接收的数据包
            renderTime: performance.now() - renderStart
          }));
        }
      } catch (error) {
        console.error('获取数据包失败:', error);
        // 如果API调用失败，不要停止嗅探，但减少调用频率
      }
    }, 800);

    return () => {
      clearInterval(interval);
    };
  }, [isSniffing, maxPackets, pauseUpdates]);

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md border border-gray-200 dark:border-gray-700 p-6">
      {/* 头部控制区 */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 mb-6">
        <div className="flex items-center gap-4">
          <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-100">
            {t('sniffer.title')}
          </h2>
          {selectedInterface && (
            <span className="px-2 py-1 text-xs bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 rounded">
              {selectedInterface.name}
            </span>
          )}
        </div>
        
        <div className="flex items-center gap-2">
          {isSniffing ? (
            <button
              onClick={stopSniffing}
              className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-md flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 10h6v4H9z" />
              </svg>
              {t('sniffer.stop')}
            </button>
          ) : (
            <button
              onClick={startSniffing}
              className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-md flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h1m4 0h1m-6 4h8" />
              </svg>
              {t('sniffer.start')}
            </button>
          )}
          
          <button
            onClick={clearData}
            className="px-3 py-2 bg-gray-500 hover:bg-gray-600 text-white rounded-md"
          >
            {t('common.clear')}
          </button>
          
          {isSniffing && (
            <button
              onClick={() => setPauseUpdates(!pauseUpdates)}
              className={`px-3 py-2 text-white rounded-md ${
                pauseUpdates 
                  ? 'bg-yellow-500 hover:bg-yellow-600' 
                  : 'bg-purple-500 hover:bg-purple-600'
              }`}
            >
              {pauseUpdates ? t('common.resume') + '更新' : t('common.pause') + '更新'}
            </button>
          )}
          
        </div>
      </div>

      {/* 统计信息 */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
        <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
          <div className="text-sm text-gray-600 dark:text-gray-400">{t('sniffer.total')}包数</div>
          <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            {statistics.totalPackets.toLocaleString()}
          </div>
        </div>
        
        <div className="bg-blue-50 dark:bg-blue-900 rounded-lg p-4">
          <div className="text-sm text-blue-600 dark:text-blue-400">TCP</div>
          <div className="text-2xl font-bold text-blue-900 dark:text-blue-100">
            {statistics.protocolStats.tcp}
          </div>
        </div>
        
        <div className="bg-green-50 dark:bg-green-900 rounded-lg p-4">
          <div className="text-sm text-green-600 dark:text-green-400">UDP</div>
          <div className="text-2xl font-bold text-green-900 dark:text-green-100">
            {statistics.protocolStats.udp}
          </div>
        </div>
        
        <div className="bg-yellow-50 dark:bg-yellow-900 rounded-lg p-4">
          <div className="text-sm text-yellow-600 dark:text-yellow-400">ARP</div>
          <div className="text-2xl font-bold text-yellow-900 dark:text-yellow-100">
            {statistics.protocolStats.arp}
          </div>
        </div>
        
        <div className="bg-red-50 dark:bg-red-900 rounded-lg p-4">
          <div className="text-sm text-red-600 dark:text-red-400">ICMP</div>
          <div className="text-2xl font-bold text-red-900 dark:text-red-100">
            {statistics.protocolStats.icmp}
          </div>
        </div>
      </div>

      {/* 过滤器 - 可折叠 */}
      <div className="bg-gray-50 dark:bg-gray-700 rounded-lg mb-4 overflow-hidden">
        {/* 折叠标题栏 */}
        <div 
          className="px-4 py-3 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors flex items-center justify-between"
          onClick={() => setShowFilters(!showFilters)}
        >
          <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-2">
            <svg 
              className={`w-4 h-4 transition-transform duration-200 ${showFilters ? 'rotate-90' : 'rotate-0'}`} 
              fill="none" stroke="currentColor" viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            {t('sniffer.filters')}
            {/* 显示当前激活的过滤器数量 */}
            {(filters.protocol !== 'all' || filters.srcMac || filters.dstMac || filters.srcIp || filters.dstIp || filters.port) && (
              <span className="px-2 py-0.5 text-xs bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 rounded-full">
                {[
                  filters.protocol !== 'all' ? 1 : 0,
                  filters.srcMac ? 1 : 0,
                  filters.dstMac ? 1 : 0,
                  filters.srcIp ? 1 : 0,
                  filters.dstIp ? 1 : 0,
                  filters.port ? 1 : 0
                ].reduce((a, b) => a + b, 0)}
              </span>
            )}
          </h3>
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {showFilters ? t('sniffer.clickToCollapse') : t('sniffer.clickToExpand')}
          </span>
        </div>
        
        {/* 过滤器内容区域 - 动画折叠 */}
        <div className={`transition-all duration-300 ease-in-out ${showFilters ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'}`}>
          <div className="px-4 pb-4">
            <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
              <select
                value={filters.protocol}
                onChange={(e) => setFilters(prev => ({ ...prev, protocol: e.target.value }))}
                className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-sm"
              >
                <option value="all">{t('sniffer.allProtocols')}</option>
                <option value="tcp">TCP</option>
                <option value="udp">UDP</option>
                <option value="arp">ARP</option>
                <option value="icmp">ICMP</option>
              </select>
              
              <input
                type="text"
                placeholder={t('sniffer.sourceMac')}
                value={filters.srcMac}
                onChange={(e) => setFilters(prev => ({ ...prev, srcMac: e.target.value }))}
                className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-sm"
              />
              
              <input
                type="text"
                placeholder={t('sniffer.destMac')}
                value={filters.dstMac}
                onChange={(e) => setFilters(prev => ({ ...prev, dstMac: e.target.value }))}
                className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-sm"
              />
              
              <input
                type="text"
                placeholder={t('sniffer.sourceIp')}
                value={filters.srcIp}
                onChange={(e) => setFilters(prev => ({ ...prev, srcIp: e.target.value }))}
                className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-sm"
              />
              
              <input
                type="text"
                placeholder={t('sniffer.destIp')}
                value={filters.dstIp}
                onChange={(e) => setFilters(prev => ({ ...prev, dstIp: e.target.value }))}
                className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-sm"
              />
              
              <input
                type="text"
                placeholder={t('sniffer.port')}
                value={filters.port}
                onChange={(e) => setFilters(prev => ({ ...prev, port: e.target.value }))}
                className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-sm"
              />
            </div>
            
            {/* 快速清空过滤器按钮 */}
            {(filters.protocol !== 'all' || filters.srcMac || filters.dstMac || filters.srcIp || filters.dstIp || filters.port) && (
              <div className="mt-3 flex justify-end">
                <button
                  onClick={() => setFilters({
                    protocol: 'all',
                    srcMac: '',
                    dstMac: '',
                    srcIp: '',
                    dstIp: '',
                    port: ''
                  })}
                  className="px-3 py-1 text-xs bg-gray-200 hover:bg-gray-300 dark:bg-gray-600 dark:hover:bg-gray-500 text-gray-700 dark:text-gray-200 rounded-md transition-colors"
                >
                  {t('sniffer.clearFilters')}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 数据包列表 */}
      <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
        <div className="bg-gray-50 dark:bg-gray-700 px-4 py-3 border-b border-gray-200 dark:border-gray-600">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-4">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                {t('sniffer.packets')}列表 ({filteredPackets.length})
              </span>
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {t('sniffer.showing')}: {visiblePackets.length}/{filteredPackets.length} | {t('sniffer.lastUpdated')}: {debugInfo.lastUpdate}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                <input
                  type="checkbox"
                  checked={autoScroll}
                  onChange={(e) => setAutoScroll(e.target.checked)}
                  className="rounded"
                />
                {t('sniffer.autoScroll')}
              </label>
              <select
                value={maxPackets}
                onChange={(e) => setMaxPackets(parseInt(e.target.value))}
                className="px-2 py-1 border border-gray-300 dark:border-gray-600 rounded text-xs bg-white dark:bg-gray-800"
              >
                <option value={100}>100{t('sniffer.items')}</option>
                <option value={500}>500{t('sniffer.items')}</option>
                <option value={1000}>1000{t('sniffer.items')}</option>
                <option value={2000}>2000{t('sniffer.items')} ({t('sniffer.optimized')})</option>
                <option value={5000}>5000{t('sniffer.items')} ({t('sniffer.virtualScroll')})</option>
                <option value={10000}>10000{t('sniffer.items')} ({t('sniffer.virtualScroll')})</option>
              </select>
              <span className="text-xs text-gray-500 dark:text-gray-400 ml-2">
                {maxPackets > 1000 ? t('sniffer.virtualScrollEnabled') : ''}
              </span>
            </div>
          </div>
        </div>
        
        <div 
          className="overflow-y-auto" 
          onScroll={handleScroll}
          style={{ height: '350px' }} // 调整为350px，合适的显示空间
        >
          {filteredPackets.length === 0 ? (
            <div className="p-8 text-center text-gray-500 dark:text-gray-400">
              {isSniffing ? t('sniffer.waiting') : t('sniffer.clickToStart')}
            </div>
          ) : (
            <div 
              style={{ 
                height: filteredPackets.length * ITEM_HEIGHT,
                position: 'relative'
              }}
            >
              <div 
                style={{
                  transform: `translateY(${visibleRange.start * ITEM_HEIGHT}px)`,
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                }}
              >
                <div className="divide-y divide-gray-200 dark:divide-gray-700">
                  {visiblePackets.map((packet) => (
                    <PacketRow
                      key={packet.id}
                      packet={packet}
                      showDetails={showDetails === packet.id}
                      onToggleDetails={() => setShowDetails(showDetails === packet.id ? null : packet.id)}
                      formatTime={formatTime}
                      formatBytes={formatBytes}
                      getProtocolColor={getProtocolColor}
                      t={t}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// 优化的数据包行组件 - 使用 React.memo 避免不必要的重新渲染
const PacketRow = React.memo(({ 
  packet, 
  showDetails, 
  onToggleDetails, 
  formatTime, 
  formatBytes, 
  getProtocolColor,
  t 
}) => {
  return (
    <div
      className="px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer"
      onClick={onToggleDetails}
      style={{ minHeight: '80px' }} // 确保虚拟滚动的一致高度
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4 flex-1 min-w-0">
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {formatTime(packet.timestamp)}
          </span>
          <span className={`px-2 py-1 text-xs rounded ${getProtocolColor(packet.protocol)}`}>
            {packet.protocol.toUpperCase()}
          </span>
          <span className="text-sm text-gray-900 dark:text-gray-100 truncate">
            {packet.src_ip || packet.srcIp}:{packet.src_port || packet.srcPort || '—'} → {packet.dst_ip || packet.dstIp}:{packet.dst_port || packet.dstPort || '—'}
          </span>
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
          <span>{formatBytes(packet.size)}</span>
          <svg 
            className={`w-4 h-4 transition-transform ${showDetails ? 'rotate-180' : ''}`} 
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>
      
      {showDetails && (
        <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-600">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <div className="text-gray-600 dark:text-gray-400">{t('sniffer.sourceMac')}:</div>
              <div className="font-mono text-gray-900 dark:text-gray-100">{packet.src_mac || packet.srcMac}</div>
            </div>
            <div>
              <div className="text-gray-600 dark:text-gray-400">{t('sniffer.destMac')}:</div>
              <div className="font-mono text-gray-900 dark:text-gray-100">{packet.dst_mac || packet.dstMac}</div>
            </div>
            <div>
              <div className="text-gray-600 dark:text-gray-400">{t('sniffer.packetSize')}:</div>
              <div className="text-gray-900 dark:text-gray-100">{formatBytes(packet.size)}</div>
            </div>
            <div>
              <div className="text-gray-600 dark:text-gray-400">{t('sniffer.info')}:</div>
              <div className="text-gray-900 dark:text-gray-100">{packet.info}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

PacketRow.displayName = 'PacketRow';

export default NetworkSniffer;