import { Router } from "express";

import type { DashboardResponse } from "@iot/shared";

import { env } from "../config/env.js";
import { requireAuth } from "../middleware/auth.js";
import { AuditEventModel } from "../models/AuditEvent.js";
import { ensureDeviceSettings, getDeviceSnapshot } from "../services/deviceService.js";

export const dashboardRouter = Router();

dashboardRouter.get("/", requireAuth, async (_request, response) => {
  const [device, settings, eventDocs] = await Promise.all([
    getDeviceSnapshot(env.defaultDeviceId),
    ensureDeviceSettings(env.defaultDeviceId),
    AuditEventModel.find({ deviceId: env.defaultDeviceId }).sort({ createdAt: -1 }).limit(20)
  ]);

  const payload: DashboardResponse = {
    device,
    settings,
    recentEvents: eventDocs.map((event) => ({
      id: event._id.toString(),
      deviceId: event.deviceId,
      type: event.type,
      message: event.message,
      actorName: event.actorName ?? undefined,
      metadata: (event.metadata as Record<string, unknown>) ?? {},
      createdAt: event.createdAt.toISOString()
    }))
  };

  return response.json(payload);
});
