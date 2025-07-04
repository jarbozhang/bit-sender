import React, { useEffect, useState } from "react";
import { useNetwork } from '../hooks/useNetwork';

function randomTraffic() {
  // 生成 20 个随机流量点
  return Array.from({ length: 20 }, () => Math.floor(Math.random() * 30));
}

const TrafficChart = ({ data }) => {
  const width = 80, height = 24;
  if (!data.length) return <svg width={width} height={height}></svg>;
  const max = Math.max(...data, 1);
  const points = data.map((v, i) => `${(i / (data.length - 1)) * width},${height - (v / max) * (height - 2)}`).join(" ");
  return (
    <svg width={width} height={height}>
      <polyline
        fill="none"
        stroke="#222"
        strokeWidth="2"
        points={points}
      />
    </svg>
  );
};

const NetworkSelectModal = ({ visible, onClose, onSelect }) => {
  const { getNetworkInterfaces } = useNetwork();
  const [interfaces, setInterfaces] = useState([]);
  const [selected, setSelected] = useState(null);
  const [traffic, setTraffic] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (visible) {
      setLoading(true);
      setError(null);
      getNetworkInterfaces()
        .then((list) => {
          setInterfaces(list);
          setTraffic(Object.fromEntries(list.map(i => [i.name, randomTraffic()])));
        })
        .catch((e) => {
          setError(e.message || '获取网卡失败');
        })
        .finally(() => setLoading(false));
      // 定时更新流量
      const timer = setInterval(() => {
        setTraffic(prev => {
          const next = { ...prev };
          for (const i of interfaces) {
            next[i.name] = [...(next[i.name] || []), Math.floor(Math.random() * 30)].slice(-20);
          }
          return next;
        });
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [visible]);

  if (!visible) return null;

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg p-6 min-w-[400px]">
        <h2 className="text-lg font-bold mb-4 text-gray-800 dark:text-gray-100">选择发送网卡</h2>
        {loading && <div className="text-gray-500 mb-2">正在加载网卡列表...</div>}
        {error && <div className="text-red-500 mb-2">{error}</div>}
        <div className="max-h-60 overflow-y-auto">
          {interfaces.map((iface) => (
            <div
              key={iface.name}
              className={`flex items-center gap-4 p-2 rounded cursor-pointer ${selected === iface.name ? "bg-blue-100 dark:bg-blue-900" : ""}`}
              onClick={() => setSelected(iface.name)}
            >
              <span className="w-48 text-gray-900 dark:text-gray-100">{iface.description || iface.name}</span>
              <TrafficChart data={traffic[iface.name] || []} />
            </div>
          ))}
        </div>
        <div className="flex justify-end gap-2 mt-6">
          <button className="px-4 py-1 rounded border" onClick={onClose}>取消</button>
          <button
            className="bg-blue-500 text-white px-4 py-1 rounded disabled:opacity-50"
            disabled={!selected}
            onClick={() => { onSelect(selected); onClose(); }}
          >
            确定
          </button>
        </div>
      </div>
    </div>
  );
};

export default NetworkSelectModal; 