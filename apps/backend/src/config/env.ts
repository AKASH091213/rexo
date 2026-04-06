import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import dotenv from "dotenv";

const currentDir = dirname(fileURLToPath(import.meta.url));

dotenv.config({
  path: resolve(currentDir, "../../../../.env")
});

function readEnv(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: Number(process.env.PORT ?? 4000),
  mongoUri: readEnv("MONGODB_URI"),
  jwtSecret: readEnv("JWT_SECRET"),
  googleClientId: readEnv("GOOGLE_CLIENT_ID"),
  frontendUrl: readEnv("FRONTEND_URL", "http://localhost:3000"),
  mqttUrl: readEnv("MQTT_URL", "mqtt://broker.hivemq.com:1883"),
  mqttUsername: process.env.MQTT_USERNAME,
  mqttPassword: process.env.MQTT_PASSWORD,
  mqttTelemetryTopic: readEnv("MQTT_TELEMETRY_TOPIC", "sensor/data"),
  mqttValveCommandTopic: readEnv("MQTT_VALVE_COMMAND_TOPIC", "valve/command"),
  mqttMotorCommandTopic: readEnv("MQTT_MOTOR_COMMAND_TOPIC", "motor/command"),
  mqttSettingsTopic: readEnv("MQTT_SETTINGS_TOPIC", "system/settings"),
  defaultDeviceId: readEnv("DEFAULT_DEVICE_ID", "water-system-1")
};

export const isProduction = env.nodeEnv === "production";
