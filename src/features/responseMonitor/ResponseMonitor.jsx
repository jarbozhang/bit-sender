import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useNetworkInterface } from '../../contexts/NetworkInterfaceContext';
import { useToast } from '../../contexts/ToastContext';

const ResponseMonitor = () => {
  const { selectedInterface } = useNetworkInterface();
  const { showSuccess, showError, showInfo, showSmartError } = useToast();
  
  // 监控状态
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [testResults, setTestResults] = useState([]);
  const [statistics, setStatistics] = useState({
    totalTests: 0,
    successfulTests: 0,
    failedTests: 0,
    averageRtt: 0,
    minRtt: 0,
    maxRtt: 0
  });
  
  // 测试配置
  const [testConfig, setTestConfig] = useState({
    testType: 'ping', // ping, arp, custom
    targetIp: '8.8.8.8',
    targetMac: '',
    timeout: 5000, // 5秒超时
    interval: 1000, // 1秒间隔
    count: 0, // 0表示连续测试
    payload: ''
  });
  
  // 预定义测试类型
  const testTypes = {
    ping: {
      name: 'PING测试',
      description: '发送ICMP Echo请求并等待回复',
      protocol: 'icmp'
    },
    arp: {
      name: 'ARP测试',
      description: '发送ARP请求并等待MAC地址解析',
      protocol: 'arp'
    },
    tcp_connect: {
      name: 'TCP连接测试',
      description: '测试TCP连接建立',
      protocol: 'tcp'
    },
    udp_echo: {
      name: 'UDP回显测试',
      description: '发送UDP数据包并等待回显',
      protocol: 'udp'
    }
  };

  // 开始监控测试
  const startMonitoring = async () => {
    if (!selectedInterface) {
      showError('请先选择网络接口');
      return;
    }

    try {
      setIsMonitoring(true);
      setTestResults([]);
      setStatistics({
        totalTests: 0,
        successfulTests: 0,
        failedTests: 0,
        averageRtt: 0,
        minRtt: 0,
        maxRtt: 0
      });
      
      const configToSend = {
        test_type: testConfig.testType,
        target_ip: testConfig.targetIp,
        target_mac: testConfig.targetMac || null,
        timeout: testConfig.timeout,
        interval: testConfig.interval,
        count: testConfig.count,
        payload: testConfig.payload || null
      };
      
      console.log('发送的测试配置:', configToSend);
      
      const result = await invoke('start_response_monitoring', {
        interfaceName: selectedInterface.name,
        testConfig: configToSend
      });
      
      showSuccess(result);
      
    } catch (error) {
      console.error('启动响应监控失败:', error);
      showSmartError('启动响应监控失败: ' + (error.message || error));
      setIsMonitoring(false);
    }
  };

  // 停止监控测试
  const stopMonitoring = async () => {
    try {
      const result = await invoke('stop_response_monitoring');
      setIsMonitoring(false);
      showInfo(result);
      
    } catch (error) {
      console.error('停止响应监控失败:', error);
      showSmartError('停止响应监控失败: ' + (error.message || error));
    }
  };

  // 清空测试结果
  const clearResults = () => {
    setTestResults([]);
    setStatistics({
      totalTests: 0,
      successfulTests: 0,
      failedTests: 0,
      averageRtt: 0,
      minRtt: 0,
      maxRtt: 0
    });
  };

  // 格式化时间
  const formatTime = (timestamp) => {
    return new Date(timestamp).toLocaleTimeString();
  };

  // 格式化RTT
  const formatRtt = (rtt) => {
    if (rtt < 1000) {
      return `${rtt.toFixed(2)}ms`;
    } else {
      return `${(rtt / 1000).toFixed(2)}s`;
    }
  };

  // 获取状态颜色
  const getStatusColor = (status) => {
    const colors = {
      success: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
      failed: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
      timeout: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'
    };
    return colors[status] || 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200';
  };

  // 定期获取测试结果并处理数据包
  useEffect(() => {
    if (!isMonitoring) return;

    const interval = setInterval(async () => {
      try {
        // 获取捕获的数据包以触发响应监控处理
        // 这会将捕获的数据包转发给响应监控器进行匹配
        await invoke('get_captured_packets', { maxCount: 100 });
        
        // 获取测试统计信息
        const stats = await invoke('get_monitoring_statistics');
        if (stats) {
          setStatistics({
            totalTests: stats.total_tests || 0,
            successfulTests: stats.successful_tests || 0,
            failedTests: stats.failed_tests || 0,
            averageRtt: stats.average_rtt || 0,
            minRtt: stats.min_rtt || 0,
            maxRtt: stats.max_rtt || 0
          });
        }

        // 获取新的测试结果
        const newResults = await invoke('get_test_results', { maxCount: 50 });
        if (newResults && newResults.length > 0) {
          setTestResults(prev => {
            const combined = [...newResults, ...prev].slice(0, 200); // 限制显示数量
            return combined;
          });
        }
      } catch (error) {
        console.error('获取监控数据失败:', error);
      }
    }, 500); // 每500ms更新一次以确保及时处理响应

    return () => clearInterval(interval);
  }, [isMonitoring]);

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md border border-gray-200 dark:border-gray-700 p-6">
      {/* 头部控制区 */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 mb-6">
        <div className="flex items-center gap-4">
          <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-100">
            响应监控
          </h2>
          {selectedInterface && (
            <span className="px-2 py-1 text-xs bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 rounded">
              {selectedInterface.name}
            </span>
          )}
        </div>
        
        <div className="flex items-center gap-2">
          {isMonitoring ? (
            <button
              onClick={stopMonitoring}
              className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-md flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 10h6v4H9z" />
              </svg>
              停止监控
            </button>
          ) : (
            <button
              onClick={startMonitoring}
              disabled={!selectedInterface}
              className="px-4 py-2 bg-green-500 hover:bg-green-600 disabled:bg-gray-400 text-white rounded-md flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h1m4 0h1m-6 4h8" />
              </svg>
              开始监控
            </button>
          )}
          
          <button
            onClick={clearResults}
            className="px-3 py-2 bg-gray-500 hover:bg-gray-600 text-white rounded-md"
          >
            清空
          </button>
        </div>
      </div>

      {/* 测试配置 */}
      <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 mb-6">
        <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">测试配置</h3>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
              测试类型
            </label>
            <select
              value={testConfig.testType}
              onChange={(e) => setTestConfig(prev => ({ ...prev, testType: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-sm"
            >
              {Object.entries(testTypes).map(([key, type]) => (
                <option key={key} value={key}>{type.name}</option>
              ))}
            </select>
          </div>
          
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
              目标IP
            </label>
            <input
              type="text"
              value={testConfig.targetIp}
              onChange={(e) => setTestConfig(prev => ({ ...prev, targetIp: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-sm"
              placeholder="8.8.8.8"
            />
          </div>
          
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
              超时时间(ms)
            </label>
            <input
              type="number"
              value={testConfig.timeout}
              onChange={(e) => setTestConfig(prev => ({ ...prev, timeout: parseInt(e.target.value) || 5000 }))}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-sm"
              min="1000"
              max="30000"
            />
          </div>
          
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
              间隔时间(ms)
            </label>
            <input
              type="number"
              value={testConfig.interval}
              onChange={(e) => setTestConfig(prev => ({ ...prev, interval: parseInt(e.target.value) || 1000 }))}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-sm"
              min="100"
              max="60000"
            />
          </div>
        </div>
        
        {testConfig.testType !== 'ping' && (
          <div className="mt-4">
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
              测试说明
            </label>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {testTypes[testConfig.testType]?.description}
            </p>
          </div>
        )}
      </div>

      {/* 统计信息 */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-4 mb-6">
        <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
          <div className="text-sm text-gray-600 dark:text-gray-400">总测试数</div>
          <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            {statistics.totalTests}
          </div>
        </div>
        
        <div className="bg-green-50 dark:bg-green-900 rounded-lg p-4">
          <div className="text-sm text-green-600 dark:text-green-400">成功</div>
          <div className="text-2xl font-bold text-green-900 dark:text-green-100">
            {statistics.successfulTests}
          </div>
        </div>
        
        <div className="bg-red-50 dark:bg-red-900 rounded-lg p-4">
          <div className="text-sm text-red-600 dark:text-red-400">失败</div>
          <div className="text-2xl font-bold text-red-900 dark:text-red-100">
            {statistics.failedTests}
          </div>
        </div>
        
        <div className="bg-blue-50 dark:bg-blue-900 rounded-lg p-4">
          <div className="text-sm text-blue-600 dark:text-blue-400">平均RTT</div>
          <div className="text-2xl font-bold text-blue-900 dark:text-blue-100">
            {formatRtt(statistics.averageRtt)}
          </div>
        </div>
        
        <div className="bg-purple-50 dark:bg-purple-900 rounded-lg p-4">
          <div className="text-sm text-purple-600 dark:text-purple-400">最小RTT</div>
          <div className="text-2xl font-bold text-purple-900 dark:text-purple-100">
            {formatRtt(statistics.minRtt)}
          </div>
        </div>
        
        <div className="bg-orange-50 dark:bg-orange-900 rounded-lg p-4">
          <div className="text-sm text-orange-600 dark:text-orange-400">最大RTT</div>
          <div className="text-2xl font-bold text-orange-900 dark:text-orange-100">
            {formatRtt(statistics.maxRtt)}
          </div>
        </div>
      </div>

      {/* 测试结果列表 */}
      <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
        <div className="bg-gray-50 dark:bg-gray-700 px-4 py-3 border-b border-gray-200 dark:border-gray-600">
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
            测试结果 ({testResults.length})
          </span>
        </div>
        
        <div className="max-h-96 overflow-y-auto">
          {testResults.length === 0 ? (
            <div className="p-8 text-center text-gray-500 dark:text-gray-400">
              {isMonitoring ? '等待测试结果...' : '点击"开始监控"开始网络响应测试'}
            </div>
          ) : (
            <div className="divide-y divide-gray-200 dark:divide-gray-700">
              {testResults.map((result) => (
                <div
                  key={result.id}
                  className="px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4 flex-1 min-w-0">
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        {formatTime(result.timestamp)}
                      </span>
                      <span className={`px-2 py-1 text-xs rounded ${getStatusColor(result.status)}`}>
                        {result.status.toUpperCase()}
                      </span>
                      <span className="text-sm text-gray-900 dark:text-gray-100">
                        {result.target} - {result.test_type}
                      </span>
                    </div>
                    <div className="text-sm text-gray-600 dark:text-gray-400">
                      {result.rtt ? formatRtt(result.rtt) : result.error || '超时'}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ResponseMonitor;