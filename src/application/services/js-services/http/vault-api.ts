import { APIResponse, executeAPIRequest, getAxios, handleAPIError } from './core';

export type VaultDocument = {
  id: string;
  title: string;
  content: string;
  updatedAt: string;
  hash: string;
};

export type VaultDocumentMeta = Omit<VaultDocument, 'content'>;

export type VaultNode = {
  id: string;
  title: string;
  nodeType: 'Directory' | 'Document' | 'Tag' | string;
  tags: string[];
  updatedAt: string;
};

export type VaultEdge = {
  source: string;
  target: string;
  edgeType: 'directory' | 'wikilink' | 'tag' | string;
  weight: number;
};

export type VaultGraph = {
  nodes: VaultNode[];
  edges: VaultEdge[];
};

export type VaultObjectSnapshot = {
  documentPath: string;
  marker?: string;
  markdown: string;
};

export type VaultObject = {
  id: string;
  objectType: string;
  data: unknown;
  updatedAt: string;
  hash: string;
};

export type WriteVaultObjectPayload = {
  objectType?: string;
  data: unknown;
  snapshot?: VaultObjectSnapshot;
};

export function listVaultNodes(workspaceId: string) {
  return executeAPIRequest<VaultNode[]>(() =>
    getAxios()?.get<APIResponse<VaultNode[]>>(`/api/workspace/${workspaceId}/vault/nodes`)
  );
}

export function getVaultGraph(workspaceId: string) {
  return executeAPIRequest<VaultGraph>(() =>
    getAxios()?.get<APIResponse<VaultGraph>>(`/api/workspace/${workspaceId}/vault/graph`)
  );
}

export function createVaultDocument(workspaceId: string, path: string, content = '') {
  return executeAPIRequest<VaultDocumentMeta>(() =>
    getAxios()?.post<APIResponse<VaultDocumentMeta>>(`/api/workspace/${workspaceId}/vault/documents`, {
      path,
      content,
    })
  );
}

export function getVaultDocument(workspaceId: string, path: string) {
  return executeAPIRequest<VaultDocument>(() =>
    getAxios()?.get<APIResponse<VaultDocument>>(`/api/workspace/${workspaceId}/vault/documents/${encodeVaultPath(path)}`)
  );
}

export function writeVaultDocument(workspaceId: string, path: string, content: string, baseHash?: string) {
  return executeAPIRequest<VaultDocumentMeta>(() =>
    getAxios()?.put<APIResponse<VaultDocumentMeta>>(
      `/api/workspace/${workspaceId}/vault/documents/${encodeVaultPath(path)}`,
      {
        content,
        baseHash,
      }
    )
  );
}

export function moveVaultDocument(workspaceId: string, path: string, newPath: string) {
  return executeAPIRequest<VaultDocumentMeta>(() =>
    getAxios()?.post<APIResponse<VaultDocumentMeta>>(
      `/api/workspace/${workspaceId}/vault/documents/${encodeVaultPath(path)}/move`,
      { newPath }
    )
  );
}

export function deleteVaultDocument(workspaceId: string, path: string) {
  return executeAPIRequest<{ id: string; trashedPath: string }>(() =>
    getAxios()?.delete<APIResponse<{ id: string; trashedPath: string }>>(
      `/api/workspace/${workspaceId}/vault/documents/${encodeVaultPath(path)}`
    )
  );
}

export async function getVaultFile(workspaceId: string, path: string) {
  try {
    const axios = getAxios();

    if (!axios) {
      return Promise.reject({
        code: -1,
        message: 'API service not initialized',
      });
    }

    const response = await axios.get<Blob>(`/api/workspace/${workspaceId}/vault/files/${encodeVaultPath(path)}`, {
      responseType: 'blob',
    });

    return response.data;
  } catch (error) {
    return Promise.reject(handleAPIError(error));
  }
}

export function getVaultObject(workspaceId: string, objectId: string) {
  return executeAPIRequest<VaultObject>(() =>
    getAxios()?.get<APIResponse<VaultObject>>(
      `/api/workspace/${workspaceId}/vault/objects/${encodeURIComponent(objectId)}`
    )
  );
}

export function writeVaultObject(workspaceId: string, objectId: string, payload: WriteVaultObjectPayload) {
  return executeAPIRequest<VaultObject>(() =>
    getAxios()?.put<APIResponse<VaultObject>>(
      `/api/workspace/${workspaceId}/vault/objects/${encodeURIComponent(objectId)}`,
      payload
    )
  );
}

function encodeVaultPath(path: string) {
  return path
    .split('/')
    .filter(Boolean)
    .map((part) => encodeURIComponent(part))
    .join('/');
}
