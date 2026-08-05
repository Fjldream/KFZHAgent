import { Injectable } from "@nestjs/common";
import * as argon2 from "argon2";

/**
 * Password hashing with Argon2id. Library defaults are used (m=65536, t=3,
 * p=4) so that hashes stay portable across Linux x86 and Windows targets via
 * the prebuilt binaries shipped with the `argon2` package. Only the hash is
 * ever persisted.
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
      // Malformed or unrecognized hash format => treat as invalid.
      return false;
    }
  }
}
