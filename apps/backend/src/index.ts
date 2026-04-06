import { createServer } from "node:http";

import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { connectToDatabase } from "./db/mongoose.js";
import { ensureDevice, ensureDeviceSettings } from "./services/deviceService.js";
import { startMqttBridge } from "./services/mqttService.js";
import { createSocketServer } from "./services/socketService.js";

async function bootstrap() {
  await connectToDatabase();
  await Promise.all([ensureDevice(), ensureDeviceSettings()]);

  const app = createApp();
  const server = createServer(app);

  createSocketServer(server);
  startMqttBridge();

  server.listen(env.port, () => {
    console.log(`Backend listening on http://localhost:${env.port}`);
  });
}

bootstrap().catch((error) => {
  console.error("Failed to start backend", error);
  process.exit(1);
});
