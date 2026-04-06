import type {
  DashboardResponse,
  DeviceCommandRequest,
  DeviceSettings,
  SessionResponse,
  TelemetryPoint,
  TelemetryRange
} from "@iot/shared";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {})
    }
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || "Request failed");
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

export const api = {
  getSession() {
    return request<SessionResponse>("/auth/session");
  },
  loginWithGoogle(credential: string) {
    return request<SessionResponse>("/auth/google", {
      method: "POST",
      body: JSON.stringify({ credential })
    });
  },
  logout() {
    return request<void>("/auth/logout", {
      method: "POST"
    });
  },
  getDashboard() {
    return request<DashboardResponse>("/dashboard");
  },
  getTelemetry(deviceId: string, range: TelemetryRange) {
    return request<TelemetryPoint[]>(`/telemetry/${deviceId}?range=${range}`);
  },
  updateSettings(deviceId: string, payload: Omit<DeviceSettings, "updatedAt"> & { updatedAt?: string }) {
    return request<DeviceSettings>(`/settings/${deviceId}`, {
      method: "PUT",
      body: JSON.stringify(payload)
    });
  },
  sendCommand(deviceId: string, payload: DeviceCommandRequest) {
    return request<{ accepted: true }>(`/commands/${deviceId}`, {
      method: "POST",
      body: JSON.stringify(payload)
    });
  }
};

export { API_URL };
