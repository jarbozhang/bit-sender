import {
  commands,
  type PacketSpec,
  type InterfaceInfo,
  type SendReport,
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
};

export type { PacketSpec, InterfaceInfo, SendReport };
