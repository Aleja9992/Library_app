import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/errors";

const mocks = vi.hoisted(() => ({
  login: vi.fn(),
  register: vi.fn(),
  setSessionCookie: vi.fn(),
  clearSessionCookie: vi.fn(),
  requireWebUser: vi.fn(),
  requestLoan: vi.fn(),
  transitionLoan: vi.fn(),
  saveCover: vi.fn(),
  validateCoverImage: vi.fn(),
  revalidatePath: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock("@/lib/services/auth", () => ({
  login: mocks.login,
  register: mocks.register,
}));
vi.mock("@/lib/web/session", () => ({
  setSessionCookie: mocks.setSessionCookie,
  clearSessionCookie: mocks.clearSessionCookie,
}));
vi.mock("@/lib/web/access", () => ({ requireWebUser: mocks.requireWebUser }));
vi.mock("@/lib/data/loans", () => ({
  requestLoan: mocks.requestLoan,
  transitionLoan: mocks.transitionLoan,
}));
vi.mock("@/lib/data/books", () => ({ saveCover: mocks.saveCover }));
vi.mock("@/lib/services/covers", () => ({
  validateCoverImage: mocks.validateCoverImage,
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({
  redirect: mocks.redirect,
  notFound: vi.fn(),
}));

import {
  loginAction,
  registerAction,
  requestLoanAction,
  transitionLoanAction,
  logoutAction,
} from "@/app/actions";

function form(values: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

describe("acciones web aisladas", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.requireWebUser.mockResolvedValue({
      uid: "student-1",
      email: "ana@example.com",
      name: "Ana",
      role: "student",
    });
  });

  it("valida login con Zod y unifica credenciales incorrectas", async () => {
    const invalid = await loginAction(
      {},
      form({ email: "not-an-email", password: "" }),
    );
    mocks.login.mockRejectedValue(
      new ApiError(401, "INVALID_CREDENTIALS", "Credenciales inválidas"),
    );
    const wrongCredentials = await loginAction(
      {},
      form({ email: "ana@example.com", password: "wrong-secret" }),
    );

    expect(invalid.fieldErrors?.email).toBeTruthy();
    expect(wrongCredentials.error).toBe("Correo o contraseña incorrectos.");
    expect(wrongCredentials.error).not.toContain("existe");
    expect(mocks.setSessionCookie).not.toHaveBeenCalled();

    mocks.login.mockResolvedValue({
      user: { uid: "student-1", role: "student" },
      tokens: { idToken: "server-only-id-token", refreshToken: "server-only-refresh" },
    });
    await loginAction(
      {},
      form({ email: "ana@example.com", password: "correct-secret" }),
    );
    expect(mocks.setSessionCookie).toHaveBeenCalledWith("server-only-id-token");
    expect(mocks.redirect).toHaveBeenCalledWith("/books");
  });

  it("dirige a la gestión al iniciar sesión con un rol administrativo", async () => {
    mocks.login.mockResolvedValue({
      user: { uid: "librarian-1", role: "librarian" },
      tokens: { idToken: "librarian-id-token", refreshToken: "private-refresh" },
    });

    await loginAction(
      {},
      form({ email: "biblioteca@example.com", password: "correct-secret" }),
    );

    expect(mocks.setSessionCookie).toHaveBeenCalledWith("librarian-id-token");
    expect(mocks.redirect).toHaveBeenCalledWith("/loans");
  });

  it("registra sin aceptar role del formulario y almacena la cookie de servidor", async () => {
    mocks.register.mockResolvedValue({
      user: { uid: "student-1", role: "student" },
      tokens: { idToken: "private-id-token", refreshToken: "private-refresh" },
    });
    const data = form({
      email: "ana@example.com",
      password: "secure-pass",
      displayName: "Ana",
      role: "librarian",
    });

    await registerAction({}, data);
    expect(mocks.register).toHaveBeenCalledWith(
      "ana@example.com",
      "secure-pass",
      "Ana",
    );
    expect(mocks.setSessionCookie).toHaveBeenCalledWith("private-id-token");
    expect(mocks.redirect).toHaveBeenCalledWith("/books");
  });

  it("verifica el rol student en cada acción antes de solicitar el préstamo", async () => {
    const data = form({ bookId: "book-1", clientRequestId: "request-123" });
    mocks.requestLoan.mockResolvedValue({ created: true });

    const state = await requestLoanAction({}, data);
    expect(state.success).toContain("Solicitud enviada");
    expect(mocks.requestLoan).toHaveBeenCalledWith(
      expect.objectContaining({ uid: "student-1" }),
      "book-1",
      "request-123",
    );

    mocks.requireWebUser.mockResolvedValue({
      uid: "librarian-1",
      email: "lib@example.com",
      name: "Bibliotecaria",
      role: "librarian",
    });
    await expect(requestLoanAction({}, data)).rejects.toMatchObject({
      status: 403,
      code: "FORBIDDEN",
    });
    expect(mocks.requestLoan).toHaveBeenCalledTimes(1);
  });

  it("protege las acciones de gestión contra estudiantes incluso si se manipula el formulario", async () => {
    await expect(
      transitionLoanAction(
        {},
        form({ loanId: "loan-1", action: "approve" }),
      ),
    ).rejects.toMatchObject({ status: 403, code: "FORBIDDEN" });
    expect(mocks.transitionLoan).not.toHaveBeenCalled();
  });

  it("permite que un bibliotecario gestione una solicitud desde la web", async () => {
    mocks.requireWebUser.mockResolvedValue({
      uid: "librarian-1",
      email: "biblioteca@example.com",
      name: "Biblioteca",
      role: "librarian",
    });
    mocks.transitionLoan.mockResolvedValue({ status: "approved" });

    const state = await transitionLoanAction(
      {},
      form({ loanId: "loan-1", action: "approve" }),
    );

    expect(state.success).toContain("actualizó");
    expect(mocks.transitionLoan).toHaveBeenCalledWith("loan-1", "approve");
  });

  it("cierra sesión borrando la cookie y redirigiendo al login", async () => {
    await logoutAction();
    expect(mocks.clearSessionCookie).toHaveBeenCalledOnce();
    expect(mocks.redirect).toHaveBeenCalledWith("/login");
  });
});
