import { createContext, useContext, useState, type ReactNode } from "react";
import { type ProtoKey, defaultValues } from "../lib/protocols";

// 编辑器状态提升到 context：让模板库/序列管理器能加载配置进编辑器。

interface EditorCtx {
  proto: ProtoKey;
  values: Record<string, string | boolean>;
  setProto: (p: ProtoKey) => void;
  setValue: (k: string, v: string | boolean) => void;
  /** 加载一份模板（协议 + 字段值），缺失字段用该协议默认值补齐。 */
  load: (proto: ProtoKey, values: Record<string, string | boolean>) => void;
}

const Ctx = createContext<EditorCtx | null>(null);

export function useEditor(): EditorCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useEditor 必须在 EditorProvider 内使用");
  return c;
}

type Values = Record<string, string | boolean>;

export function EditorProvider({ children }: { children: ReactNode }) {
  const [proto, setProtoState] = useState<ProtoKey>("tcp");
  // 每个协议维护各自的字段值，切 tab 不丢编辑（首次访问才用默认值填充）。
  const [store, setStore] = useState<Partial<Record<ProtoKey, Values>>>(() => ({
    tcp: defaultValues("tcp"),
  }));

  const values = store[proto] ?? defaultValues(proto);

  const setProto = (p: ProtoKey) => {
    setStore((prev) => (prev[p] ? prev : { ...prev, [p]: defaultValues(p) }));
    setProtoState(p);
  };
  const setValue = (k: string, v: string | boolean) =>
    setStore((prev) => ({
      ...prev,
      [proto]: { ...(prev[proto] ?? defaultValues(proto)), [k]: v },
    }));
  const load = (p: ProtoKey, v: Values) => {
    setStore((prev) => ({ ...prev, [p]: { ...defaultValues(p), ...v } }));
    setProtoState(p);
  };

  return (
    <Ctx.Provider value={{ proto, values, setProto, setValue, load }}>
      {children}
    </Ctx.Provider>
  );
}
