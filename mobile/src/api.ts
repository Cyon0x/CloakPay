/**
 * The API client.
 *
 * Sessions are bearer tokens held in the platform keychain rather than cookies.
 * React Native has no dependable cookie jar across a deep-link round trip, and a
 * keychain entry is the storage the platform actually designs for this.
 */
import * as SecureStore from "expo-secure-store";
import Constants from "expo-constants";

const extra = (Constants.expoConfig?.extra ?? {}) as Record<string, unknown>;

export const API_URL =
  process.env.EXPO_PUBLIC_API_URL ??
  (typeof extra.apiUrl === "string" ? extra.apiUrl : "http://localhost:3200");

/**
 * The public origin. Payment links and QR codes are built from this, so it must
 * be the origin the web app is actually served from, not a guess.
 */
export const APP_URL =
  process.env.EXPO_PUBLIC_APP_URL ??
  (typeof extra.appUrl === "string" ? extra.appUrl : "http://localhost:3200");

export const EXPLORER_URL =
  (typeof extra.explorerUrl === "string" && extra.explorerUrl) ||
  "https://elysium.kinetiq.xyz/testnet-explorer";

const TOKEN_KEY = "cloakpay.session";

let cached: string | null = null;

export async function getToken(): Promise<string | null> {
  if (cached) return cached;
  cached = await SecureStore.getItemAsync(TOKEN_KEY);
  return cached;
}

export async function setToken(token: string | null) {
  cached = token;
  if (token) await SecureStore.setItemAsync(TOKEN_KEY, token);
  else await SecureStore.deleteItemAsync(TOKEN_KEY);
}

export class ApiError extends Error {
  code: string;
  constructor(message: string, code = "error") {
    super(message);
    this.code = code;
  }
}

interface Envelope<T> {
  ok: boolean;
  data?: T;
  error?: { code: string; message: string };
}

export async function api<T>(
  path: string,
  init: RequestInit & { anonymous?: boolean } = {},
): Promise<T> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    ...((init.headers as Record<string, string>) ?? {}),
  };
  if (!init.anonymous) {
    const token = await getToken();
    if (token) headers.authorization = `Bearer ${token}`;
  }

  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, { ...init, headers });
  } catch {
    throw new ApiError("Could not reach CloakPay. Check your connection.", "network");
  }

  let body: Envelope<T>;
  try {
    body = (await response.json()) as Envelope<T>;
  } catch {
    throw new ApiError("CloakPay returned an unexpected response.", "bad_response");
  }

  if (!body.ok) throw new ApiError(body.error?.message ?? "Something went wrong.", body.error?.code);
  return body.data as T;
}
