import { Injectable } from "@nestjs/common";
import * as argon2 from "argon2";

/**
 * 使用 Argon2id 进行密码哈希。默认值（m=65536, t=3, p=4）适用于将哈希保留在 Linux x86 和 Windows 目标上，通过 `argon2` 包中的预构建二进制文件。哈希仅保存。
 */
@Injectable()
export class PasswordService {
  async hash(password: string): Promise<string> {
    return argon2.hash(password, { type: argon2.argon2id });
  }

  async verify(password: string, hash: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, password);
    } catch {
      // 无效或未识别的哈希格式 => 视为无效。
      return false;
    }
  }
}
