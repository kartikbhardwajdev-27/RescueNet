import { getCurrentUser } from "@/lib/auth";

// Personal data: keep it out of any shared cache.
const noStore = { "Cache-Control": "no-store" };

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return Response.json({ error: "Not authenticated" }, { status: 401, headers: noStore });
  }
  return Response.json(user, { headers: noStore });
}
