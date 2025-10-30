import React, { useEffect, useState } from "react";
import { useNetwork } from '../hooks/useNetwork';
import { useLanguage } from '../hooks/useLanguage';
import { useTranslation } from '../locales';

const NetworkSelectModal = ({ visible, onClose, onSelect }) => {
  const { getNetworkInterfaces } = useNetwork();
  const [interfaces, setInterfaces] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const { language } = useLanguage();
  const { t } = useTranslation(language);

  useEffect(() => {
    if (visible) {
      setLoading(true);
      setError(null);
      getNetworkInterfaces()
        .then((list) => {
          const hasValidMac = (mac) => mac && mac !== "00:00:00:00:00:00";
          const isIPv4 = (addr) => /^\d+\.\d+\.\d+\.\d+$/.test(addr);
          const hasIPv4 = (iface) => (iface.addresses || []).some(isIPv4);

          // 1) 过滤掉没有有效 MAC 的网卡
          const filtered = (Array.isArray(list) ? list : []).filter(i => hasValidMac(i.mac));
          // 2) 将有 IPv4 的网卡置前
          const withIp = filtered.filter(hasIPv4);
          const withoutIp = filtered.filter(i => !hasIPv4(i));
          const sorted = [...withIp, ...withoutIp];

          setInterfaces(sorted);
          // 默认选中第一个
          if (sorted.length > 0) {
            setSelected(sorted[0].name);
          }
        })
        .catch((e) => {
          setError(e.message || t('networkSelect.error'));
        })
        .finally(() => setLoading(false));
    }
  }, [visible]);

  // 处理ESC键关闭弹框
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape' && visible) {
        onClose();
      }
    };

    if (visible) {
      document.addEventListener('keydown', handleKeyDown);
      return () => {
        document.removeEventListener('keydown', handleKeyDown);
      };
    }
  }, [visible, onClose]);

  if (!visible) return null;

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg p-6 min-w-[400px]">
        <h2 className="text-lg font-bold mb-4 text-gray-800 dark:text-gray-100">{t('networkSelect.title')}</h2>
        {loading && <div className="text-gray-500 mb-2">{t('networkSelect.loading')}</div>}
        {error && <div className="text-red-500 mb-2">{error}</div>}
        <div className="max-h-60 overflow-y-auto">
          {interfaces.map((iface) => {
            const ipv4 = (iface.addresses || []).find(addr => /^\d+\.\d+\.\d+\.\d+$/.test(addr));
            return (
              <div
                key={iface.name}
                className={`flex flex-col gap-1 p-2 rounded cursor-pointer ${selected === iface.name ? "bg-blue-100 dark:bg-blue-900" : ""}`}
                onClick={() => setSelected(iface.name)}
                onDoubleClick={() => {
                  onSelect(iface);
                  onClose();
                }}
              >
                <span className="font-bold text-gray-900 dark:text-gray-100">{iface.description || iface.name}</span>
                <span className="text-xs text-gray-500">{t('networkSelect.mac')}: {iface.mac || t('networkSelect.unknown')}</span>
                <span className="text-xs text-gray-500">{t('networkSelect.ip')}: {ipv4 || t('networkSelect.noIPv4')}</span>
              </div>
            );
          })}
        </div>
        <div className="flex justify-end gap-2 mt-6">
          <button className="px-4 py-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600" onClick={onClose}>{t('common.cancel')}</button>
          <button
            className="bg-blue-500 text-white px-4 py-1 rounded disabled:opacity-50 hover:bg-blue-600"
            disabled={!selected}
            onClick={() => { onSelect(interfaces.find(iface => iface.name === selected)); onClose(); }}
          >
            {t('common.confirm')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default NetworkSelectModal; 