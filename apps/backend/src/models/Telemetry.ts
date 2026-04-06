import { Schema, model } from "mongoose";

const telemetrySchema = new Schema(
  {
    deviceId: { type: String, required: true, index: true },
    flowRate: { type: Number, required: true },
    totalLitres: { type: Number, required: true },
    waterLevel: { type: Number, required: true },
    valve: { type: Boolean, required: true },
    motor: { type: Boolean, required: true },
    personDetected: { type: Boolean, required: true },
    receivedAt: { type: Date, required: true, index: true }
  },
  {
    timestamps: false
  }
);

export const TelemetryModel = model("Telemetry", telemetrySchema);
