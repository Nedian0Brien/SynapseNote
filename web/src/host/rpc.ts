// calls into the native app that answer later, matched to their replies by id
import { post } from '../bridge';

type Pending = { resolve: (value: unknown) => void; reject: (error: Error) => void };

const pending = new Map<number, Pending>();
let counter = 0;

export function call<T>(method: string, ...params: unknown[]): Promise<T> {
  const id = ++counter;
  return new Promise<T>((resolve, reject) => {
    pending.set(id, { resolve: resolve as (value: unknown) => void, reject });
    post({ type: 'rpc', id, method, params });
  });
}

export function settle(id: number, result: { ok: true; value: unknown } | { ok: false; error: string }): void {
  const waiting = pending.get(id);
  if (!waiting) return;
  pending.delete(id);
  if (result.ok) waiting.resolve(result.value);
  else waiting.reject(new Error(result.error));
}

// binary data crosses the bridge as base64
export function toBase64(data: ArrayBuffer): string {
  const bytes = new Uint8Array(data);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

export function fromBase64(text: string): ArrayBuffer {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}
