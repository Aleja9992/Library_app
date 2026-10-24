import "server-only";
import { ApiError } from "@/lib/errors";
import { getFirebaseEnv } from "@/lib/env";
import { adminAuth, db } from "@/lib/firebase";
import type { AuthUser, Role, TokenSet } from "@/lib/types";

const IDENTITY_API = "https://identitytoolkit.googleapis.com/v1";
const SECURE_TOKEN_API = "https://securetoken.googleapis.com/v1";

export const SESSION_MAX_AGE_MS = 5 * 24 * 60 * 60 * 1000;

export interface AuthResult {
  tokens: TokenSet;
  user: AuthUser;
}

interface FirebaseIdentityTokenResponse {
  idToken: string;
  refreshToken: string;
  expiresIn: string;
}

interface FirebaseRefreshTokenResponse {
  id_token: string;
  refresh_token: string;
  expires_in: string;
}

function toRole(value: unknown): Role | undefined {
  if (value === "student") return "student";
  if (
    value === "librarian" ||
    value === "admin" ||
    value === "administrator" ||
    value === "administrador" ||
    value === "bibliotecario"
  ) {
    return "librarian";
  }
  return undefined;
}

async function toAuthUser(decoded: {
  uid: string;
  email?: string;
  name?: string;
  role?: unknown;
}): Promise<AuthUser> {
  let role = toRole(decoded.role);
  if (!role) {
    const profile = await db().collection("users").doc(decoded.uid).get();
    role = toRole(profile.data()?.role);
  }
  if (!role) {
    throw new ApiError(
      403,
      "FORBIDDEN",
      "La cuenta no tiene un rol autorizado.",
    );
  }

  return {
    uid: decoded.uid,
    email: decoded.email ?? "",
    name: decoded.name ?? decoded.email ?? "Usuario",
    role,
  };
}

function firebaseErrorCode(error: unknown): string | undefined {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string"
  ) {
    return error.code;
  }
  return undefined;
}

export async function verifyIdToken(idToken: string): Promise<AuthUser> {
  try {
    return await toAuthUser(await adminAuth().verifyIdToken(idToken, true));
  } catch (error) {
    if (firebaseErrorCode(error)?.startsWith("auth/")) {
      throw new ApiError(
        401,
        "UNAUTHENTICATED",
        "La sesión no es válida o ha expirado.",
      );
    }
    throw error;
  }
}

export async function verifySessionCookie(cookie: string): Promise<AuthUser> {
  try {
    return await toAuthUser(await adminAuth().verifySessionCookie(cookie, true));
  } catch (error) {
    if (firebaseErrorCode(error)?.startsWith("auth/")) {
      throw new ApiError(
        401,
        "UNAUTHENTICATED",
        "La sesión no es válida o ha expirado.",
      );
    }
    throw error;
  }
}

export async function createSessionCookie(idToken: string): Promise<string> {
  try {
    return await adminAuth().createSessionCookie(idToken, {
      expiresIn: SESSION_MAX_AGE_MS,
    });
  } catch (error) {
    if (firebaseErrorCode(error)?.startsWith("auth/")) {
      throw new ApiError(
        401,
        "UNAUTHENTICATED",
        "No se pudo crear una sesión válida.",
      );
    }
    throw error;
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : {};
}

async function firebaseRest<T>(url: string, init: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, { ...init, cache: "no-store" });
  } catch {
    throw new ApiError(
      502,
      "INTERNAL_ERROR",
      "No se pudo contactar el servicio de autenticación.",
    );
  }

  let body: Record<string, unknown>;
  try {
    body = asRecord(await response.json());
  } catch {
    body = {};
  }

  if (!response.ok) {
    const error = asRecord(body.error);
    const providerCode =
      typeof error.message === "string" ? error.message : "UNKNOWN";

    if (
      providerCode.startsWith("INVALID_LOGIN_CREDENTIALS") ||
      providerCode.startsWith("INVALID_PASSWORD") ||
      providerCode.startsWith("EMAIL_NOT_FOUND") ||
      providerCode.startsWith("INVALID_EMAIL") ||
      providerCode.startsWith("INVALID_REFRESH_TOKEN") ||
      providerCode.startsWith("TOKEN_EXPIRED")
    ) {
      throw new ApiError(
        401,
        "INVALID_CREDENTIALS",
        "Correo o contraseña incorrectos.",
      );
    }

    if (providerCode.startsWith("USER_DISABLED")) {
      throw new ApiError(403, "FORBIDDEN", "La cuenta está deshabilitada.");
    }

    if (providerCode.startsWith("TOO_MANY_ATTEMPTS")) {
      throw new ApiError(
        429,
        "RATE_LIMITED",
        "Demasiados intentos. Espera un momento e inténtalo de nuevo.",
      );
    }

    throw new ApiError(
      502,
      "INTERNAL_ERROR",
      "Error al contactar el servicio de autenticación.",
    );
  }

  return body as T;
}

