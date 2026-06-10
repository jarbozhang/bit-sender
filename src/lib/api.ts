import {
  commands,
  type PacketSpec,
  type InterfaceInfo,
  type SendReport,
  type BatchStatus,
  type CaptureStats,
  type CapturedPacket,
  type SequenceStep,
  type SequenceStatus,
  type TestConfig,
  type TestResult,
  type MonitorStats,
} from "../api/bindings";

/** 解包 tauri-specta 的 Result：ok 取 data，error 抛 Error（交由调用方 catch 显示）。 */
async function unwrap<T>(
  p: Promise<{ status: "ok"; data: T } | { status: "error"; error: string }>,
): Promise<T> {
  const r = await p;
  if (r.status === "ok") return r.data;
  throw new Error(r.error);
}

/** v2 强类型 API 门面。所有入参/返回类型均来自后端 specta 生成的 bindings。 */
export const api = {
  buildPreview: (spec: PacketSpec) => unwrap(commands.buildPacketPreviewV2(spec)),
  listInterfaces: () => unwrap(commands.listInterfacesV2()),
  sendPacket: (spec: PacketSpec, iface: string) =>
    unwrap(commands.sendPacketV2(spec, iface)),

  // 批量发送（M3）
  startBatch: (
    spec: PacketSpec,
    iface: string,
    frequency: number,
    stopCondition: string,
    stopValue: number,
  ) => unwrap(commands.startBatchSendV2(spec, iface, frequency, stopCondition, stopValue)),
  batchStatus: (taskId: string) => commands.getBatchStatusV2(taskId),
  stopBatch: (taskId: string) => commands.stopBatchSendV2(taskId),

  // 嗅探（M4）
  startCapture: (iface: string) => unwrap(commands.startCaptureV2(iface)),
  stopCapture: () => unwrap(commands.stopCaptureV2()),
  captureStats: () => commands.getCaptureStatsV2(),
  capturedPackets: (max: number) => commands.getCapturedPacketsV2(max),

  // 序列发送（M5）
  startSequence: (steps: SequenceStep[], iface: string, loopCount: number) =>
    unwrap(commands.startSequenceV2(steps, iface, loopCount)),
  sequenceStatus: (taskId: string) => commands.getSequenceStatusV2(taskId),
  stopSequence: (taskId: string) => commands.stopSequenceV2(taskId),

  // 响应监控（M6）
  startMonitor: (iface: string, config: TestConfig) =>
    unwrap(commands.startMonitorV2(iface, config)),
  stopMonitor: () => unwrap(commands.stopMonitorV2()),
  monitorResults: (max: number) => commands.getMonitorResultsV2(max),
  monitorStats: () => commands.getMonitorStatsV2(),
};

export type { PacketSpec, InterfaceInfo, SendReport, BatchStatus, CaptureStats, CapturedPacket, SequenceStep, SequenceStatus, TestConfig, TestResult, MonitorStats };
