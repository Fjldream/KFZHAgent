import axios, {
  AxiosError,
  type AxiosInstance,
  type AxiosRequestConfig,
} from "axios";
import type { ApiEnvelope } from "../types/redundancy";

// modified by jinlong.feng at 0901 冗余功能开发
export class RedundancyApiError extends Error {
  constructor(
    public readonly code: string | number,
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "RedundancyApiError";
  }
}

export interface HttpClientOptions {
  baseURL?: string;
  getToken: () => string | null;
  onUnauthorized?: () => void;
  instance?: AxiosInstance;
}

export class RedundancyHttpClient {
  private readonly instance: AxiosInstance;

  constructor(private readonly options: HttpClientOptions) {
    this.instance =
      options.instance ??
      axios.create({ baseURL: options.baseURL ?? "/api/v1" });
  }

  async request<T>(config: AxiosRequestConfig): Promise<T> {
    const token = this.options.getToken();
    try {
      const response = await this.instance.request<ApiEnvelope<T>>({
        ...config,
        headers: {
          ...config.headers,
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      if (response.data.code !== 0) {
        if (response.data.code === 20000) this.options.onUnauthorized?.();
        throw new RedundancyApiError(response.data.code, response.data.message);
      }
      return response.data.data;
    } catch (error) {
      if (error instanceof RedundancyApiError) throw error;
      const axiosError = error as AxiosError<ApiEnvelope<never>>;
      if (axiosError.response?.status === 401) this.options.onUnauthorized?.();
      throw new RedundancyApiError(
        axiosError.response?.data?.code ?? "REDUNDANCY_NETWORK_ERROR",
        axiosError.response?.data?.message ??
          "无法连接运维中心，请检查网络后重试",
        axiosError.response?.status,
      );
    }
  }
}
// end
