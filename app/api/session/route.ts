import { currentUser } from "@/lib/session";
import { handle, ok } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await currentUser();
    return ok({ user });
  } catch (error) {
    return handle(error);
  }
}
