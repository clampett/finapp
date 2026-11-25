export const DEMO_BUDGET_ENC_PREFIX = 'enc:v1:';

export const toB64 = (bytes: Uint8Array): string => {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
};

export const fromB64 = (b64: string): Uint8Array<ArrayBuffer> => {
  const binary = atob(b64);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
};

export const getDemoStorageSecret = (storageKey: string): string => {
  const encKey = `${storageKey}:k`;
  let existing: string | null = null;
  try {
    existing = localStorage.getItem(encKey) || sessionStorage.getItem(encKey);
  } catch {}
  if (existing) {
    try {
      sessionStorage.setItem(encKey, existing);
    } catch {}
    return existing;
  }
  const generated = `${storageKey}:${crypto.randomUUID()}`;
  try {
    localStorage.setItem(encKey, generated);
  } catch {}
  try {
    sessionStorage.setItem(encKey, generated);
  } catch {}
  return generated;
};

export const deriveDemoCryptoKey = async (storageKey: string): Promise<CryptoKey> => {
  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(getDemoStorageSecret(storageKey)),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: enc.encode(storageKey),
      iterations: 100000,
      hash: 'SHA-256',
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
};

export const encryptForDemoStorage = async (
  storageKey: string,
  payload: unknown,
): Promise<string> => {
  const key = await deriveDemoCryptoKey(storageKey);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = new TextEncoder().encode(JSON.stringify(payload));
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data);
  return `${DEMO_BUDGET_ENC_PREFIX}${toB64(iv)}:${toB64(new Uint8Array(cipher))}`;
};

export const decryptFromDemoStorage = async <T>(
  storageKey: string,
  raw: string | null,
): Promise<T | null> => {
  if (!raw) return null;
  if (!raw.startsWith(DEMO_BUDGET_ENC_PREFIX)) {
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }
  if (!localStorage.getItem(storageKey + ':k') && !sessionStorage.getItem(storageKey + ':k')) {
    throw new Error('Open the tab that saved this demo budget to recover its original key.');
  }
  const body = raw.slice(DEMO_BUDGET_ENC_PREFIX.length);
  const [ivB64, dataB64] = body.split(':');
  if (!ivB64 || !dataB64) return null;
  try {
    const key = await deriveDemoCryptoKey(storageKey);
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: fromB64(ivB64) },
      key,
      fromB64(dataB64),
    );
    return JSON.parse(new TextDecoder().decode(plain)) as T;
  } catch {
    return null;
  }
};
