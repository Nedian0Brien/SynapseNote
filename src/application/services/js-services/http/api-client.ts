import { AxiosRequestConfig } from 'axios';
import { getAxiosInstance } from './http_api';

/**
 * Type-safe API client wrapper that guarantees response data exists
 * These functions work with the interceptor to provide clean API access
 */

function ensureAxiosInstance() {
  const instance = getAxiosInstance();
  
  if (!instance) {
    throw new Error('Axios instance not initialized');
  }
  
  return instance;
}

/**
 * GET request with guaranteed response data
 */
export async function apiGet<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
  const instance = ensureAxiosInstance();
  const response = await instance.get<T>(url, config);
  
  return response.data;
}

/**
 * POST request with guaranteed response data
 */
export async function apiPost<T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> {
  const instance = ensureAxiosInstance();
  const response = await instance.post<T>(url, data, config);
  
  return response.data;
}

/**
 * PUT request with guaranteed response data
 */
export async function apiPut<T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> {
  const instance = ensureAxiosInstance();
  const response = await instance.put<T>(url, data, config);
  
  return response.data;
}

/**
 * PATCH request with guaranteed response data
 */
export async function apiPatch<T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> {
  const instance = ensureAxiosInstance();
  const response = await instance.patch<T>(url, data, config);
  
  return response.data;
}

/**
 * DELETE request with guaranteed response data
 */
export async function apiDelete<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
  const instance = ensureAxiosInstance();
  const response = await instance.delete<T>(url, config);
  
  return response.data;
}

/**
 * HEAD request with guaranteed response data
 */
export async function apiHead<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
  const instance = ensureAxiosInstance();
  const response = await instance.head<T>(url, config);
  
  return response.data;
}

/**
 * For void responses (no data expected)
 */
export async function apiGetVoid(url: string, config?: AxiosRequestConfig): Promise<void> {
  await apiGet<void>(url, config);
}

export async function apiPostVoid(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<void> {
  await apiPost<void>(url, data, config);
}

export async function apiPutVoid(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<void> {
  await apiPut<void>(url, data, config);
}

export async function apiPatchVoid(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<void> {
  await apiPatch<void>(url, data, config);
}

export async function apiDeleteVoid(url: string, config?: AxiosRequestConfig): Promise<void> {
  await apiDelete<void>(url, config);
}