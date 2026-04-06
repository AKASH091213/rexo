import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";

import { env } from "./config/env.js";
import { authRouter } from "./routes/auth.js";
import { commandsRouter } from "./routes/commands.js";
import { dashboardRouter } from "./routes/dashboard.js";
import { eventsRouter } from "./routes/events.js";
import { settingsRouter } from "./routes/settings.js";
import { telemetryRouter } from "./routes/telemetry.js";

export function createApp() {
  const app = express();

  app.use(
    cors({
      origin: env.frontendUrl,
      credentials: true
    })
  );
  app.use(express.json());
  app.use(cookieParser());

  app.get("/api/health", (_request, response) => {
    response.json({ ok: true });
  });

  app.use("/api/auth", authRouter);
  app.use("/api/dashboard", dashboardRouter);
  app.use("/api/telemetry", telemetryRouter);
  app.use("/api/settings", settingsRouter);
  app.use("/api/commands", commandsRouter);
  app.use("/api/events", eventsRouter);

  return app;
}
