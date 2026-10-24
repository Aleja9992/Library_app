import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/errors";

const { login, refresh, register, verifyIdToken } = vi.hoisted(() => ({
  login: vi.fn(),
  refresh: vi.fn(),
  register: vi.fn(),
  verifyIdToken: vi.fn(),
}));

vi.mock("@/lib/services/auth", () => ({
  login,
  refresh,
  register,
  verifyIdToken,
}));

import { POST as loginRoute } from "@/app/api/auth/login/route";
import { POST as refreshRoute } from "@/app/api/auth/refresh/route";
import { POST as registerRoute } from "@/app/api/auth/register/route";
import { GET as meRoute } from "@/app/api/auth/me/route";
import { GET as booksRoute } from "@/app/api/books/route";
import { GET as bookRoute } from "@/app/api/books/[id]/route";
import { listBooks, listCategories, getBook } from "@/lib/data/books";

vi.mock("@/lib/data/books", () => ({
  getBook: vi.fn(),
  listBooks: vi.fn(),
  listCategories: vi.fn(),
}));

describe("rutas de autenticación y catálogo protegido", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("valida login y devuelve errores uniformes de credenciales", async () => {
    const invalid = await loginRoute(
      new Request("http://localhost/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email: "no-es-correo", password: "" }),
      }),
      undefined,
    );
    login.mockRejectedValue(
      new ApiError(401, "INVALID_CREDENTIALS", "Correo o contraseña incorrectos."),
    );
    const denied = await loginRoute(
      new Request("http://localhost/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email: "ana@example.com", password: "secret1" }),
      }),
      undefined,
    );

    expect(invalid.status).toBe(400);
    expect((await invalid.json()).error.code).toBe("VALIDATION_ERROR");
    expect(denied.status).toBe(401);
    expect(await denied.json()).toMatchObject({
      error: {
        code: "INVALID_CREDENTIALS",
        message: "Correo o contraseña incorrectos.",
      },
    });
  });

  it("registra con estado 201, fuerza rol student y traduce correo repetido a 409", async () => {
    register.mockResolvedValue({
      user: { uid: "u1", email: "ana@example.com", name: "Ana", role: "student" },
      tokens: { idToken: "id", refreshToken: "refresh", expiresIn: 3600 },
    });
    const response = await registerRoute(
      new Request("http://localhost/api/auth/register", {
        method: "POST",
        body: JSON.stringify({
          email: "ana@example.com",
          password: "secret1",
          displayName: "Ana",
          role: "librarian",
        }),
      }),
      undefined,
    );

    register.mockRejectedValue(
      new ApiError(409, "EMAIL_IN_USE", "Ya existe una cuenta con ese correo."),
    );
    const duplicate = await registerRoute(
      new Request("http://localhost/api/auth/register", {
        method: "POST",
        body: JSON.stringify({
          email: "ana@example.com",
          password: "secret1",
          displayName: "Ana",
        }),
      }),
      undefined,
    );

    expect(response.status).toBe(201);
    expect(register).toHaveBeenCalledWith("ana@example.com", "secret1", "Ana");
    expect((await response.json()).user.role).toBe("student");
    expect(duplicate.status).toBe(409);
    expect((await duplicate.json()).error.code).toBe("EMAIL_IN_USE");
  });

  it("refresca tokens, autentica /me y protege catálogo y detalle con 401", async () => {
    refresh.mockResolvedValue({
      user: { uid: "u1", email: "ana@example.com", name: "Ana", role: "student" },
      tokens: { idToken: "new-id", refreshToken: "new-refresh", expiresIn: 3600 },
    });
    const refreshed = await refreshRoute(
      new Request("http://localhost/api/auth/refresh", {
        method: "POST",
        body: JSON.stringify({ refreshToken: "old-refresh" }),
      }),
      undefined,
    );
    verifyIdToken.mockResolvedValue({
      uid: "u1",
      email: "ana@example.com",
      name: "Ana",
      role: "student",
    });
    const me = await meRoute(
      new Request("http://localhost/api/auth/me", {
        headers: { authorization: "Bearer verified-id" },
      }),
      undefined,
    );
    const catalog = await booksRoute(
      new Request("http://localhost/api/books"),
      undefined,
    );
    const detail = await bookRoute(
      new Request("http://localhost/api/books/clean-code"),
      { params: Promise.resolve({ id: "clean-code" }) },
    );

    expect(refreshed.status).toBe(200);
    expect((await refreshed.json()).tokens.idToken).toBe("new-id");
    expect(me.status).toBe(200);
    expect((await me.json()).user.uid).toBe("u1");
    expect(catalog.status).toBe(401);
    expect(detail.status).toBe(401);
    expect((await catalog.json()).error).toMatchObject({
      code: "UNAUTHENTICATED",
    });
    expect(listBooks).not.toHaveBeenCalled();
    expect(listCategories).not.toHaveBeenCalled();
    expect(getBook).not.toHaveBeenCalled();
  });

  it("conserva 403 para un error de autorización en JSON uniforme", async () => {
    verifyIdToken.mockRejectedValue(
      new ApiError(403, "FORBIDDEN", "No tienes permiso para esta acción."),
    );
    const response = await meRoute(
      new Request("http://localhost/api/auth/me", {
        headers: { authorization: "Bearer verified-id" },
      }),
      undefined,
    );

    expect(response.status).toBe(403);
    expect((await response.json()).error).toMatchObject({
      code: "FORBIDDEN",
    });
  });
});
