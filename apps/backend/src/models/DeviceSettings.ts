import { Schema, model } from "mongoose";

const deviceSettingsSchema = new Schema(
  {
    deviceId: { type: String, required: true, unique: true, index: true },
    autoCutoffTimeoutSec: { type: Number, default: 5 },
    minTankLevel: { type: Number, default: 20 },
    maxTankLevel: { type: Number, default: 90 },
    alerts: {
      lowWater: { type: Boolean, default: true },
      highWater: { type: Boolean, default: true },
      offline: { type: Boolean, default: true },
      autoCutoff: { type: Boolean, default: true }
    }
  },
  {
    timestamps: true
  }
);

export const DeviceSettingsModel = model("DeviceSettings", deviceSettingsSchema);
