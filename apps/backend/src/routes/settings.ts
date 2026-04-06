import { Router } from "express";

import type { DeviceSettings } from "@iot/shared";

import { requireAuth, type AuthenticatedRequest } from "../middleware/auth.js";
import { DeviceSettingsModel } from "../models/DeviceSettings.js";
import { createAuditEvent } from "../services/auditService.js";
import { ensureDeviceSettings } from "../services/deviceService.js";
import { publishDeviceSettings } from "../services/mqttService.js";
import { emitEvent, emitSettingsUpdate } from "../services/socketService.js";

export const settingsRouter = Router();

settingsRouter.get("/:deviceId", requireAuth, async (request, response) => {
  const settings = await ensureDeviceSettings(String(request.params.deviceId));
  return response.json(settings);
});

settingsRouter.put("/:deviceId", requireAuth, async (request: AuthenticatedRequest, response) => {
  const deviceId = String(request.params.deviceId);
  const body = request.body as Partial<DeviceSettings>;

  const settings = await DeviceSettingsModel.findOneAndUpdate(
    { deviceId },
    {
      $set: {
        autoCutoffTimeoutSec: body.autoCutoffTimeoutSec,
        minTankLevel: body.minTankLevel,
        maxTankLevel: body.maxTankLevel,
        alerts: body.alerts
      }
    },
    { new: true, upsert: true }
  );

  const normalized: DeviceSettings = {
    deviceId: settings.deviceId,
    autoCutoffTimeoutSec: settings.autoCutoffTimeoutSec,
    minTankLevel: settings.minTankLevel,
    maxTankLevel: settings.maxTankLevel,
    alerts: {
      lowWater: settings.alerts?.lowWater ?? true,
      highWater: settings.alerts?.highWater ?? true,
      offline: settings.alerts?.offline ?? true,
      autoCutoff: settings.alerts?.autoCutoff ?? true
    },
    updatedAt: settings.updatedAt.toISOString()
  };

  const event = await createAuditEvent({
    deviceId,
    userId: request.auth?.sub,
    actorName: request.auth?.name,
    type: "settings",
    message: "System thresholds and alert preferences were updated.",
    metadata: normalized as unknown as Record<string, unknown>
  });

  publishDeviceSettings(normalized);
  emitSettingsUpdate(deviceId, normalized);
  emitEvent(deviceId, event);

  return response.json(normalized);
});
