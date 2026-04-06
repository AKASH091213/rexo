import { Schema, model } from "mongoose";

const deviceSchema = new Schema(
  {
    deviceId: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true, default: "Main Water System" },
    telemetryTopic: { type: String, required: true },
    commandTopic: { type: String, required: true },
    isOnline: { type: Boolean, default: false },
    lastSeenAt: { type: Date, default: null },
    latestState: {
      flowRate: { type: Number, default: 0 },
      totalLitres: { type: Number, default: 0 },
      waterLevel: { type: Number, default: 0 },
      valve: { type: Boolean, default: false },
      motor: { type: Boolean, default: false },
      personDetected: { type: Boolean, default: false }
    }
  },
  {
    timestamps: true
  }
);

export const DeviceModel = model("Device", deviceSchema);
