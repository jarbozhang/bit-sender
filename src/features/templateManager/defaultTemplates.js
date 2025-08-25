// 预设的默认模板
export const DEFAULT_TEMPLATES = [
  {
    id: 'default-arp-request',
    name: 'ARP请求 - 网络发现',
    description: '用于发现网络中的设备，广播ARP请求包',
    protocol: 'arp',
    fields: {
      dst_mac: 'FF:FF:FF:FF:FF:FF',
      src_mac: '__LOCAL_MAC__',
      ether_type: '0806',
      hwType: '0001',
      protoType: '0800',
      opcode: '0001',
      srcMac: '__LOCAL_MAC__',
      srcIp: '__LOCAL_IP__',
      dstMac: '00:00:00:00:00:00',
      dstIp: '192.168.1.1',
      data: ''
    },
    tags: ['网络发现', '常用', 'ARP'],
    createdAt: new Date('2024-01-01').toISOString(),
    updatedAt: new Date('2024-01-01').toISOString()
  },
  {
    id: 'default-ping-request',
    name: 'ICMP Ping请求',
    description: '标准的ping请求包，用于测试网络连通性',
    protocol: 'ipv4',
    fields: {
      dst_mac: 'AA:BB:CC:DD:EE:FF',
      src_mac: '__LOCAL_MAC__',
      ether_type: '0800',
      version: '4',
      ihl: '5',
      tos: '0',
      total_length: '84',
      identification: '1234',
      flags: '2',
      fragment_offset: '0',
      ttl: '64',
      protocol: '1',
      header_checksum: '0',
      srcIp: '__LOCAL_IP__',
      dstIp: '8.8.8.8',
      data: '0800f7fc00000000'
    },
    tags: ['网络测试', 'ICMP', '连通性'],
    createdAt: new Date('2024-01-01').toISOString(),
    updatedAt: new Date('2024-01-01').toISOString()
  },
  {
    id: 'default-tcp-syn',
    name: 'TCP SYN - 端口扫描',
    description: 'TCP SYN包，用于端口扫描和连接测试',
    protocol: 'tcp',
    fields: {
      dst_mac: 'AA:BB:CC:DD:EE:FF',
      src_mac: '__LOCAL_MAC__',
      ether_type: '0800',
      srcIp: '__LOCAL_IP__',
      dstIp: '192.168.1.1',
      srcPort: '12345',
      dstPort: '80',
      seq: '1000000',
      ack: '0',
      data_offset: '5',
      reserved: '0',
      flag_urg: '0',
      flag_ack: '0',
      flag_psh: '0',
      flag_rst: '0',
      flag_syn: '1',
      flag_fin: '0',
      window_size: '8192',
      checksum: '0',
      urgent_pointer: '0',
      data: ''
    },
    tags: ['端口扫描', 'TCP', '安全测试'],
    createdAt: new Date('2024-01-01').toISOString(),
    updatedAt: new Date('2024-01-01').toISOString()
  },
  {
    id: 'default-udp-dns',
    name: 'UDP DNS查询',
    description: 'DNS查询请求包，用于域名解析测试',
    protocol: 'udp',
    fields: {
      dst_mac: 'AA:BB:CC:DD:EE:FF',
      src_mac: '__LOCAL_MAC__',
      ether_type: '0800',
      srcIp: '__LOCAL_IP__',
      dstIp: '8.8.8.8',
      srcPort: '12345',
      dstPort: '53',
      length: '40',
      checksum: '0',
      data: '0001010000010000000000000377777706676f6f676c6503636f6d0000010001'
    },
    tags: ['DNS', 'UDP', '域名解析'],
    createdAt: new Date('2024-01-01').toISOString(),
    updatedAt: new Date('2024-01-01').toISOString()
  },
  {
    id: 'default-ethernet-broadcast',
    name: '以太网广播包',
    description: '自定义以太网广播包，可用于网络测试',
    protocol: 'ethernet',
    fields: {
      dst_mac: 'FF:FF:FF:FF:FF:FF',
      src_mac: '__LOCAL_MAC__',
      ether_type: '0800',
      data: '48656c6c6f20576f726c64' // "Hello World" in hex
    },
    tags: ['广播', '以太网', '测试'],
    createdAt: new Date('2024-01-01').toISOString(),
    updatedAt: new Date('2024-01-01').toISOString()
  }
];

// 初始化默认模板的函数
export const initializeDefaultTemplates = () => {
  try {
    const existingTemplates = localStorage.getItem('packet-templates');
    
    if (!existingTemplates) {
      // 如果没有现有模板，设置默认模板
      localStorage.setItem('packet-templates', JSON.stringify(DEFAULT_TEMPLATES));
      return DEFAULT_TEMPLATES;
    } else {
      // 如果有现有模板，检查是否需要添加新的默认模板
      const templates = JSON.parse(existingTemplates);
      const existingIds = templates.map(t => t.id);
      const newDefaults = DEFAULT_TEMPLATES.filter(dt => !existingIds.includes(dt.id));
      
      if (newDefaults.length > 0) {
        const updatedTemplates = [...templates, ...newDefaults];
        localStorage.setItem('packet-templates', JSON.stringify(updatedTemplates));
        return updatedTemplates;
      }
      
      return templates;
    }
  } catch (error) {
    console.error('初始化默认模板失败:', error);
    return [];
  }
};