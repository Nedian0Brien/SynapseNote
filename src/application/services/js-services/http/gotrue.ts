import axios, { AxiosInstance } from 'axios';

import { emit, EventType } from '@/application/session';
import { afterAuth } from '@/application/session/sign_in';
import { getTokenParsed, saveGoTrueAuth } from '@/application/session/token';

import { parseGoTrueError } from './gotrue-error';
import { verifyToken } from './http_api';

export * from './gotrue-error';

let axiosInstance: AxiosInstance | null = null;

export function initGrantService(baseURL: string) {
  if (axiosInstance) {
    return;
  }

  axiosInstance = axios.create({
    baseURL,
  });

  axiosInstance.interceptors.request.use((config) => {
    Object.assign(config.headers, {
      'Content-Type': 'application/json',
    });

    return config;
  });
}

export async function refreshToken(refresh_token: string) {
  const response = await axiosInstance?.post<{
    access_token: string;
    expires_at: number;
    refresh_token: string;
  }>('/token?grant_type=refresh_token', {
    refresh_token,
  });

  const newToken = response?.data;

  if (newToken) {
    saveGoTrueAuth(JSON.stringify(newToken));
  } else {
    return Promise.reject('Failed to refresh token');
  }

  return newToken;
}

export async function signInWithPassword(params: { email: string; password: string; redirectTo: string }) {
  try {
    const response = await axiosInstance?.post<{
      access_token: string;
      expires_at: number;
      refresh_token: string;
    }>('/token?grant_type=password', {
      email: params.email,
      password: params.password,
    });

    const data = response?.data;

    if (data) {
      saveGoTrueAuth(JSON.stringify(data));
      emit(EventType.SESSION_VALID);
      afterAuth();
    } else {
      emit(EventType.SESSION_INVALID);
      return Promise.reject({
        code: -1,
        message: 'Failed to sign in with password',
      });
    }
    // eslint-disable-next-line
  } catch (e: any) {
    emit(EventType.SESSION_INVALID);

    // Parse error from response
    const error = parseGoTrueError({
      error: e.response?.data?.error,
      errorDescription: e.response?.data?.error_description || e.response?.data?.msg,
      errorCode: e.response?.status,
      message: e.response?.data?.message || 'Incorrect password. Please try again.',
    });

    return Promise.reject({
      code: error.code,
      message: error.message,
    });
  }
}

export async function forgotPassword(params: { email: string }) {
  try {
    const response = await axiosInstance?.post<{
      access_token: string;
      expires_at: number;
      refresh_token: string;
    }>('/recover', {
      email: params.email,
    });

    if (response?.data) {
      return;
    } else {
      emit(EventType.SESSION_INVALID);
      return Promise.reject({
        code: -1,
        message: 'Failed to send recovery email',
      });
    }
    // eslint-disable-next-line
  } catch (e: any) {
    emit(EventType.SESSION_INVALID);
    return Promise.reject({
      code: -1,
      message: e.message,
    });
  }
}

export async function changePassword(params: { password: string }) {
  try {
    const token = getTokenParsed();
    const access_token = token?.access_token;

    if (!access_token) {
      return Promise.reject({
        code: -1,
        message: 'You have not logged in yet. Can not change password.',
      });
    }

    await axiosInstance?.post<{
      code: number;
      msg: string;
    }>(
      '/user/change-password',
      {
        password: params.password,
        current_password: params.password,
      },
      {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${access_token}`,
        },
      }
    );

    return;
    // eslint-disable-next-line
  } catch (e: any) {
    emit(EventType.SESSION_INVALID);
    return Promise.reject({
      code: -1,
      message: e.response?.data?.msg || e.message,
    });
  }
}

export async function signInOTP({
  email,
  code,
  type = 'magiclink',
}: {
  email: string;
  code: string;
  type?: 'magiclink' | 'recovery';
}) {
  try {
    const response = await axiosInstance?.post<{
      access_token: string;
      expires_at: number;
      refresh_token: string;
      code?: number;
      msg?: string;
    }>('/verify', {
      email,
      token: code,
      type,
    });

    const data = response?.data;
    console.debug('signInOTP response data:', data);

    if (data) {
      if (!data.code) {
        // Save token to localStorage FIRST so axios interceptor can use it
        console.debug('Saving token data:', data);
        saveGoTrueAuth(JSON.stringify(data));

        if (type === 'magiclink') {
          emit(EventType.SESSION_VALID);
        }

        // Verify token with AppFlowy Cloud to create user if needed
        try {
          console.debug('[signInOTP] Calling verifyToken');
          await verifyToken(data.access_token);

          await new Promise(resolve => setTimeout(resolve, 500));
        } catch (error) {
          console.error('[signInOTP] Failed to verify token with AppFlowy Cloud:', error);
          emit(EventType.SESSION_INVALID);
          return Promise.reject({
            code: -1,
            message: 'Failed to create user account',
          });
        }

        afterAuth();
      } else {
        emit(EventType.SESSION_INVALID);
        return Promise.reject({
          code: data.code,
          message: data.msg,
        });
      }
    } else {
      emit(EventType.SESSION_INVALID);
      return Promise.reject({
        code: 'invalid_token',
        message: 'Invalid token',
      });
    }
    // eslint-disable-next-line
  } catch (e: any) {
    emit(EventType.SESSION_INVALID);
    return Promise.reject({
      code: e.response?.data?.code || e.response?.status,
      message: e.response?.data?.msg || e.message,
    });
  }

  return;
}

export async function signInWithMagicLink(email: string, authUrl: string) {
  const res = await axiosInstance?.post(
    '/magiclink',
    {
      code_challenge: '',
      code_challenge_method: '',
      data: {},
      email,
    },
    {
      headers: {
        Redirect_to: authUrl,
      },
    }
  );

  return res?.data;
}

export async function settings() {
  const res = await axiosInstance?.get('/settings');

  return res?.data;
}

export function signInGoogle(authUrl: string) {
  const provider = 'google';
  const redirectTo = encodeURIComponent(authUrl);
  const accessType = 'offline';
  const prompt = 'consent';
  const baseURL = axiosInstance?.defaults.baseURL;
  const url = `${baseURL}/authorize?provider=${provider}&redirect_to=${redirectTo}&access_type=${accessType}&prompt=${prompt}`;

  window.open(url, '_current');
}

export function signInApple(authUrl: string) {
  const provider = 'apple';
  const redirectTo = encodeURIComponent(authUrl);
  const baseURL = axiosInstance?.defaults.baseURL;
  const url = `${baseURL}/authorize?provider=${provider}&redirect_to=${redirectTo}`;

  window.open(url, '_current');
}

export function signInGithub(authUrl: string) {
  const provider = 'github';
  const redirectTo = encodeURIComponent(authUrl);
  const baseURL = axiosInstance?.defaults.baseURL;
  const url = `${baseURL}/authorize?provider=${provider}&redirect_to=${redirectTo}`;

  window.open(url, '_current');
}

export function signInDiscord(authUrl: string) {
  const provider = 'discord';
  const redirectTo = encodeURIComponent(authUrl);
  const baseURL = axiosInstance?.defaults.baseURL;
  const url = `${baseURL}/authorize?provider=${provider}&redirect_to=${redirectTo}`;

  window.open(url, '_current');
}
