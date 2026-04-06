import { Router } from "express";

import { telemetryRangeToMs } from "@iot/shared";
import type { TelemetryRange } from "@iot/shared";

import { requireAuth } from "../middleware/auth.js";
import { TelemetryModel } from "../models/Telemetry.js";

export const telemetryRouter = Router();

telemetryRouter.get("/:deviceId", requireAuth, async (request, response) => {
  const deviceId = String(request.params.deviceId);
  const range = (request.query.range as TelemetryRange | undefined) ?? "24h";
  const timeWindowMs = telemetryRangeToMs[range] ?? telemetryRangeToMs["24h"];
  const cutoff = new Date(Date.now() - timeWindowMs);

  const telemetry = await TelemetryModel.find({
    deviceId,
    receivedAt: { $gte: cutoff }
  })
    .sort({ receivedAt: 1 })
    .limit(range === "30d" ? 3000 : range === "7d" ? 1500 : 500);

  return response.json(
    telemetry.map((point) => ({
      deviceId: point.deviceId,
      flowRate: point.flowRate,
      totalLitres: point.totalLitres,
      waterLevel: point.waterLevel,
      valve: point.valve,
      motor: point.motor,
      personDetected: point.personDetected,
      receivedAt: point.receivedAt.toISOString()
    }))
  );
});
