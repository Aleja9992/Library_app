import { describe, expect, it } from "vitest";
import {
  bookQuerySchema,
  coverSchema,
  createLoanSchema,
  loanActionSchema,
  loanQuerySchema,
  loginSchema,
  refreshSchema,
  registerSchema,
} from "@/lib/schemas";

describe("esquemas de autenticación", () => {
  it("normaliza el correo antes de validarlo", () => {
    expect(
      loginSchema.parse({ email: "  Ana@Mail.COM ", password: "x" }).email,
    ).toBe("ana@mail.com");
  });

  it("rechaza correos inválidos y contraseñas de registro cortas", () => {
    expect(
      loginSchema.safeParse({ email: "correo-inválido", password: "x" }).success,
    ).toBe(false);
    expect(
      registerSchema.safeParse({
        email: "ana@example.com",
        password: "12345",
        displayName: "Ana",
      }).success,
    ).toBe(false);
  });

  it("valida nombre de registro y refresh token", () => {
    expect(
      registerSchema.safeParse({
        email: "ana@example.com",
        password: "123456",
        displayName: "Ana",
      }).success,
    ).toBe(true);
    expect(refreshSchema.safeParse({ refreshToken: "" }).success).toBe(false);
  });
});

describe("esquemas de préstamos", () => {
  it("acepta identificadores seguros y rechaza separadores de ruta", () => {
    expect(
      createLoanSchema.safeParse({
        bookId: "clean-code",
        clientRequestId: "3f2b8c1e-7d44-4b9a",
      }).success,
    ).toBe(true);
    expect(
      createLoanSchema.safeParse({
        bookId: "clean-code",
        clientRequestId: "../../etc/passwd",
      }).success,
    ).toBe(false);
    expect(
      createLoanSchema.safeParse({
        bookId: "clean-code",
        clientRequestId: "short",
      }).success,
    ).toBe(false);
  });

  it("acepta solo acciones y estados conocidos", () => {
    expect(loanActionSchema.safeParse({ action: "approve" }).success).toBe(true);
    expect(loanActionSchema.safeParse({ action: "delete" }).success).toBe(false);
    expect(loanQuerySchema.safeParse({ status: "returned" }).success).toBe(true);
    expect(loanQuerySchema.safeParse({ status: "pending" }).success).toBe(false);
  });
});

describe("esquemas de portada y catálogo", () => {
  it("valida MIME, Base64 y longitud máxima de portadas", () => {
    const validBase64 = "A".repeat(200);
    expect(
      coverSchema.safeParse({ contentType: "image/jpeg", data: validBase64 })
        .success,
    ).toBe(true);
    expect(
      coverSchema.safeParse({ contentType: "image/gif", data: validBase64 })
        .success,
    ).toBe(false);
    expect(
      coverSchema.safeParse({
        contentType: "image/webp",
        data: `${"A".repeat(198)}!!`,
      }).success,
    ).toBe(false);
    expect(
      coverSchema.safeParse({
        contentType: "image/png",
        data: "A".repeat(700_001),
      }).success,
    ).toBe(false);
  });

  it("valida límites de filtros y fecha ISO", () => {
    expect(
      bookQuerySchema.safeParse({
        q: "colera",
        category: "Novela",
        updatedSince: "2026-10-12T10:00:00.000Z",
      }).success,
    ).toBe(true);
    expect(bookQuerySchema.safeParse({ updatedSince: "ayer" }).success).toBe(
      false,
    );
    expect(bookQuerySchema.safeParse({ q: "x".repeat(101) }).success).toBe(
      false,
    );
    expect(bookQuerySchema.safeParse({ category: "x".repeat(61) }).success).toBe(
      false,
    );
  });
});
