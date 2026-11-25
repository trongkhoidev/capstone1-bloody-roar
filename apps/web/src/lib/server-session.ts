import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AUTH_COOKIE_NAME, verifySessionJWT } from "./auth";

type Role = "CLIENT" | "DEVELOPER" | "ADMIN";

export async function getServerUser() {
  const token = cookies().get(AUTH_COOKIE_NAME)?.value;
  if (!token) return null;
  try {
    return await verifySessionJWT(token);
  } catch {
    return undefined;
  }
}

export function homePathFor(role: Role): string {
  return role === "ADMIN" ? "/admin" : "/dashboard";
}

/**
 * Sends signed-in users whose role is not allowed to their own home page.
 * Guests pass through so the page can show its wallet sign-in panel.
 */
export async function guardRoute(allowed: Role[]) {
  const user = await getServerUser();
  if (user && !allowed.includes(user.role as Role)) redirect(homePathFor(user.role as Role));
  return user;
}
