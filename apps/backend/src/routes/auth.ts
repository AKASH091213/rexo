import { Router } from "express";
import { OAuth2Client } from "google-auth-library";

import type { SessionResponse } from "@iot/shared";

import { isProduction, env } from "../config/env.js";
import { requireAuth, type AuthenticatedRequest } from "../middleware/auth.js";
import { UserModel } from "../models/User.js";
import { signAuthToken } from "../utils/jwt.js";

const googleClient = new OAuth2Client(env.googleClientId);

export const authRouter = Router();

authRouter.post("/google", async (request, response) => {
  const credential = request.body?.credential;

  if (!credential) {
    return response.status(400).json({ message: "Missing Google credential" });
  }

  const ticket = await googleClient.verifyIdToken({
    idToken: credential,
    audience: env.googleClientId
  });

  const payload = ticket.getPayload();

  if (!payload?.sub || !payload.email || !payload.name) {
    return response.status(400).json({ message: "Invalid Google payload" });
  }

  const user = await UserModel.findOneAndUpdate(
    { googleId: payload.sub },
    {
      $set: {
        email: payload.email,
        name: payload.name,
        avatarUrl: payload.picture,
        lastLoginAt: new Date()
      },
      $setOnInsert: {
        role: "admin"
      }
    },
    { upsert: true, new: true }
  );

  const token = signAuthToken({
    sub: user._id.toString(),
    email: user.email,
    name: user.name,
    role: user.role
  });

  response.cookie("session", token, {
    httpOnly: true,
    sameSite: "lax",
    secure: isProduction,
    maxAge: 7 * 24 * 60 * 60 * 1000
  });

  const session: SessionResponse = {
    authenticated: true,
    user: {
      id: user._id.toString(),
      email: user.email,
      name: user.name,
      avatarUrl: user.avatarUrl ?? undefined,
      role: user.role
    }
  };

  return response.json(session);
});

authRouter.get("/session", requireAuth, async (request: AuthenticatedRequest, response) => {
  const user = await UserModel.findById(request.auth?.sub);

  if (!user) {
    response.clearCookie("session");
    return response.status(401).json({ authenticated: false, user: null });
  }

  const session: SessionResponse = {
    authenticated: true,
    user: {
      id: user._id.toString(),
      email: user.email,
      name: user.name,
      avatarUrl: user.avatarUrl ?? undefined,
      role: user.role
    }
  };

  return response.json(session);
});

authRouter.post("/logout", (_request, response) => {
  response.clearCookie("session");
  return response.status(204).send();
});
