import type { NextFunction, Request, Response } from "express";

import { verifyAuthToken } from "../utils/jwt.js";

export interface AuthenticatedRequest extends Request {
  auth?: ReturnType<typeof verifyAuthToken>;
}

export function requireAuth(
  request: AuthenticatedRequest,
  response: Response,
  next: NextFunction
) {
  try {
    const bearerToken = request.headers.authorization?.replace("Bearer ", "");
    const cookieToken = request.cookies?.session;
    const token = bearerToken || cookieToken;

    if (!token) {
      return response.status(401).json({ message: "Unauthorized" });
    }

    request.auth = verifyAuthToken(token);
    next();
  } catch {
    return response.status(401).json({ message: "Unauthorized" });
  }
}
