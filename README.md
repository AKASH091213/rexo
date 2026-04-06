# IoT Water System Web App

Full-stack web application for controlling and monitoring the ESP8266-based water system over MQTT with Google OAuth, MongoDB persistence, live telemetry, and a responsive dashboard.

## Stack

- Frontend: Next.js 15 + TypeScript + Tailwind CSS
- Backend: Express + TypeScript + MongoDB + Socket.IO + MQTT
- Shared contracts: workspace package for DTOs and types

## Workspace Layout

- `apps/frontend`: user-facing dashboard and login experience
- `apps/backend`: API, auth, MQTT bridge, realtime server
- `packages/shared`: shared API contracts and helper utilities

## Quick Start

1. Copy `.env.example` to `.env` in the repo root and fill in Google OAuth, MongoDB, JWT, and MQTT settings.
2. Create `apps/frontend/.env.local` and set `NEXT_PUBLIC_API_URL` and `NEXT_PUBLIC_GOOGLE_CLIENT_ID`.
3. Install dependencies with `npm install`.
4. Start MongoDB locally or point `MONGODB_URI` to MongoDB Atlas.
5. Run the backend with `npm run dev:backend`.
6. Run the frontend with `npm run dev:frontend`.

## Google OAuth Setup

- Create a Google OAuth Web application in Google Cloud Console.
- Add `http://localhost:3000` to Authorized JavaScript origins.
- Use the generated client ID for both `GOOGLE_CLIENT_ID` and `NEXT_PUBLIC_GOOGLE_CLIENT_ID`.

## MQTT Notes

- The current firmware publishes to `sensor/data`, listens on `motor/command`, and can consume threshold updates from `system/settings`.
- For production, move to a private/authenticated broker and add device-specific topics or a `deviceId` in the payload.