function tokenSet(idToken: string, refreshToken: string, expiresIn: string): TokenSet {
  const seconds = Number(expiresIn);
  if (
    !idToken ||
    !refreshToken ||
    !Number.isFinite(seconds) ||
    seconds <= 0
  ) {
    throw new ApiError(
      502,
      "INTERNAL_ERROR",
      "El servicio de autenticación devolvió una respuesta inválida.",
    );
  }

  return { idToken, refreshToken, expiresIn: seconds };
}

export async function login(
  email: string,
  password: string,
): Promise<AuthResult> {
  const apiKey = getFirebaseEnv().FIREBASE_WEB_API_KEY;
  const data = await firebaseRest<FirebaseIdentityTokenResponse>(
    `${IDENTITY_API}/accounts:signInWithPassword?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    },
  );

  return {
    tokens: tokenSet(data.idToken, data.refreshToken, data.expiresIn),
    user: await verifyIdToken(data.idToken),
  };
}

export async function refresh(refreshToken: string): Promise<AuthResult> {
  const apiKey = getFirebaseEnv().FIREBASE_WEB_API_KEY;
  const data = await firebaseRest<FirebaseRefreshTokenResponse>(
    `${SECURE_TOKEN_API}/token?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      }),
    },
  );

  return {
    tokens: tokenSet(data.id_token, data.refresh_token, data.expires_in),
    user: await verifyIdToken(data.id_token),
  };
}

export async function register(
  email: string,
  password: string,
  displayName: string,
): Promise<AuthResult> {
  let uid: string;

  try {
    const created = await adminAuth().createUser({
      email,
      password,
      displayName,
    });
    uid = created.uid;

    try {
      await adminAuth().setCustomUserClaims(uid, { role: "student" });
      await db().collection("users").doc(uid).set({
        email,
        displayName,
        role: "student",
        createdAt: new Date().toISOString(),
      });
    } catch {
      try {
        await adminAuth().deleteUser(uid);
      } catch {
        console.error("[auth] no se pudo limpiar una cuenta incompleta.");
      }
      throw new ApiError(
        502,
        "INTERNAL_ERROR",
        "No se pudo completar el registro.",
      );
    }
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }

    const code = firebaseErrorCode(error);
    if (code === "auth/email-already-exists") {
      throw new ApiError(
        409,
        "EMAIL_IN_USE",
        "Ya existe una cuenta con ese correo.",
      );
    }
    if (
      code === "auth/invalid-password" ||
      code === "auth/invalid-email" ||
      code === "auth/weak-password" ||
      code === "auth/password-does-not-meet-requirements"
    ) {
      throw new ApiError(
        400,
        "VALIDATION_ERROR",
        "El correo o la contraseña no son válidos.",
      );
    }

    throw new ApiError(
      502,
      "INTERNAL_ERROR",
      "No se pudo completar el registro.",
    );
  }

  // La sesión se crea después de asignar el claim, para que el primer token lo incluya.
  return login(email, password);
}
