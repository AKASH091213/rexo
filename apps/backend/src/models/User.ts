import { Schema, model } from "mongoose";

const userSchema = new Schema(
  {
    googleId: { type: String, required: true, unique: true, index: true },
    email: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true },
    avatarUrl: { type: String },
    role: { type: String, enum: ["admin", "operator"], default: "operator" },
    lastLoginAt: { type: Date, default: null }
  },
  {
    timestamps: true
  }
);

export const UserModel = model("User", userSchema);
