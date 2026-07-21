import { useState } from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { I18nProvider } from "../../contexts/i18n";
import { NetworkProvider } from "../../contexts/network";
import { EditorProvider } from "../../contexts/editor";
import { SequenceProvider } from "../../contexts/sequence";
import { SequenceView } from "./SequenceView";

// SequenceProvider 在外层保持挂载，SequenceView 通过开关卸载/重挂，模拟 Shell 切 tab。
function Harness() {
  const [show, setShow] = useState(true);
  return (
    <SequenceProvider>
      <button onClick={() => setShow((s) => !s)}>toggle</button>
      {show && <SequenceView />}
    </SequenceProvider>
  );
}

function renderHarness() {
  return render(
    <I18nProvider>
      <NetworkProvider>
        <EditorProvider>
          <Harness />
        </EditorProvider>
      </NetworkProvider>
    </I18nProvider>,
  );
}

beforeEach(() => {
  localStorage.setItem("bitsender-v2-lang", "zh-CN");
});

test("已添加的序列包在切换 tab（组件卸载重挂）后仍保留", () => {
  renderHarness();

  fireEvent.click(screen.getByText("+ 添加当前包"));
  expect(screen.getByText("TCP")).toBeInTheDocument();

  // 切走：卸载 SequenceView
  fireEvent.click(screen.getByText("toggle"));
  expect(screen.queryByText("TCP")).not.toBeInTheDocument();

  // 切回：重挂 SequenceView，包记录应仍在
  fireEvent.click(screen.getByText("toggle"));
  expect(screen.getByText("TCP")).toBeInTheDocument();
});
