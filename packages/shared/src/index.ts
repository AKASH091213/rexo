export type UserRole = "admin" | "operator";

export interface DeviceTelemetryPayload {
  flowRate: number;
  totalLitres: number;
  waterLevel: number;
  valve: boolean;
  motor: boolean;
  personDetected: boolean;
}

export interface DeviceSnapshot extends DeviceTelemetryPayload {
  deviceId: string;
  isOnline: boolean;
  lastSeenAt: string | null;
  updatedAt: string | null;
  alertState: {
    lowWater: boolean;
    highWater: boolean;
    offline: boolean;
  };
}

export interface DeviceSettings {
  deviceId: string;
  autoCutoffTimeoutSec: number;
  minTankLevel: number;
  maxTankLevel: number;
  alerts: {
    lowWater: boolean;
    highWater: boolean;
    offline: boolean;
    autoCutoff: boolean;
  };
  updatedAt: string;
}

export interface DeviceSettingsMessage {
  deviceId: string;
  autoCutoffTimeoutSec: number;
  minTankLevel: number;
  maxTankLevel: number;
}

export interface AuditEvent {
  id: string;
  deviceId: string;
  type: "command" | "telemetry" | "alert" | "settings" | "system";
  message: string;
  actorName?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export interface DeviceCommandRequest {
  type: "valve" | "motor";
  value: boolean;
}

export interface TelemetryPoint extends DeviceTelemetryPayload {
  deviceId: string;
  receivedAt: string;
}

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  avatarUrl?: string;
  role: UserRole;
}

export interface SessionResponse {
  authenticated: boolean;
  user: SessionUser | null;
}

export interface DashboardResponse {
  device: DeviceSnapshot;
  settings: DeviceSettings;
  recentEvents: AuditEvent[];
}

export type TelemetryRange = "24h" | "7d" | "30d";

export const telemetryRangeToMs: Record<TelemetryRange, number> = {
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000
};
