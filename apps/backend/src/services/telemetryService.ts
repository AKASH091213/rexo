import type { DeviceTelemetryPayload, TelemetryPoint } from "@iot/shared";

import { DeviceModel } from "../models/Device.js";
import { TelemetryModel } from "../models/Telemetry.js";
import { createAuditEvent } from "./auditService.js";
import { ensureDeviceSettings, getDeviceSnapshot } from "./deviceService.js";
import { emitEvent, emitTelemetry } from "./socketService.js";

function isValidTelemetryPayload(payload: unknown): payload is DeviceTelemetryPayload {
  if (!payload || typeof payload !== "object") {
    return false;
  }

  const candidate = payload as Record<string, unknown>;
  const hasNewActuators = typeof candidate.valve === "boolean" && typeof candidate.motor === "boolean";
  const hasLegacyRelay = typeof candidate.relay === "boolean";
  const hasPersonDetected = typeof candidate.personDetected === "boolean";

  return (
    typeof candidate.flowRate === "number" &&
    typeof candidate.totalLitres === "number" &&
    typeof candidate.waterLevel === "number" &&
    (hasNewActuators || hasLegacyRelay) &&
    (hasPersonDetected || !("personDetected" in candidate))
  );
}

function normalizeTelemetryPayload(payload: DeviceTelemetryPayload | (Record<string, unknown> & {
  flowRate: number;
  totalLitres: number;
  waterLevel: number;
  relay?: boolean;
  valve?: boolean;
  motor?: boolean;
  personDetected?: boolean;
})): DeviceTelemetryPayload {
  return {
    flowRate: payload.flowRate,
    totalLitres: payload.totalLitres,
    waterLevel: payload.waterLevel,
    valve: typeof payload.valve === "boolean" ? payload.valve : Boolean(payload.relay),
    motor: typeof payload.motor === "boolean" ? payload.motor : false,
    personDetected: typeof payload.personDetected === "boolean" ? payload.personDetected : false
  };
}

export async function ingestTelemetry(deviceId: string, payload: unknown) {
  if (!isValidTelemetryPayload(payload)) {
    throw new Error("Invalid telemetry payload");
  }

  const receivedAt = new Date();
  const normalizedPayload = normalizeTelemetryPayload(payload as Record<string, unknown> & DeviceTelemetryPayload);

  await Promise.all([
    TelemetryModel.create({
      deviceId,
      ...normalizedPayload,
      receivedAt
    }),
    DeviceModel.findOneAndUpdate(
      { deviceId },
      {
        $set: {
          isOnline: true,
          lastSeenAt: receivedAt,
          latestState: normalizedPayload
        }
      },
      { upsert: true, new: true }
    )
  ]);

  const [settings, snapshot] = await Promise.all([
    ensureDeviceSettings(deviceId),
    getDeviceSnapshot(deviceId)
  ]);

  const telemetry: TelemetryPoint = {
    deviceId,
    ...normalizedPayload,
    receivedAt: receivedAt.toISOString()
  };

  emitTelemetry(deviceId, telemetry, snapshot);

  if (settings.alerts.lowWater && normalizedPayload.waterLevel <= settings.minTankLevel) {
    const event = await createAuditEvent({
      deviceId,
      type: "alert",
      message: `Water level is low at ${normalizedPayload.waterLevel.toFixed(1)} cm.`,
      metadata: { waterLevel: normalizedPayload.waterLevel, threshold: settings.minTankLevel }
    });
    emitEvent(deviceId, event);
  }

  if (settings.alerts.highWater && normalizedPayload.waterLevel >= settings.maxTankLevel) {
    const event = await createAuditEvent({
      deviceId,
      type: "alert",
      message: `Water level reached high threshold at ${normalizedPayload.waterLevel.toFixed(1)} cm.`,
      metadata: { waterLevel: normalizedPayload.waterLevel, threshold: settings.maxTankLevel }
    });
    emitEvent(deviceId, event);
  }

  return telemetry;
}
