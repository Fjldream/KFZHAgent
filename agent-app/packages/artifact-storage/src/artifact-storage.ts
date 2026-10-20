/**
 * 私有制品存储契约。
 *
 * 制品是按租户划分的 Blob，通过不透明的 artifactId 标识。存储实现绝不会通过这些公开返回类型暴露绝对路径：调用方只与不透明标识符交互。
 */

/**
 * 按租户存储的私有制品类型。
 *
 * 该值由领域包负责，因此必须为未来的领域制品格式保持开放，而不能在此枚举当前仅客户端使用的格式。
 */
export type ArtifactKind = string;

/** 成功写入的制品结果。 */
export type StoredArtifact = {
  artifactId: string;
  sha256: string;
  size: number;
};

export interface ArtifactStorage {
  /**
 * 把可读流写为新制品，返回不透明的 artifactId 和完整性元数据。流大小超过 `maxBytes` 时，以 `ARTIFACT_TOO_LARGE` 拒绝。
 */
  put(input: {
    tenantId: string;
    kind: ArtifactKind;
    /** 可选的服务器签发键。使用相同字节重复提交该键时必须保持幂等。 */
    artifactId?: string;
    stream: NodeJS.ReadableStream;
    maxBytes: number;
  }): Promise<StoredArtifact>;
  /** 将制品内容以可读流的形式打开。 */
  open(tenantId: string, artifactId: string): Promise<NodeJS.ReadableStream>;
  /** 删除制品。 */
  delete(tenantId: string, artifactId: string): Promise<void>;
}

/**
 * 客户端工作区是一个包含解包的KF客户端项目的本地工作目录。`rootDir` 是一个内部工作区路径，必须从不被序列化到API响应或LangGraph状态中。
 */
export type ClientWorkspace = {
  id: string;
  rootDir: string;
  mode: "source" | "candidate";
  sourceArtifactId?: string;
};
