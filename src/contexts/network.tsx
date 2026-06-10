import {
  createContext,
  useContext,
  useState,
  useEffect,
  type ReactNode,
} from "react";
import { api, type InterfaceInfo } from "../lib/api";

interface NetworkCtx {
  interfaces: InterfaceInfo[];
  selected: InterfaceInfo | null;
  setSelected: (i: InterfaceInfo | null) => void;
  refresh: () => void;
  error: string | null;
}

const Ctx = createContext<NetworkCtx | null>(null);

export function useNetwork(): NetworkCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useNetwork 必须在 NetworkProvider 内使用");
  return c;
}

/** 全局唯一网卡选择（v1 NetworkInterfaceContext 的 TS 重写）。 */
export function NetworkProvider({ children }: { children: ReactNode }) {
  const [interfaces, setInterfaces] = useState<InterfaceInfo[]>([]);
  const [selected, setSelected] = useState<InterfaceInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = () => {
    api
      .listInterfaces()
      .then((list) => {
        setInterfaces(list);
        setError(null);
      })
      .catch((e) => setError(String(e)));
  };

  useEffect(() => {
    refresh();
  }, []);

  return (
    <Ctx.Provider value={{ interfaces, selected, setSelected, refresh, error }}>
      {children}
    </Ctx.Provider>
  );
}
