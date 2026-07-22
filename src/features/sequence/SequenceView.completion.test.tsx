import { test, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// mock 网卡(让 start 能过 selected 检查)与 api(控制序列状态返回)。
vi.mock("../../contexts/network", () => ({
  useNetwork: () => ({ selected: { name: "en0", addresses: [], description: null, mac: null } }),
}));
vi.mock("../../lib/api", () => ({
  api: {
    startSequence: vi.fn(async () => "task-abcdef12"),
    sequenceStatus: vi.fn(),
    stopSequence: vi.fn(),
  },
}));

import { api } from "../../lib/api";
import { I18nProvider } from "../../contexts/i18n";
import { EditorProvider } from "../../contexts/editor";
import { SequenceProvider } from "../../contexts/sequence";
import { SequenceView } from "./SequenceView";

function renderView() {
  return render(
    <I18nProvider>
      <EditorProvider>
        <SequenceProvider>
          <SequenceView />
        </SequenceProvider>
      </EditorProvider>
    </I18nProvider>,
  );
}

beforeEach(() => {
  localStorage.setItem("bitsender-v2-lang", "zh-CN");
  vi.clearAllMocks();
});

test("序列跑完后轮询状态并显示完成提示", async () => {
  vi.mocked(api.sequenceStatus).mockResolvedValue({
    task_id: "task-abcdef12",
    current_index: 0,
    current_loop: 0,
    total_sent: 3,
    running: false,
    completed: true,
  });

  renderView();
  fireEvent.click(screen.getByText("+ 添加当前包")); // 加一个包，启用开始按钮
  fireEvent.click(screen.getByText("▶ 开始序列"));

  await waitFor(() => {
    expect(screen.queryByText(/序列完成 · 共发 3 包/)).not.toBeNull();
  });
});
