import mqtt from "mqtt";
import type { DeviceSettings, DeviceSettingsMessage } from "@iot/shared";

import { env } from "../config/env.js";
import { createAuditEvent } from "./auditService.js";
import { ensureDeviceSettings } from "./deviceService.js";
import { emitEvent } from "./socketService.js";
import { ingestTelemetry } from "./telemetryService.js";

let mqttClient: mqtt.MqttClient | null = null;

export function startMqttBridge() {
  mqttClient = mqtt.connect(env.mqttUrl, {
    username: env.mqttUsername,
    password: env.mqttPassword
  });

  mqttClient.on("connect", async () => {
    mqttClient?.subscribe(env.mqttTelemetryTopic);

    try {
      const settings = await ensureDeviceSettings(env.defaultDeviceId);
      publishDeviceSettings(settings);
    } catch (error) {
      const event = await createAuditEvent({
        deviceId: env.defaultDeviceId,
        type: "system",
        message: "Failed to publish device settings after MQTT connect.",
        metadata: {
          error: error instanceof Error ? error.message : "Unknown error"
        }
      });
      emitEvent(env.defaultDeviceId, event);
    }
  });

  mqttClient.on("message", async (_topic, message) => {
    try {
      const payload = JSON.parse(message.toString());
      await ingestTelemetry(env.defaultDeviceId, payload);
    } catch (error) {
      const event = await createAuditEvent({
        deviceId: env.defaultDeviceId,
        type: "system",
        message: "Failed to process telemetry message.",
        metadata: {
          error: error instanceof Error ? error.message : "Unknown error",
          rawMessage: message.toString()
        }
      });
      emitEvent(env.defaultDeviceId, event);
    }
  });

  mqttClient.on("error", async (error) => {
    const event = await createAuditEvent({
      deviceId: env.defaultDeviceId,
      type: "system",
      message: "MQTT connection error.",
      metadata: { error: error.message }
    });
    emitEvent(env.defaultDeviceId, event);
  });
}

export function publishActuatorCommand(deviceId: string, type: "valve" | "motor", value: boolean) {
  if (!mqttClient?.connected) {
    throw new Error("MQTT broker is not connected");
  }

  const topic = type === "valve" ? env.mqttValveCommandTopic : env.mqttMotorCommandTopic;
  mqttClient.publish(topic, JSON.stringify({ deviceId, type, value }));
}

export function publishDeviceSettings(settings: DeviceSettings) {
  if (!mqttClient?.connected) {
    throw new Error("MQTT broker is not connected");
  }

  const message: DeviceSettingsMessage = {
    deviceId: settings.deviceId,
    autoCutoffTimeoutSec: settings.autoCutoffTimeoutSec,
    minTankLevel: settings.minTankLevel,
    maxTankLevel: settings.maxTankLevel
  };

  mqttClient.publish(env.mqttSettingsTopic, JSON.stringify(message));
}
