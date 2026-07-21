import { test, expect } from "vitest";
import { useState } from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { HexField } from "./HexField";

function Controlled({ initial = "" }: { initial?: string }) {
  const [v, setV] = useState(initial);
  return (
    <>
      <HexField value={v} onChange={setV} />
      <span data-testid="value">{v}</span>
    </>
  );
}

const noop = () => {};
const val = () => screen.getByTestId("value").textContent;

// ── U1 展示层 ──────────────────────────────────────────────
test("按两两分组渲染字节，ASCII 列显示可读字符", () => {
  render(<HexField value="3274" onChange={noop} />);
  expect(screen.getByTestId("nib-0").textContent).toBe("3");
  expect(screen.getByTestId("nib-1").textContent).toBe("2");
  expect(screen.getByTestId("nib-2").textContent).toBe("7");
  expect(screen.getByTestId("nib-3").textContent).toBe("4");
  expect(screen.getByTestId("ascii-0").textContent).toBe("2t");
});

test("空 value 渲染空态，不报错", () => {
  render(<HexField value="" onChange={noop} />);
  expect(screen.queryByTestId("hexfield")).not.toBeNull();
  expect(screen.queryByTestId("nib-0")).toBeNull();
});

test("奇数长度时尾部落单半字节标红", () => {
  render(<HexField value="327" onChange={noop} />);
  const tail = screen.getByTestId("nib-2");
  expect(tail.textContent).toBe("7");
  expect(tail.className).toContain("signalred");
});

test("超过一行时换行并推进 offset", () => {
  render(<HexField value={"0".repeat(34)} onChange={noop} />); // 17 字节 → 两行
  expect(screen.queryByTestId("ascii-1")).not.toBeNull();
  expect(screen.queryByTestId("nib-32")).not.toBeNull();
});

// ── U2 编辑交互 ────────────────────────────────────────────
test("聚焦后输入 hex 字符追加到末尾", () => {
  render(<Controlled />);
  fireEvent.keyDown(screen.getByTestId("hexfield"), { key: "3" });
  expect(val()).toBe("3");
});

test("小写输入统一存大写", () => {
  render(<Controlled />);
  fireEvent.keyDown(screen.getByTestId("hexfield"), { key: "a" });
  expect(val()).toBe("A");
});

test("点击某 nibble 定位光标后 overwrite 只改该位", () => {
  render(<Controlled initial="3274" />);
  fireEvent.mouseDown(screen.getByTestId("nib-0"));
  fireEvent.keyDown(screen.getByTestId("hexfield"), { key: "f" });
  expect(val()).toBe("F274");
});

test("光标在末尾输入则追加，payload 变长", () => {
  render(<Controlled initial="32" />);
  fireEvent.keyDown(screen.getByTestId("hexfield"), { key: "9" });
  expect(val()).toBe("329");
});

test("Backspace 删除光标前一个 nibble", () => {
  render(<Controlled initial="3274" />);
  fireEvent.keyDown(screen.getByTestId("hexfield"), { key: "Backspace" });
  expect(val()).toBe("327");
});

test("非法字符被忽略", () => {
  render(<Controlled initial="32" />);
  fireEvent.keyDown(screen.getByTestId("hexfield"), { key: "g" });
  expect(val()).toBe("32");
});

test("方向键移动光标不改 value", () => {
  render(<Controlled initial="3274" />);
  const box = screen.getByTestId("hexfield");
  fireEvent.mouseDown(screen.getByTestId("nib-0")); // cursor=0
  fireEvent.keyDown(box, { key: "ArrowRight" }); // cursor=1
  fireEvent.keyDown(box, { key: "f" }); // overwrite nib-1
  expect(val()).toBe("3F74");
});

// ── U3 粘贴规范化 ──────────────────────────────────────────
test("粘贴带空格的 hex 自动规范化", () => {
  render(<Controlled />);
  fireEvent.paste(screen.getByTestId("hexfield"), {
    clipboardData: { getData: () => "32 74 63" },
  });
  expect(val()).toBe("327463");
});

test("粘贴带冒号分隔的 hex 自动规范化", () => {
  render(<Controlled />);
  fireEvent.paste(screen.getByTestId("hexfield"), {
    clipboardData: { getData: () => "32:74:63" },
  });
  expect(val()).toBe("327463");
});
