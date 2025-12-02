"use client";

export type JwtPayload = {
  sub: string;
  username?: string;
  [key: string]: any;
};

const TOKEN_KEY = "audio_jwt";

export function saveToken(token: string) {
  if (typeof window === "undefined") return;
  localStorage.setItem(TOKEN_KEY, token);
}

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function clearToken() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(TOKEN_KEY);
}

export function decodeJwt(token: string): JwtPayload | null {
  try {
    const payload = token.split(".")[1];
    return JSON.parse(atob(payload));
  } catch {
    return null;
  }
}

export function getCurrentUser() {
  const token = getToken();
  if (!token) return null;

  const decoded = decodeJwt(token);
  if (!decoded) return null;

  return {
    id: decoded.userId || decoded.sub || decoded.id,
    email: decoded.email,
    sessionId: decoded.sessionId,
    ...decoded
  };
}


