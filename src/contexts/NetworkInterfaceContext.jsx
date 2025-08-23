import React, { createContext, useContext, useState, useEffect } from "react";
import NetworkSelectModal from "../components/NetworkSelectModal";
import { useNetwork } from "../hooks/useNetwork";

const NetworkInterfaceContext = createContext();

export const useNetworkInterface = () => useContext(NetworkInterfaceContext);

export const NetworkInterfaceProvider = ({ children }) => {
  const [selectedInterface, setSelectedInterface] = useState(null);
  console.log("🚀 ~ NetworkInterfaceProvider ~ selectedInterface:", selectedInterface)
  const [showSelectModal, setShowSelectModal] = useState(false);
  const [interfaces, setInterfaces] = useState([]);
  const { getNetworkInterfaces } = useNetwork();

  useEffect(() => {
    getNetworkInterfaces().then((list) => {
      setInterfaces(list);
      // 自动选择第一个有 mac 和 IPv4 的网卡
      const iface = list.find(i => i.mac && i.mac !== "00:00:00:00:00:00" && (i.addresses || []).some(addr => /^\d+\.\d+\.\d+\.\d+$/.test(addr)));
      if (iface) {
        console.log("🚀 ~ getNetworkInterfaces ~ iface:", iface)
        // setSelectedInterface(iface);
      }
    });
  }, []);

  return (
    <NetworkInterfaceContext.Provider value={{
      selectedInterface,
      setSelectedInterface,
      showSelectModal,
      setShowSelectModal
    }}>
      {children}
      <NetworkSelectModal
        visible={showSelectModal}
        onClose={() => setShowSelectModal(false)}
        onSelect={(iface) => {
          console.log("🚀 ~ NetworkInterfaceProvider ~ iface:", iface)
          setSelectedInterface(iface);
          setShowSelectModal(false);
        }}
      />
    </NetworkInterfaceContext.Provider>
  );
}; 