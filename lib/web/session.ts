import "server-only";
import { cookies } from "next/headers";
import { ApiError } from "@/lib/errors";
import {
  createSessionCookie,
  SESSION_MAX_AGE_MS,
  verifySessionCookie,
} from "@/lib/services/auth";
import type { AuthUser } from "@/lib/types";

export const SESSION_COOKIE = "library_session";
const SESSION_MAX_AGE_SECONDS = SESSION_MAX_AGE_MS / 1000;

export async function setSessionCookie(idToken: string): Promise<void> {
  const sessionCookie = await createSessionCookie(idToken);
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, sessionCookie, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
}

export async function hasWebSessionCookie(): Promise<boolean> {
  const cookieStore = await cookies();
  return Boolean(cookieStore.get(SESSION_COOKIE)?.value);
}

export async function getWebUser(): Promise<AuthUser | null> {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(SESSION_COOKIE)?.value;
  if (!sessionCookie) return null;

  try {
    return await verifySessionCookie(sessionCookie);
  } catch (error) {
    if (
      error instanceof ApiError &&
      (error.code === "UNAUTHENTICATED" || error.code === "FORBIDDEN")
    ) {
      return null;
    }
    throw error;
  }
}
