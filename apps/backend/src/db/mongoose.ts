import mongoose from "mongoose";

import { env } from "../config/env.js";

export async function connectToDatabase() {
  await mongoose.connect(env.mongoUri);
}
