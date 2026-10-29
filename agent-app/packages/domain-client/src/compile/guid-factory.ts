import { v5 as uuidV5 } from "uuid";

/**
 * 确定性 GUID 派生（简要步骤 4）。
 *
 * 编译后的 KF 项目会把每个语义实体 ID（页面名称、控件名称、变量名称）替换为与 UUID 兼容的 KF GUID，该 GUID 仅由构建种子和语义 ID 派生：
 *
 *   guid = uuidV5(entityId, uuidV5(build.seed, KF_BUILD_NAMESPACE))
 *
 * 相同的 IR 和种子始终生成相同的 GUID（工作空间逐字节一致）；种子不同，GUID 也不同。UUID v5 按照 RFC 4122 使用 SHA-1，并通过标准 `uuid` 包实现（纯 JS + node:crypto，在 Linux 与 Windows 上保持稳定），因此结果可在任何主机上复现。
 */

export type BuildSeed = { seed: string };

/**
 * 所有 KF 构建使用的固定 RFC 4122 风格命名空间。选定后即冻结：修改它会改变现有构建派生出的每一个 GUID。
 */
export const KF_BUILD_NAMESPACE = "3c7c6a9e-1f4d-4e8b-9c5a-2b6f7d8e9a0b";

/**
 * 根据 RFC 4122 v5 UUID 为基于构建种子的语义实体标识符衍生。`entityId` 是一个稳定语义标识符（页面名称、控制名称、变量名称），而不是一个 KF GUID 或者一个数字内部标识符。
 */
export function deriveGuid(build: BuildSeed, entityId: string): string {
  return uuidV5(entityId, uuidV5(build.seed, KF_BUILD_NAMESPACE));
}
