import { createContext, useContext, useState, type ReactNode, type Dispatch, type SetStateAction } from "react";
import { type ProtoKey } from "../lib/protocols";

// 序列列表提升到 context：Shell 切 tab 会卸载 SequenceView，本地 state 会丢失，
// 提到 provider 链后跨 tab 存续。

export interface SeqItem {
  id: string;
  name: string;
  proto: ProtoKey;
  values: Record<string, string | boolean>;
  delayMs: number;
  enabled: boolean;
}

interface SequenceCtx {
  seq: SeqItem[];
  setSeq: Dispatch<SetStateAction<SeqItem[]>>;
  loopCount: number;
  setLoopCount: Dispatch<SetStateAction<number>>;
}

const Ctx = createContext<SequenceCtx | null>(null);

export function useSequence(): SequenceCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useSequence 必须在 SequenceProvider 内使用");
  return c;
}

export function SequenceProvider({ children }: { children: ReactNode }) {
  const [seq, setSeq] = useState<SeqItem[]>([]);
  const [loopCount, setLoopCount] = useState(1);

  return (
    <Ctx.Provider value={{ seq, setSeq, loopCount, setLoopCount }}>
      {children}
    </Ctx.Provider>
  );
}
