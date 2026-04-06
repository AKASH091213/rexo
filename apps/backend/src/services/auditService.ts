import type { AuditEvent } from "@iot/shared";

import { AuditEventModel } from "../models/AuditEvent.js";

interface CreateAuditEventInput {
  deviceId: string;
  userId?: string;
  actorName?: string;
  type: AuditEvent["type"];
  message: string;
  metadata?: Record<string, unknown>;
}

export async function createAuditEvent(input: CreateAuditEventInput): Promise<AuditEvent> {
  const document = await AuditEventModel.create({
    deviceId: input.deviceId,
    userId: input.userId,
    actorName: input.actorName,
    type: input.type,
    message: input.message,
    metadata: input.metadata ?? {}
  });

  return {
    id: document._id.toString(),
    deviceId: document.deviceId,
    type: document.type,
    message: document.message,
    actorName: document.actorName ?? undefined,
    metadata: document.metadata ?? {},
    createdAt: document.createdAt.toISOString()
  };
}
