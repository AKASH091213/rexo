import jwt from "jsonwebtoken";

import { env } from "../config/env.js";

export interface AuthTokenPayload {
  sub: string;
  email: string;
  name: string;
  role: "admin" | "operator";
}

export function signAuthToken(payload: AuthTokenPayload) {
  return jwt.sign(payload, env.jwtSecret, {
    expiresIn: "7d"
  });
}

export function verifyAuthToken(token: string) {
  return jwt.verify(token, env.jwtSecret) as AuthTokenPayload;
}
