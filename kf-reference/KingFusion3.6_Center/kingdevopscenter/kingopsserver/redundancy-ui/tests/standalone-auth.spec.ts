// modified by jinlong.feng at 2026-10-29 KF源码精简入库
// Reference snapshot: credential literals redacted; do not deploy this copy.
// modified by jinlong.feng at 0901 冗余功能开发
import { describe, expect, it, vi } from "vitest";
import { constants, generateKeyPairSync, privateDecrypt } from "node:crypto";
import { encryptKfPasswordWithForge, StandaloneAuthService, } from "../src/demo/auth/standalone-auth";
describe("StandaloneAuthService", () => {
    it("使用 KF 公钥加密密码并提交原登录字段", async () => {
        const requests: Array<{
            url: string;
            init?: RequestInit;
        }> = [];
        const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
            requests.push({ url, init });
            if (url === "/getPublicKey") {
                return new Response(JSON.stringify({
                    code: 0,
                    message: "success",
                    data: { publicKey: "PUBLIC_KEY", uuid: "LOGIN_UUID" },
                }), { status: 200 });
            }
            return new Response(JSON.stringify({
                code: 0,
                message: "success",
                data: { access_token: "ACCESS_TOKEN", userName: "admin001" },
            }), { status: 200 });
        });
        const encryptPassword = vi.fn(async () => "ENCRYPTED_PASSWORD");
        const service = new StandaloneAuthService({
            fetchImpl,
            encryptPassword,
        });
        const result = await service.login("admin001", "plain-password");
        expect(result.access_token).toBe("ACCESS_TOKEN");
        expect(encryptPassword).toHaveBeenCalledWith("plain-password", "PUBLIC_KEY");
        expect(requests[1]?.url).toBe("/login");
        expect(JSON.parse(String(requests[1]?.init?.body))).toEqual({
            username: "admin001",
            password: "KF_REFERENCE_REDACTED",
            uuid: "LOGIN_UUID",
        });
    });
    it("后端拒绝登录时返回可展示的错误", async () => {
        const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ code: -1, message: "用户名或密码错误", data: null }), { status: 200 }));
        const service = new StandaloneAuthService({
            fetchImpl,
            encryptPassword: vi.fn(),
        });
        await expect(service.login("admin001", "wrong-password")).rejects.toThrow("用户名或密码错误");
    });
    it("HTTP 非安全上下文的兼容密文可由 KF Node 私钥解密", async () => {
        const { publicKey, privateKey } = generateKeyPairSync("rsa", {
            modulusLength: 2048,
            publicExponent: 4097,
        });
        const publicPem = String(publicKey.export({ type: "spki", format: "pem" }));
        const encrypted = await encryptKfPasswordWithForge("standalone-password", publicPem);
        const decrypted = privateDecrypt({
            key: privateKey,
            padding: constants.RSA_PKCS1_OAEP_PADDING,
            oaepHash: "sha256",
        }, Buffer.from(encrypted, "base64")).toString("utf8");
        expect(decrypted).toBe("standalone-password");
    });
});
// end
// end
