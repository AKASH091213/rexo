import type { Server as HttpServer } from "node:http";

import { Server } from "socket.io";

import type { AuditEvent, DeviceSettings, DeviceSnapshot, TelemetryPoint } from "@iot/shared";

import { env } from "../config/env.js";

let io: Server | null = null;

export function createSocketServer(server: HttpServer) {
  io = new Server(server, {
    cors: {
      origin: env.frontendUrl,
      credentials: true
    }
  });

  io.on("connection", (socket) => {
    socket.on("join-device", (deviceId: string) => {
      socket.join(deviceId);
    });
  });

  return io;
}

export function emitTelemetry(deviceId: string, telemetry: TelemetryPoint, snapshot: DeviceSnapshot) {
  io?.to(deviceId).emit("telemetry:update", { telemetry, snapshot });
}

export function emitSettingsUpdate(deviceId: string, settings: DeviceSettings) {
  io?.to(deviceId).emit("settings:update", settings);
}

export function emitEvent(deviceId: string, event: AuditEvent) {
  io?.to(deviceId).emit("event:new", event);
}
