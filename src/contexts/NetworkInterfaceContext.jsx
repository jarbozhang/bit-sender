import React, { createContext, useContext, useState } from "react";
import NetworkSelectModal from "../components/NetworkSelectModal";

const NetworkInterfaceContext = createContext();

export const useNetworkInterface = () => useContext(NetworkInterfaceContext);

export const NetworkInterfaceProvider = ({ children }) => {
  const [selectedInterface, setSelectedInterface] = useState(null);
  const [showSelectModal, setShowSelectModal] = useState(false);

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
          setSelectedInterface(iface);
          setShowSelectModal(false);
        }}
      />
    </NetworkInterfaceContext.Provider>
  );
}; 