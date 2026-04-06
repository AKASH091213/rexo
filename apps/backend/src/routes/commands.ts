import { Router } from "express";

import type { DeviceCommandRequest } from "@iot/shared";

import { requireAuth, type AuthenticatedRequest } from "../middleware/auth.js";
import { createAuditEvent } from "../services/auditService.js";
import { publishActuatorCommand } from "../services/mqttService.js";
import { emitEvent } from "../services/socketService.js";

export const commandsRouter = Router();

commandsRouter.post("/:deviceId", requireAuth, async (request: AuthenticatedRequest, response) => {
  const deviceId = String(request.params.deviceId);
  const body = request.body as DeviceCommandRequest;

  if ((body.type !== "valve" && body.type !== "motor") || typeof body.value !== "boolean") {
    return response.status(400).json({ message: "Invalid command payload" });
  }

  publishActuatorCommand(deviceId, body.type, body.value);

  const label = body.type === "valve" ? "Solenoid valve" : "Tank motor";

  const event = await createAuditEvent({
    deviceId,
    userId: request.auth?.sub,
    actorName: request.auth?.name,
    type: "command",
    message: body.value ? `${label} turned ON from dashboard.` : `${label} turned OFF from dashboard.`,
    metadata: body as unknown as Record<string, unknown>
  });

  emitEvent(deviceId, event);

  return response.status(202).json({ accepted: true });
});
