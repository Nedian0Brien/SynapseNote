import { AxiosRequestConfig, AxiosResponse } from 'axios';
import { getAxiosInstance } from './http_api';

/**
 * Raw axios access for endpoints that don't return ApiResponse format
 * These bypass the ApiResponse processing in the interceptor
 */

function ensureAxiosInstance() {
  const instance = getAxiosInstance();
  
  if (!instance) {
    throw new Error('Axios instance not initialized');
  }
  
  return instance;
}

/**
 * Raw GET request - returns full axios response without ApiResponse processing
 * Use this for endpoints that return raw data, blobs, or non-standard formats
 */
export async function rawGet<T = unknown>(url: string, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
  const instance = ensureAxiosInstance();
  
  return await instance.get<T>(url, config);
}

/**
 * Raw POST request - returns full axios response without ApiResponse processing
 */
export async function rawPost<T = unknown>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
  const instance = ensureAxiosInstance();
  
  return await instance.post<T>(url, data, config);
}

/**
 * Raw PUT request - returns full axios response without ApiResponse processing
 */
export async function rawPut<T = unknown>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
  const instance = ensureAxiosInstance();
  
  return await instance.put<T>(url, data, config);
}

/**
 * Raw PATCH request - returns full axios response without ApiResponse processing
 */
export async function rawPatch<T = unknown>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
  const instance = ensureAxiosInstance();
  
  return await instance.patch<T>(url, data, config);
}

/**
 * Raw DELETE request - returns full axios response without ApiResponse processing
 */
export async function rawDelete<T = unknown>(url: string, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
  const instance = ensureAxiosInstance();
  
  return await instance.delete<T>(url, config);
}

/**
 * Download file as blob
 */
export async function downloadFile(url: string, config?: AxiosRequestConfig): Promise<Blob> {
  const instance = ensureAxiosInstance();
  const response = await instance.get(url, {
    ...config,
    responseType: 'blob'
  });
  
  return response.data;
}

/**
 * Get raw text response
 */
export async function getRawText(url: string, config?: AxiosRequestConfig): Promise<string> {
  const instance = ensureAxiosInstance();
  const response = await instance.get(url, {
    ...config,
    responseType: 'text'
  });
  
  return response.data;
}