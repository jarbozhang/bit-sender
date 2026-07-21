import { useRef, useState } from "react";
import { parseHexDump } from "../../lib/hexdump";

// payload 十六进制字节网格编辑器：复刻右侧示波器视觉（offset + 两两分组 + 只读 ASCII），
// nibble 粒度光标、overwrite 改数字、点击定位、方向键移动、末尾追加/删除、奇数长度标红、
// 粘贴规范化。受控组件，对外始终是连续大写 hex 串（后端契约不变）。

interface Props {
  value: string;
  onChange: (hex: string) => void;
}

const BYTES_PER_ROW = 16;
const NIBS_PER_ROW = BYTES_PER_ROW * 2;

const HEX = /^[0-9a-fA-F]$/;

/** 把任意字符串规整为大写 hex nibble 串（去掉非 hex 字符）。 */
function clean(v: string): string {
  return v.replace(/[^0-9a-fA-F]/g, "").toUpperCase();
}

export function HexField({ value, onChange }: Props) {
  const nibs = clean(value);
  const len = nibs.length;
  const [cursor, setCursor] = useState(len);
  const [focused, setFocused] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  // cursor 可能因外部 value 变短而越界，渲染时夹取。
  const cur = Math.min(cursor, len);
  const oddTail = len % 2 === 1 ? len - 1 : -1; // 落单半字节的 nibble 索引

  const emit = (next: string, nextCursor: number) => {
    onChange(next);
    setCursor(Math.max(0, Math.min(next.length, nextCursor)));
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const k = e.key;
    if (HEX.test(k)) {
      const c = k.toUpperCase();
      const next = cur < len ? nibs.slice(0, cur) + c + nibs.slice(cur + 1) : nibs + c;
      emit(next, cur + 1);
      e.preventDefault();
    } else if (k === "Backspace") {
      if (cur > 0) emit(nibs.slice(0, cur - 1) + nibs.slice(cur), cur - 1);
      e.preventDefault();
    } else if (k === "Delete") {
      if (cur < len) emit(nibs.slice(0, cur) + nibs.slice(cur + 1), cur);
      e.preventDefault();
    } else if (k === "ArrowLeft") {
      setCursor(Math.max(0, cur - 1));
      e.preventDefault();
    } else if (k === "ArrowRight") {
      setCursor(Math.min(len, cur + 1));
      e.preventDefault();
    } else if (k === "ArrowUp") {
      setCursor(Math.max(0, cur - NIBS_PER_ROW));
      e.preventDefault();
    } else if (k === "ArrowDown") {
      setCursor(Math.min(len, cur + NIBS_PER_ROW));
      e.preventDefault();
    } else if (k === "Home") {
      setCursor(cur - (cur % NIBS_PER_ROW));
      e.preventDefault();
    } else if (k === "End") {
      const rowStart = cur - (cur % NIBS_PER_ROW);
      setCursor(Math.min(len, rowStart + NIBS_PER_ROW));
      e.preventDefault();
    }
  };

  const onPaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const parsed = clean(parseHexDump(e.clipboardData.getData("text")));
    emit(parsed, parsed.length);
  };

  const rowCount = Math.max(1, Math.ceil(len / NIBS_PER_ROW));

  return (
    <div
      ref={boxRef}
      data-testid="hexfield"
      role="textbox"
      aria-label="payload hex editor"
      tabIndex={0}
      onKeyDown={onKeyDown}
      onPaste={onPaste}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      className="font-mono text-[12px] leading-[1.85] bg-bg border border-line-bright rounded px-3 py-2.5 max-h-[220px] overflow-y-auto outline-none focus:border-amber focus:shadow-glow-amber transition"
    >
      {Array.from({ length: rowCount }, (_, r) => {
        const rowStartNib = r * NIBS_PER_ROW;
        const offset = (r * BYTES_PER_ROW).toString(16).padStart(4, "0").toUpperCase();
        const cells = [];
        let ascii = "";
        for (let b = 0; b < BYTES_PER_ROW; b++) {
          const hi = rowStartNib + b * 2;
          if (hi >= len) break;
          const lo = hi + 1;
          const hasLo = lo < len;
          const nibbleSpan = (idx: number, ch: string) => {
            const isCursor = focused && idx === cur;
            const isOdd = idx === oddTail;
            return (
              <span
                key={idx}
                data-testid={`nib-${idx}`}
                onMouseDown={(e) => {
                  e.preventDefault();
                  boxRef.current?.focus();
                  setCursor(idx);
                }}
                className={`cursor-text ${isOdd ? "text-signalred" : "text-txt"} ${isCursor ? "bg-amber/30 rounded-sm" : ""}`}
              >
                {ch}
              </span>
            );
          };
          cells.push(
            <span key={hi} className="mr-1.5">
              {nibbleSpan(hi, nibs[hi])}
              {hasLo && nibbleSpan(lo, nibs[lo])}
            </span>,
          );
          if (hasLo) {
            const code = parseInt(nibs.slice(hi, lo + 1), 16);
            ascii += code >= 32 && code < 127 ? String.fromCharCode(code) : "·";
          }
        }
        // 光标停在本行末尾（追加位）时显示插入光标标记
        const caretAtRowEnd =
          focused && cur === len && cur > rowStartNib && cur <= rowStartNib + NIBS_PER_ROW;
        return (
          <div key={r} className="grid grid-cols-[42px_1fr_130px] gap-3.5">
            <span className="text-faint">{offset}</span>
            <span className="tracking-[0.06em]">
              {cells}
              {caretAtRowEnd && <span data-testid="caret" className="text-amber">▍</span>}
              {len === 0 && focused && <span data-testid="caret" className="text-amber">▍</span>}
            </span>
            <span data-testid={`ascii-${r}`} className="text-dim tracking-[0.12em]">
              {ascii}
            </span>
          </div>
        );
      })}
    </div>
  );
}
