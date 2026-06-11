import { test, expect, type Page } from "@playwright/test";
import { installTauriMock } from "./mock-tauri";

// 字节着色断言用：scope 里 hex 字节容器（区别于 offset/ascii 列）
const BYTE_CONTAINER = "span.tracking-\\[0\\.06em\\]";

test.beforeEach(async ({ page }) => {
  await installTauriMock(page);
  await page.goto("/");
  await expect(page.getByText("PACKET FORGE")).toBeVisible();
});

async function gotoTcpTab(page: Page) {
  await page.getByRole("button", { name: /^TCP/ }).click();
  // 等防抖 + mock 预览渲染（LEN 徽标显示 64 B）
  await expect(page.locator(".scanlines header b")).toHaveText("64");
}

test("六个视图均可导航渲染", async ({ page }) => {
  const views: [string, string][] = [
    ["网口嗅探", "LIVE CAPTURE"],
    ["序列发送", "PACKET SEQUENCE"],
    ["响应监控", "RESPONSE MONITOR"],
    ["模板库", "TEMPLATE LIBRARY"],
    ["配置", "配置"],
    ["报文编辑", "PACKET FORGE"],
  ];
  for (const [navTitle, heading] of views) {
    await page.locator("nav").getByTitle(navTitle).click();
    await expect(page.getByRole("heading", { name: new RegExp(heading, "i") })).toBeVisible();
  }
});

test("协议 tab 切换字段集", async ({ page }) => {
  await gotoTcpTab(page);
  await expect(page.getByText("源端口")).toBeVisible();
  await page.getByRole("button", { name: /^ETH/ }).click();
  await expect(page.getByText("源端口")).toHaveCount(0);
  await expect(page.getByText("类型", { exact: true })).toBeVisible();
});

test("hex scope 按协议层着色（TCP 帧）", async ({ page }) => {
  await gotoTcpTab(page);
  const bytes = page.locator(`${BYTE_CONTAINER} > span`);
  await expect(bytes).toHaveCount(64);
  await expect(page.locator(`${BYTE_CONTAINER} > span.text-violet`)).toHaveCount(14); // eth
  await expect(page.locator(`${BYTE_CONTAINER} > span.text-cyan`)).toHaveCount(20); // ipv4
  await expect(page.locator(`${BYTE_CONTAINER} > span.text-amber`)).toHaveCount(20); // tcp
  await expect(page.locator(`${BYTE_CONTAINER} > span.text-faint`)).toHaveCount(10); // payload
  // ascii 列能看到 payload 明文
  await expect(page.getByText("Hello,BIT!")).toBeVisible();
});

test("发送：未选网卡报错，选中后成功", async ({ page }) => {
  await gotoTcpTab(page);
  await page.getByRole("button", { name: "测试发送" }).click();
  await expect(page.getByText("请先在顶部状态栏选择网卡")).toBeVisible();

  await page.getByRole("button", { name: /选择网卡/ }).click();
  await page.getByRole("button", { name: /Wi-Fi \(en0\)/ }).click();
  await page.getByRole("button", { name: "测试发送" }).click();
  await expect(page.getByText("已发送 64 字节 · 经 en0")).toBeVisible();
});

test("主题切换并持久化", async ({ page }) => {
  const html = page.locator("html");
  await expect(html).toHaveClass(/dark/);
  await page.getByTitle("深色模式").click();
  await expect(html).toHaveClass(/light/);
  await page.reload();
  await expect(html).toHaveClass(/light/);
});

test("中英文切换", async ({ page }) => {
  await expect(page.getByText("// 报文编辑 · 实时构建")).toBeVisible();
  await page.getByTitle("切换语言").click();
  await expect(page.getByText("// packet editor · live build")).toBeVisible();
  await expect(page.getByRole("button", { name: "Test Send" })).toBeVisible();
});

test("模板：保存当前配置并加载回编辑器", async ({ page }) => {
  await gotoTcpTab(page);
  const srcPort = page.locator("input").nth(4); // TRANSPORT 源端口
  await srcPort.fill("12345");

  await page.locator("nav").getByTitle("模板库").click();
  await page.getByRole("button", { name: "保存当前为模板" }).click();
  const dialog = page.locator(".fixed");
  await dialog.locator("input").first().fill("E2E模板");
  await dialog.getByRole("button", { name: "保存" }).click();
  await expect(page.getByText("E2E模板")).toBeVisible();

  await page.getByRole("button", { name: "加载到编辑器" }).last().click();
  await expect(page.getByText("PACKET FORGE")).toBeVisible();
  await expect(page.locator("input").nth(4)).toHaveValue("12345");
});
