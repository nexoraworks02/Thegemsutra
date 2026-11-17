import { revalidateTag } from "next/cache";
import { DESIGNS_TAG } from "@/lib/designs";

/**
 * POST /api/revalidate  (called by the backend after a design is saved)
 * Header: x-revalidate-secret: <REVALIDATE_SECRET>
 */
export async function POST(request: Request) {
  const secret = process.env.REVALIDATE_SECRET;
  if (!secret || request.headers.get("x-revalidate-secret") !== secret) {
    return Response.json({ message: "Unauthorized" }, { status: 401 });
  }
  // expire: 0 -> the next visit loads fresh designs instead of a stale copy.
  revalidateTag(DESIGNS_TAG, { expire: 0 });
  return Response.json({ revalidated: true });
}
