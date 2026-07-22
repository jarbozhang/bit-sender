import { test, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { EditorProvider, useEditor } from "./editor";

function Probe() {
  const { proto, values, setProto, setValue } = useEditor();
  return (
    <div>
      <span data-testid="proto">{proto}</span>
      <span data-testid="ttl">{String(values.ttl ?? "")}</span>
      <button onClick={() => setValue("ttl", "99")}>set-ttl</button>
      <button onClick={() => setProto("udp")}>to-udp</button>
      <button onClick={() => setProto("tcp")}>to-tcp</button>
    </div>
  );
}

function renderProbe() {
  return render(
    <EditorProvider>
      <Probe />
    </EditorProvider>,
  );
}

const ttl = () => screen.getByTestId("ttl").textContent;

test("切到另一个协议 tab 再切回来，编辑的字段仍保留", () => {
  renderProbe();
  fireEvent.click(screen.getByText("set-ttl")); // tcp.ttl = 99
  expect(ttl()).toBe("99");

  fireEvent.click(screen.getByText("to-udp")); // 切到 udp
  fireEvent.click(screen.getByText("to-tcp")); // 切回 tcp
  expect(ttl()).toBe("99"); // 编辑保留
});

test("每个协议维护各自的字段值，互不串", () => {
  renderProbe();
  fireEvent.click(screen.getByText("set-ttl")); // tcp.ttl = 99
  fireEvent.click(screen.getByText("to-udp")); // 切到 udp
  expect(ttl()).toBe("64"); // udp 用自己的默认值，不继承 tcp 的 99
});
