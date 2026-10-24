import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/errors";

const mocks = vi.hoisted(() => ({
  adminAuth: vi.fn(),
  db: vi.fn(),
  verifyIdToken: vi.fn(),
  verifySessionCookie: vi.fn(),
  createSessionCookie: vi.fn(),
  getUserDocument: vi.fn(),
  createUser: vi.fn(),
  setCustomUserClaims: vi.fn(),
  deleteUser: vi.fn(),
  setUserDocument: vi.fn(),
  fetch: vi.fn(),
  events: [] as string[],
}));

vi.mock("@/lib/firebase", () => ({
  adminAuth: mocks.adminAuth,
  db: mocks.db,
}));

vi.mock("@/lib/env", () => ({
  getFirebaseEnv: () => ({ FIREBASE_WEB_API_KEY: "test-only-api-key" }),
}));

import {
  createSessionCookie,
  login,
  refresh,
  register,
  SESSION_MAX_AGE_MS,
  verifyIdToken,
  verifySessionCookie,
} from "@/lib/services/auth";

describe("servicio de autenticación con Firebase simulado", () => {
  beforeEach(() => {
    mocks.events.length = 0;
    mocks.verifyIdToken.mockResolvedValue({
      uid: "user-1",
      email: "ana@example.com",
      name: "Ana",
      role: "student",
    });
    mocks.verifySessionCookie.mockResolvedValue({
      uid: "user-1",
      email: "ana@example.com",
      name: "Ana",
      role: "student",
    });
    mocks.getUserDocument.mockResolvedValue({
      data: () => ({ role: "student" }),
    });
    mocks.createSessionCookie.mockResolvedValue("session-cookie");
    mocks.createUser.mockResolvedValue({ uid: "user-1" });
    mocks.setCustomUserClaims.mockImplementation(async () => {
      mocks.events.push("claims");
    });
    mocks.setUserDocument.mockImplementation(async () => {
      mocks.events.push("user-document");
    });
    mocks.deleteUser.mockResolvedValue(undefined);
    mocks.adminAuth.mockReturnValue({
      verifyIdToken: mocks.verifyIdToken,
      verifySessionCookie: mocks.verifySessionCookie,
      createSessionCookie: mocks.createSessionCookie,
      createUser: mocks.createUser,
      setCustomUserClaims: mocks.setCustomUserClaims,
      deleteUser: mocks.deleteUser,
    });
    mocks.db.mockReturnValue({
      collection: () => ({
        doc: () => ({
          get: mocks.getUserDocument,
          set: mocks.setUserDocument,
        }),
      }),
    });
    mocks.fetch.mockReset();
    vi.stubGlobal("fetch", mocks.fetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("verifica idToken y cookie con Firebase Admin y fija la vigencia de cinco días", async () => {
    await expect(verifyIdToken("test-id-token")).resolves.toMatchObject({
      uid: "user-1",
      role: "student",
    });
    await expect(verifySessionCookie("test-cookie")).resolves.toMatchObject({
      uid: "user-1",
    });
    await expect(createSessionCookie("test-id-token")).resolves.toBe(
      "session-cookie",
    );

    expect(mocks.verifyIdToken).toHaveBeenCalledWith("test-id-token", true);
    expect(mocks.verifySessionCookie).toHaveBeenCalledWith("test-cookie", true);
    expect(mocks.createSessionCookie).toHaveBeenCalledWith("test-id-token", {
      expiresIn: 5 * 24 * 60 * 60 * 1000,
    });
    expect(SESSION_MAX_AGE_MS).toBe(5 * 24 * 60 * 60 * 1000);
  });

  it.each(["librarian", "admin", "administrator", "administrador", "bibliotecario"])(
    "normaliza el claim administrativo %s al rol autorizado librarian",
    async (role) => {
      mocks.verifyIdToken.mockResolvedValue({
        uid: "user-1",
        email: "ana@example.com",
        role,
      });

      await expect(verifyIdToken("verified-admin-token")).resolves.toMatchObject({
        role: "librarian",
      });
    },
  );

  it("normaliza los claims administrativos de una cookie usada por la web", async () => {
    mocks.verifySessionCookie.mockResolvedValue({
      uid: "librarian-1",
      email: "biblioteca@example.com",
      role: "admin",
    });

    await expect(verifySessionCookie("verified-admin-session")).resolves.toMatchObject({
      role: "librarian",
    });
  });

  it.each(["student", "librarian"])(
    "resuelve el rol %s del perfil Firestore para una sesión antigua sin claim",
    async (role) => {
      mocks.verifySessionCookie.mockResolvedValue({
        uid: "user-1",
        email: "ana@example.com",
      });
      mocks.getUserDocument.mockResolvedValue({ data: () => ({ role }) });

      await expect(verifySessionCookie("verified-session")).resolves.toMatchObject({
        role,
      });
      expect(mocks.getUserDocument).toHaveBeenCalledOnce();
    },
  );

  it("no convierte un claim desconocido en estudiante", async () => {
    mocks.verifyIdToken.mockResolvedValue({
      uid: "user-1",
      email: "ana@example.com",
      role: "superuser",
    });
    mocks.getUserDocument.mockResolvedValue({
      data: () => ({ role: "superuser" }),
    });

    await expect(verifyIdToken("verified-unknown-role-token")).rejects.toMatchObject({
      status: 403,
      code: "FORBIDDEN",
    });
  });

  it("usa el claim firmado antes que un perfil Firestore desactualizado", async () => {
    mocks.verifySessionCookie.mockResolvedValue({
      uid: "user-1",
      email: "ana@example.com",
      role: "librarian",
    });
    mocks.getUserDocument.mockResolvedValue({
      data: () => ({ role: "student" }),
    });

    await expect(verifySessionCookie("verified-session")).resolves.toMatchObject({
      role: "librarian",
    });
    expect(mocks.getUserDocument).not.toHaveBeenCalled();
  });

  it.each([
    ["INVALID_LOGIN_CREDENTIALS", 401, "INVALID_CREDENTIALS"],
    ["EMAIL_NOT_FOUND", 401, "INVALID_CREDENTIALS"],
    ["INVALID_PASSWORD", 401, "INVALID_CREDENTIALS"],
    ["USER_DISABLED", 403, "FORBIDDEN"],
    ["TOO_MANY_ATTEMPTS_TRY_LATER", 429, "RATE_LIMITED"],
  ])("mapea el error REST %s sin revelar datos del proveedor", async (code, status, errorCode) => {
    mocks.fetch.mockResolvedValue(
      new Response(JSON.stringify({ error: { message: code } }), {
        status: 400,
      }),
    );

    const error = await login("ana@example.com", "private-password").then(
      () => null,
      (reason: unknown) => reason,
    );
    expect(error).toMatchObject({ status, code: errorCode });
    expect(error).toBeInstanceOf(ApiError);
    if (error instanceof Error) {
      expect(error.message).not.toContain(code);
      expect(error.message).not.toContain("private-password");
    }

    const [url, init] = mocks.fetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("identitytoolkit.googleapis.com");
    expect(init.cache).toBe("no-store");
  });

  it("renueva con Secure Token API y verifica el nuevo token", async () => {
    mocks.fetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          id_token: "fresh-id",
          refresh_token: "fresh-refresh",
          expires_in: "3600",
        }),
        { status: 200 },
      ),
    );

    await expect(refresh("old-refresh")).resolves.toMatchObject({
      tokens: {
        idToken: "fresh-id",
        refreshToken: "fresh-refresh",
        expiresIn: 3600,
      },
      user: { uid: "user-1" },
    });
    expect(String(mocks.fetch.mock.calls[0][0])).toContain(
      "securetoken.googleapis.com",
    );
    expect(mocks.verifyIdToken).toHaveBeenCalledWith("fresh-id", true);
  });

  it("registra siempre student, sincroniza claims antes de iniciar sesión y traduce duplicados a 409", async () => {
    mocks.fetch.mockImplementation(async () => {
      mocks.events.push("login");
      return new Response(
        JSON.stringify({
          idToken: "student-id",
          refreshToken: "student-refresh",
          expiresIn: "3600",
        }),
        { status: 200 },
      );
    });

    await register("ana@example.com", "private-password", "Ana");

    expect(mocks.setCustomUserClaims).toHaveBeenCalledWith("user-1", {
      role: "student",
    });
    expect(mocks.setUserDocument).toHaveBeenCalledWith(
      expect.objectContaining({ role: "student", email: "ana@example.com" }),
    );
    expect(mocks.events).toEqual(["claims", "user-document", "login"]);

    mocks.createUser.mockRejectedValue({ code: "auth/email-already-exists" });
    await expect(
      register("ana@example.com", "private-password", "Ana"),
    ).rejects.toMatchObject({
      status: 409,
      code: "EMAIL_IN_USE",
    });

    mocks.createUser.mockRejectedValue({
      code: "auth/password-does-not-meet-requirements",
    });
    await expect(
      register("ana@example.com", "private-password", "Ana"),
    ).rejects.toMatchObject({
      status: 400,
      code: "VALIDATION_ERROR",
    });
  });

  it("convierte token revocado o inválido en 401 uniforme", async () => {
    mocks.verifyIdToken.mockRejectedValue({ code: "auth/id-token-revoked" });

    await expect(verifyIdToken("revoked-token")).rejects.toBeInstanceOf(ApiError);
    await expect(verifyIdToken("revoked-token")).rejects.toMatchObject({
      status: 401,
      code: "UNAUTHENTICATED",
    });
  });
});
