import type { DeviceSettings, DeviceSnapshot } from "@iot/shared";

import { env } from "../config/env.js";
import { DeviceModel } from "../models/Device.js";
import { DeviceSettingsModel } from "../models/DeviceSettings.js";

const OFFLINE_THRESHOLD_MS = 30 * 1000;

export async function ensureDevice(deviceId = env.defaultDeviceId) {
  return DeviceModel.findOneAndUpdate(
    { deviceId },
    {
      $setOnInsert: {
        name: "Main Water System",
        telemetryTopic: env.mqttTelemetryTopic,
        commandTopic: `${env.mqttValveCommandTopic},${env.mqttMotorCommandTopic}`,
        latestState: {
          flowRate: 0,
          totalLitres: 0,
          waterLevel: 0,
          valve: false,
          motor: false,
          personDetected: false
        }
      }
    },
    {
      upsert: true,
      new: true
    }
  );
}

export async function ensureDeviceSettings(deviceId = env.defaultDeviceId): Promise<DeviceSettings> {
  const document = await DeviceSettingsModel.findOneAndUpdate(
    { deviceId },
    {
      $setOnInsert: {
        autoCutoffTimeoutSec: 5,
        minTankLevel: 20,
        maxTankLevel: 90,
        alerts: {
          lowWater: true,
          highWater: true,
          offline: true,
          autoCutoff: true
        }
      }
    },
    { upsert: true, new: true }
  );

  return {
    deviceId: document.deviceId,
    autoCutoffTimeoutSec: document.autoCutoffTimeoutSec,
    minTankLevel: document.minTankLevel,
    maxTankLevel: document.maxTankLevel,
    alerts: {
      lowWater: document.alerts?.lowWater ?? true,
      highWater: document.alerts?.highWater ?? true,
      offline: document.alerts?.offline ?? true,
      autoCutoff: document.alerts?.autoCutoff ?? true
    },
    updatedAt: document.updatedAt.toISOString()
  };
}

export async function getDeviceSnapshot(deviceId = env.defaultDeviceId): Promise<DeviceSnapshot> {
  const [device, settings] = await Promise.all([
    ensureDevice(deviceId),
    ensureDeviceSettings(deviceId)
  ]);

  const lastSeenAt = device.lastSeenAt ? new Date(device.lastSeenAt).toISOString() : null;
  const isOnline = Boolean(
    device.lastSeenAt && Date.now() - new Date(device.lastSeenAt).getTime() < OFFLINE_THRESHOLD_MS
  );
  const latestState = device.latestState ?? {
    flowRate: 0,
    totalLitres: 0,
    waterLevel: 0,
    valve: false,
    motor: false,
    personDetected: false
  };

  return {
    deviceId: device.deviceId,
    flowRate: latestState.flowRate,
    totalLitres: latestState.totalLitres,
    waterLevel: latestState.waterLevel,
    valve: latestState.valve,
    motor: latestState.motor,
    personDetected: latestState.personDetected,
    isOnline,
    lastSeenAt,
    updatedAt: device.updatedAt ? new Date(device.updatedAt).toISOString() : null,
    alertState: {
      lowWater: settings.alerts.lowWater && latestState.waterLevel <= settings.minTankLevel,
      highWater: settings.alerts.highWater && latestState.waterLevel >= settings.maxTankLevel,
      offline: settings.alerts.offline && !isOnline
    }
  };
}
