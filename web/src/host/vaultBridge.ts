// morrow's VaultBridge served by the native app, which reads and writes the vault folder
import type { VaultScan } from '../../vendor/morrow/src/core/vault/load';
import { encodePathForUrl } from '../../vendor/morrow/src/core/vault/paths';
import type { VaultOp, VaultOpResult } from '../../vendor/morrow/src/core/vault/plan';
import type { VaultBridge, VaultChange, VaultFileInfo } from '../../vendor/morrow/src/storage/vaultBridge';
import { call, fromBase64, toBase64 } from './rpc';

const listeners = new Set<(changes: VaultChange[]) => void>();

// changes the app saw in the folder, handed to whoever opened the vault
export function deliverChanges(changes: VaultChange[]): void {
  for (const listener of listeners) listener(changes);
}

export const VAULT_FILE_SCHEME = 'synapse-vault';

export function nativeVaultBridge(name: string): VaultBridge {
  return {
    root: name,
    scan: () => call<VaultScan>('scan'),
    apply: (ops: VaultOp[]) => call<VaultOpResult[]>('apply', ops),
    readText: (path) => call<string | null>('readText', path),
    readBytes: async (path) => {
      const data = await call<string | null>('readBytes', path);
      return data === null ? null : fromBase64(data);
    },
    createFile: (path, data) => call<void>('createFile', path, toBase64(data)),
    exists: (path) => call<boolean>('exists', path),
    listFiles: (dir) => call<VaultFileInfo[]>('listFiles', dir),
    onChange(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    fileUrl: (path) => `${VAULT_FILE_SCHEME}://vault/${encodePathForUrl(path)}`,
  };
}
