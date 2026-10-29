import type { Session } from "@/types/weave";

const webLocalApiUrl =
  typeof window !== "undefined" && window.location?.hostname
    ? `${window.location.protocol}//${window.location.hostname}:8000`
    : "http://127.0.0.1:8000";

export const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || webLocalApiUrl;

export class ApiClient {
  constructor(
    private readonly getSession: () => Session | null,
    private readonly onUnauthorized: () => void,
    private readonly baseUrl = API_BASE_URL,
  ) {}

  async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const headers = new Headers(options.headers);
    const hasBody = options.body != null;
    if (hasBody) headers.set("content-type", "application/json");
    const session = this.getSession();
    if (session) headers.set("authorization", `Bearer ${session.access_token}`);

    const response = await fetch(`${this.baseUrl}${path}`, { ...options, headers });
    if (response.status === 401) this.onUnauthorized();
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.detail || "Request failed");
    return data as T;
  }
}
