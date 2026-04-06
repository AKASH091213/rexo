import { Schema, model } from "mongoose";

const auditEventSchema = new Schema(
  {
    deviceId: { type: String, required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", default: null },
    actorName: { type: String, default: null },
    type: {
      type: String,
      enum: ["command", "telemetry", "alert", "settings", "system"],
      required: true
    },
    message: { type: String, required: true },
    metadata: { type: Schema.Types.Mixed, default: {} }
  },
  {
    timestamps: { createdAt: true, updatedAt: false }
  }
);

export const AuditEventModel = model("AuditEvent", auditEventSchema);
