import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getWebUser: vi.fn(),
  hasWebSessionCookie: vi.fn(),
  redirect: vi.fn((destination: string) => {
    throw new Error(`REDIRECT:${destination}`);
  }),
}));

vi.mock("@/lib/web/session", () => ({
  getWebUser: mocks.getWebUser,
  hasWebSessionCookie: mocks.hasWebSessionCookie,
}));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));

import { requireWebRole, requireWebUser } from "@/lib/web/access";

describe("protección de páginas web", () => {
  beforeEach(() => vi.clearAllMocks());

  it("redirige a login cuando no existe una sesión verificada", async () => {
    mocks.getWebUser.mockResolvedValue(null);
    mocks.hasWebSessionCookie.mockResolvedValue(false);
    await expect(requireWebUser()).rejects.toThrow("REDIRECT:/login");
    expect(mocks.redirect).toHaveBeenCalledWith("/login");
  });

  it("informa cuando la cookie está presente pero la sesión ya expiró", async () => {
    mocks.getWebUser.mockResolvedValue(null);
    mocks.hasWebSessionCookie.mockResolvedValue(true);
    await expect(requireWebUser()).rejects.toThrow("REDIRECT:/login?expired=1");
    expect(mocks.redirect).toHaveBeenCalledWith("/login?expired=1");
  });

  it("bloquea a estudiante en áreas exclusivas del bibliotecario", async () => {
    mocks.getWebUser.mockResolvedValue({
      uid: "student-1",
      email: "ana@example.com",
      name: "Ana",
      role: "student",
    });
    await expect(requireWebRole("librarian")).rejects.toThrow(
      "REDIRECT:/books?error=forbidden",
    );
    expect(mocks.redirect).toHaveBeenCalledWith("/books?error=forbidden");
  });

  it("permite el rol esperado", async () => {
    const librarian = {
      uid: "librarian-1",
      email: "biblioteca@example.com",
      name: "Biblioteca",
      role: "librarian" as const,
    };
    mocks.getWebUser.mockResolvedValue(librarian);
    await expect(requireWebRole("librarian")).resolves.toEqual(librarian);
  });
});
