import { describe, expect, it } from "vitest";
import {
  applyAction,
  assertCanRequest,
  assertTransitionAllowed,
  isActive,
  LOAN_DAYS,
  LoanRuleError,
} from "@/lib/domain/loan-rules";
import type { Loan, LoanStatus } from "@/lib/types";

const baseLoan = (status: LoanStatus = "requested"): Loan => ({
  id: "loan-1",
  bookId: "book-1",
  bookTitle: "Libro",
  userId: "student-1",
  userEmail: "ana@example.com",
  userName: "Ana",
  status,
  clientRequestId: "request-123",
  requestedAt: "2026-01-01T00:00:00.000Z",
  resolvedAt: null,
  dueDate: null,
  returnedAt: null,
  updatedAt: "2026-01-01T00:00:00.000Z",
});

const inventory = { availableCopies: 1, totalCopies: 2 };
const now = new Date("2026-10-24T12:00:00.000Z");

function expectApiError(
  callback: () => unknown,
  status: number,
  code: string,
): void {
  try {
    callback();
    throw new Error("Se esperaba ApiError.");
  } catch (error) {
    expect(error).toBeInstanceOf(LoanRuleError);
    expect(error).toMatchObject({ status, code });
  }
}

describe("reglas del dominio de préstamos", () => {
  it("reconoce estados activos y permite pedir libro disponible", () => {
    expect(isActive("requested")).toBe(true);
    expect(isActive("approved")).toBe(true);
    expect(isActive("returned")).toBe(false);
    expect(isActive("rejected")).toBe(false);
    expect(() => assertCanRequest("book-1", inventory, [])).not.toThrow();
  });

  it("bloquea otro préstamo activo del mismo libro, pero permite otro libro", () => {
    const activeLoan = { bookId: "book-1", status: "approved" as const };
    expectApiError(
      () => assertCanRequest("book-1", inventory, [activeLoan]),
      409,
      "ALREADY_ACTIVE",
    );
    expect(() =>
      assertCanRequest("book-2", inventory, [activeLoan]),
    ).not.toThrow();
    expect(() =>
      assertCanRequest("book-1", inventory, [
        { bookId: "book-1", status: "returned" },
      ]),
    ).not.toThrow();
    expect(() =>
      assertCanRequest("book-1", inventory, [
        { bookId: "book-1", status: "rejected" },
      ]),
    ).not.toThrow();
  });

  it("rechaza solicitudes sin ejemplares y prioriza el préstamo activo", () => {
    expectApiError(
      () =>
        assertCanRequest(
          "book-1",
          { availableCopies: 0, totalCopies: 2 },
          [],
        ),
      409,
      "NO_COPIES",
    );
    expectApiError(
      () =>
        assertCanRequest(
          "book-1",
          { availableCopies: 0, totalCopies: 2 },
          [{ bookId: "book-1", status: "requested" }],
        ),
      409,
      "ALREADY_ACTIVE",
    );
  });

  it("aprueba, descuenta un ejemplar y fija vencimiento exactamente a 14 días", () => {
    const result = applyAction(baseLoan(), "approve", inventory, now);

    expect(LOAN_DAYS).toBe(14);
    expect(result.loan).toMatchObject({
      status: "approved",
      resolvedAt: now.toISOString(),
      dueDate: "2026-11-07T12:00:00.000Z",
      returnedAt: null,
      updatedAt: now.toISOString(),
    });
    expect(result.inventory).toEqual({ availableCopies: 0, totalCopies: 2 });
  });

  it("rechaza sin alterar inventario", () => {
    const result = applyAction(baseLoan(), "reject", inventory, now);

    expect(result.loan).toMatchObject({
      status: "rejected",
      resolvedAt: now.toISOString(),
      updatedAt: now.toISOString(),
    });
    expect(result.inventory).toEqual(inventory);
  });

  it("devuelve un préstamo aprobado e incrementa inventario sin superar totalCopies", () => {
    const result = applyAction(
      baseLoan("approved"),
      "return",
      { availableCopies: 1, totalCopies: 2 },
      now,
    );

    expect(result.loan).toMatchObject({
      status: "returned",
      returnedAt: now.toISOString(),
      updatedAt: now.toISOString(),
    });
    expect(result.inventory).toEqual({ availableCopies: 2, totalCopies: 2 });
  });

  it("rechaza devolver cuando el inventario ya alcanzó totalCopies", () => {
    expectApiError(
      () =>
        applyAction(
          baseLoan("approved"),
          "return",
          { availableCopies: 2, totalCopies: 2 },
          now,
        ),
      409,
      "INVALID_STATE",
    );
  });

  it.each([
    ["requested", "return"],
    ["approved", "approve"],
    ["approved", "reject"],
    ["rejected", "approve"],
    ["rejected", "return"],
    ["returned", "approve"],
    ["returned", "reject"],
    ["returned", "return"],
  ] as const)("rechaza transición ilegal %s -> %s", (status, action) => {
    expectApiError(
      () => applyAction(baseLoan(status), action, inventory, now),
      409,
      "INVALID_STATE",
    );
  });

  it("no aprueba si el último ejemplar ya no está disponible", () => {
    expectApiError(
      () =>
        applyAction(
          baseLoan(),
          "approve",
          { availableCopies: 0, totalCopies: 1 },
          now,
        ),
      409,
      "NO_COPIES",
    );
  });

  it("valida estado antes de consultar inventario para una transición inválida", () => {
    expectApiError(
      () => assertTransitionAllowed(baseLoan("requested"), "return"),
      409,
      "INVALID_STATE",
    );
  });
});
