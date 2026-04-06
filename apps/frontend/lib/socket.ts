import { io } from "socket.io-client";

import { API_URL } from "./api";

const socketOrigin = API_URL.replace(/\/api$/, "");

export function createDashboardSocket() {
  return io(socketOrigin, {
    withCredentials: true,
    transports: ["websocket"]
  });
}
