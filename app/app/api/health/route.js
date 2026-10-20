import { connection } from "next/server";
import mongoose from "mongoose";
import connectDB from "@/lib/db";

export async function GET() {
  // Always run at request time; otherwise the DB result could be prerendered at build.
  await connection();

  let db = "disconnected";
  try {
    await connectDB();
    // Ping so a stale cached connection reports as disconnected.
    await mongoose.connection.db.command({ ping: 1 });
    db = "connected";
  } catch (err) {
    console.error("[health] database check failed:", err.message);
  }

  return Response.json({ status: "ok", db });
}
