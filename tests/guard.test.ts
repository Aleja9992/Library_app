import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/errors";

const { verifyIdToken } = vi.hoisted(() => ({
  verifyIdToken: vi.fn(),
}));

vi.mock("@/lib/services/auth", () => ({ verifyIdToken }));

import { assertRole, requireUser } from "@/lib/guard";

const request = (authorization?: string) =>
  new Request("http://localhost/api", {
    headers: authorization ? { authorization } : {},
  });

describe("requireUser (Firebase Admin simulado)", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("responde 401 si falta Authorization", async () => {
    await expect(requireUser(request())).rejects.toMatchObject({
      status: 401,
      code: "UNAUTHENTICATED",
    });
    expect(verifyIdToken).not.toHaveBeenCalled();
  });

  it("responde 401 para un esquema que no sea Bearer", async () => {
    await expect(requireUser(request("Basic token"))).rejects.toMatchObject({
      status: 401,
      code: "UNAUTHENTICATED",
    });
    expect(verifyIdToken).not.toHaveBeenCalled();
  });

  it("devuelve el usuario autenticado solo tras verificar el token", async () => {
    const user = {
      uid: "student-1",
      email: "ana@example.com",
      name: "Ana",
      role: "student" as const,
    };
    verifyIdToken.mockResolvedValue(user);

    await expect(requireUser(request("Bearer valid-token"))).resolves.toEqual(
      user,
    );
    expect(verifyIdToken).toHaveBeenCalledWith("valid-token");
  });
});

describe("assertRole", () => {
  const student = {
    uid: "student-1",
    email: "ana@example.com",
    name: "Ana",
    role: "student" as const,
  };

  it("permite el rol esperado y rechaza la elevación a bibliotecario", () => {
    expect(() => assertRole(student, "student")).not.toThrow();
    try {
      assertRole(student, "librarian");
      throw new Error("Se esperaba rechazo de rol.");
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      expect(error).toMatchObject({
        status: 403,
        code: "FORBIDDEN",
      });
    }
  });
});
