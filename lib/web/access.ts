import "server-only";
import { redirect } from "next/navigation";
import { getWebUser, hasWebSessionCookie } from "@/lib/web/session";
import type { AuthUser, Role } from "@/lib/types";

export async function requireWebUser(): Promise<AuthUser> {
  const user = await getWebUser();
  if (!user) {
    redirect((await hasWebSessionCookie()) ? "/login?expired=1" : "/login");
  }
  return user;
}

export async function requireWebRole(role: Role): Promise<AuthUser> {
  const user = await requireWebUser();
  if (user.role !== role) redirect("/books?error=forbidden");
  return user;
}
