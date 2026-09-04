import { useUserStore } from '@/stores/userStore.js';

export function createRSAUtils() {
  let error = null;
  let isLoading = false;
  const userStore = useUserStore();
  const pemToArrayBuffer = (pem) => {
    const b64 = pem
      .replace(/-----BEGIN PUBLIC KEY-----/, '')
      .replace(/-----END PUBLIC KEY-----/, '')
      .replace(/\s/g, '');
    const binary = atob(b64);
    const buffer = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      buffer[i] = binary.charCodeAt(i);
    }
    return buffer;
  };
  // 使用公钥加密
  const encrypt = async (data) => {
    try {
      const keyData = pemToArrayBuffer(userStore.publicKey);
      const publicKey = await window.crypto.subtle.importKey(
        'spki',
        keyData,
        { name: 'RSA-OAEP', hash: 'SHA-256' },
        false,
        ['encrypt'],
      );
      const encryptedData = await window.crypto.subtle.encrypt(
        { name: 'RSA-OAEP' },
        publicKey,
        new TextEncoder().encode(data),
      );
      return btoa(String.fromCharCode(...new Uint8Array(encryptedData)));
    } catch (err) {
      error = err;
      throw err;
    } finally {
      isLoading = false;
    }
  };
  return {
    encrypt,
  };
}
