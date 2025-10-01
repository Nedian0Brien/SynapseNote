import { emit, EventType } from '@/application/session/event';

// Decode JWT to extract user info (simple base64 decode, no verification)
function decodeJWT(token: string): { sub: string; email: string } | null {
  try {

    const parts = token.split('.');

    if (parts.length !== 3) return null;

    const payload = JSON.parse(atob(parts[1]));

    return {
      sub: payload.sub,
      email: payload.email,
    };
  } catch (e) {

    console.error('Failed to decode JWT:', e);
    return null;
  }
}

export function saveGoTrueAuth(tokenData: string) {
  const parsed = JSON.parse(tokenData);

  // Decode JWT to extract user info if not present
  if (!parsed.user && parsed.access_token) {
    const userInfo = decodeJWT(parsed.access_token);

    if (userInfo) {
      parsed.user = {
        id: userInfo.sub,
        email: userInfo.email,
      };
    }
  }

  localStorage.setItem('token', JSON.stringify(parsed));
  emit(EventType.SESSION_REFRESH, JSON.stringify(parsed));
}

export function invalidToken() {
  localStorage.removeItem('token');
  emit(EventType.SESSION_INVALID);
}

export function isTokenValid() {
  return !!localStorage.getItem('token');
}

export function getToken() {
  return localStorage.getItem('token');
}

export function getTokenParsed(): {
  access_token: string;
  expires_at: number;
  refresh_token: string;
  user: {
    id: string;
    email: string;
  }
} | null {
  const token = getToken();

  if (!token) {
    return null;
  }

  try {
    return JSON.parse(token);
  } catch (e) {
    return null;
  }
}
