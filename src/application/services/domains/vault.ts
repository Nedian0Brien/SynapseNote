export {
  createVaultDocument as createDocument,
  deleteVaultDocument as deleteDocument,
  getVaultDocument as getDocument,
  getVaultFile as getFile,
  getVaultGraph as getGraph,
  getVaultObject as getObject,
  listVaultNodes as listNodes,
  moveVaultDocument as moveDocument,
  writeVaultDocument as writeDocument,
  writeVaultObject as writeObject,
} from '../js-services/http/vault-api';

export type {
  VaultDocument,
  VaultDocumentMeta,
  VaultEdge,
  VaultGraph,
  VaultNode,
  VaultObject,
  VaultObjectSnapshot,
  WriteVaultObjectPayload,
} from '../js-services/http/vault-api';
