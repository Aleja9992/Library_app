import "server-only";
import { ApiError } from "@/lib/errors";
import { verifyIdToken } from "@/lib/services/auth";
import type { AuthUser, Role } from "@/lib/types";

export async function requireUser(request: Request): Promise<AuthUser> {
  const authorization = request.headers.get("authorization")?.trim() ?? "";
  const match = /^Bearer\s+([^\s]+)$/i.exec(authorization);

  if (!match) {
    throw new ApiError(
      401,
      "UNAUTHENTICATED",
      "Se requiere un token Bearer válido.",
    );
  }

  return verifyIdToken(match[1]);
}

export function assertRole(user: AuthUser, role: Role): void {
  if (user.role !== role) {
    throw new ApiError(403, "FORBIDDEN", "No tienes permiso para esta acción.");
  }
}
