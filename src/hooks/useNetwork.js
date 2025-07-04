// 使用动态导入避免静态导入问题
export const useNetwork = () => {
  const sendPacket = async (packetData, interfaceName = null) => {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const result = await invoke('send_packet', {
        packetData,
        interfaceName
      });
      return result;
    } catch (error) {
      throw new Error(`发送报文失败: ${error}`);
    }
  };

  const getNetworkInterfaces = async () => {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const interfaces = await invoke('get_network_interfaces');
      return interfaces;
    } catch (error) {
      throw new Error(`获取网络接口失败: ${error}`);
    }
  };

  return {
    sendPacket,
    getNetworkInterfaces
  };
}; 