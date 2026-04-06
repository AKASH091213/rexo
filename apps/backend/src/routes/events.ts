import { Router } from "express";

import { requireAuth } from "../middleware/auth.js";
import { AuditEventModel } from "../models/AuditEvent.js";

export const eventsRouter = Router();

eventsRouter.get("/:deviceId", requireAuth, async (request, response) => {
  const events = await AuditEventModel.find({ deviceId: request.params.deviceId })
    .sort({ createdAt: -1 })
    .limit(50);

  return response.json(
    events.map((event) => ({
      id: event._id.toString(),
      deviceId: event.deviceId,
      type: event.type,
      message: event.message,
      actorName: event.actorName ?? undefined,
      metadata: (event.metadata as Record<string, unknown>) ?? {},
      createdAt: event.createdAt.toISOString()
    }))
  );
});
