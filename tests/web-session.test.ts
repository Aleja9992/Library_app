import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  cookies: vi.fn(),
  createSessionCookie: vi.fn(),
  verifySessionCookie: vi.fn(),
  cookieSet: vi.fn(),
  cookieGet: vi.fn(),
}));

vi.mock("next/headers", () => ({ cookies: mocks.cookies }));
vi.mock("@/lib/services/auth", () => ({
  createSessionCookie: mocks.createSessionCookie,
  verifySessionCookie: mocks.verifySessionCookie,
  SESSION_MAX_AGE_MS: 5 * 24 * 60 * 60 * 1000,
}));

import {
  clearSessionCookie,
  getWebUser,
  hasWebSessionCookie,
  SESSION_COOKIE,
  setSessionCookie,
} from "@/lib/web/session";

describe("sesión web aislada de Firebase", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.cookies.mockResolvedValue({
      get: mocks.cookieGet,
      set: mocks.cookieSet,
    });
    mocks.cookieGet.mockReturnValue({ value: "signed-session-cookie" });
  });

  it("crea cookie httpOnly de cinco días con secure solo en producción", async () => {
    mocks.createSessionCookie.mockResolvedValue("admin-session-cookie");
    await setSessionCookie("api-id-token");

    expect(mocks.createSessionCookie).toHaveBeenCalledWith("api-id-token");
    expect(mocks.cookieSet).toHaveBeenCalledWith(
      SESSION_COOKIE,
      "admin-session-cookie",
      {
        httpOnly: true,
        sameSite: "lax",
        secure: false,
        path: "/",
        maxAge: 5 * 24 * 60 * 60,
      },
    );
  });

  it("borra la cookie con los mismos atributos de seguridad", async () => {
    await clearSessionCookie();
    expect(mocks.cookieSet).toHaveBeenCalledWith(
      SESSION_COOKIE,
      "",
      expect.objectContaining({
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        maxAge: 0,
      }),
    );
  });

  it("verifica cookie y devuelve el usuario sin exponer tokens", async () => {
    const user = {
      uid: "student-1",
      email: "ana@example.com",
      name: "Ana",
      role: "student",
    };
    mocks.verifySessionCookie.mockResolvedValue(user);

    await expect(getWebUser()).resolves.toEqual(user);
    expect(mocks.verifySessionCookie).toHaveBeenCalledWith(
      "signed-session-cookie",
    );
    expect(await getWebUser()).not.toHaveProperty("tokens");
  });

  it("trata sesión expirada como anónima", async () => {
    const { ApiError } = await import("@/lib/errors");
    mocks.verifySessionCookie.mockRejectedValue(
      new ApiError(401, "UNAUTHENTICATED", "Sesión expirada."),
    );

    await expect(getWebUser()).resolves.toBeNull();
  });

  it("trata rol desconocido como sesión no autorizada sin romper navegación", async () => {
    const { ApiError } = await import("@/lib/errors");
    mocks.verifySessionCookie.mockRejectedValue(
      new ApiError(403, "FORBIDDEN", "Rol no autorizado."),
    );

    await expect(getWebUser()).resolves.toBeNull();
  });

  it("no oculta errores inesperados del verificador", async () => {
    const verificationError = new Error("Firebase Admin unavailable");
    mocks.verifySessionCookie.mockRejectedValue(verificationError);

    await expect(getWebUser()).rejects.toBe(verificationError);
  });

  it("no intenta verificar si la cookie falta", async () => {
    mocks.cookieGet.mockReturnValue(undefined);
    await expect(getWebUser()).resolves.toBeNull();
    expect(mocks.verifySessionCookie).not.toHaveBeenCalled();
  });

  it("lee y verifica la cookie en cada llamada, sin cachear entre peticiones", async () => {
    mocks.verifySessionCookie.mockResolvedValue({
      uid: "student-1",
      email: "ana@example.com",
      name: "Ana",
      role: "student",
    });
    await getWebUser();
    await getWebUser();

    expect(mocks.cookies).toHaveBeenCalledTimes(2);
    expect(mocks.verifySessionCookie).toHaveBeenCalledTimes(2);
  });

  it("distingue una cookie presente de una sesión inexistente para UX de expiración", async () => {
    mocks.cookieGet.mockReturnValue(undefined);
    await expect(hasWebSessionCookie()).resolves.toBe(false);
    mocks.cookieGet.mockReturnValue({ value: "expired-cookie" });
    await expect(hasWebSessionCookie()).resolves.toBe(true);
  });
});
