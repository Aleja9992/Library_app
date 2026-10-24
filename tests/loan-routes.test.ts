import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/errors";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  listLoans: vi.fn(),
  requestLoan: vi.fn(),
  getLoan: vi.fn(),
  transitionLoan: vi.fn(),
}));

vi.mock("@/lib/guard", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/guard")>();
  return { ...actual, requireUser: mocks.requireUser };
});

vi.mock("@/lib/data/loans", () => ({
  listLoans: mocks.listLoans,
  requestLoan: mocks.requestLoan,
  getLoan: mocks.getLoan,
  transitionLoan: mocks.transitionLoan,
}));

import { GET as listRoute, POST as requestRoute } from "@/app/api/loans/route";
import {
  GET as detailRoute,
  PATCH as transitionRoute,
} from "@/app/api/loans/[id]/route";

const student = {
  uid: "student-1",
  email: "ana@example.com",
  name: "Ana",
  role: "student" as const,
};
const librarian = {
  uid: "librarian-1",
  email: "lib@example.com",
  name: "Bibliotecaria",
  role: "librarian" as const,
};
const loan = {
  id: "loan-1",
  bookId: "book-1",
  bookTitle: "Libro",
  userId: student.uid,
  userEmail: student.email,
  userName: student.name,
  status: "requested" as const,
  clientRequestId: "request-123",
  requestedAt: "2026-10-24T00:00:00.000Z",
  resolvedAt: null,
  dueDate: null,
  returnedAt: null,
  updatedAt: "2026-10-24T00:00:00.000Z",
};

function request(url: string, method = "GET", body?: unknown): Request {
  return new Request(url, {
    method,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

describe("endpoints de préstamos (data layer aislada)", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.requireUser.mockResolvedValue(student);
  });

  it("devuelve 401 si requireUser rechaza la petición", async () => {
    mocks.requireUser.mockRejectedValue(
      new ApiError(401, "UNAUTHENTICATED", "Se requiere autenticación."),
    );

    const response = await listRoute(request("http://localhost/api/loans"), undefined);
    expect(response.status).toBe(401);
    expect((await response.json()).error.code).toBe("UNAUTHENTICATED");
    expect(mocks.listLoans).not.toHaveBeenCalled();
  });

  it("lista los préstamos autorizados, filtra estado y devuelve serverTime", async () => {
    mocks.listLoans.mockResolvedValue([loan]);
    const response = await listRoute(
      request("http://localhost/api/loans?status=requested"),
      undefined,
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.loans).toEqual([loan]);
    expect(Number.isNaN(Date.parse(body.serverTime))).toBe(false);
    expect(mocks.listLoans).toHaveBeenCalledWith(student, "requested");
  });

  it("pasa el rol verificado del bibliotecario al listado general", async () => {
    mocks.requireUser.mockResolvedValue(librarian);
    mocks.listLoans.mockResolvedValue([loan]);

    const response = await listRoute(
      request("http://localhost/api/loans?status=requested"),
      undefined,
    );

    expect(response.status).toBe(200);
    expect(mocks.listLoans).toHaveBeenCalledWith(librarian, "requested");
  });

  it("requiere rol student para solicitar y devuelve 201 al crear", async () => {
    mocks.requestLoan.mockResolvedValue({ loan, created: true });
    const response = await requestRoute(
      request("http://localhost/api/loans", "POST", {
        bookId: "book-1",
        clientRequestId: "request-123",
      }),
      undefined,
    );

    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ loan, created: true });
    expect(mocks.requestLoan).toHaveBeenCalledWith(
      student,
      "book-1",
      "request-123",
    );

    mocks.requireUser.mockResolvedValue(librarian);
    const librarianResponse = await requestRoute(
      request("http://localhost/api/loans", "POST", {
        bookId: "book-1",
        clientRequestId: "request-456",
      }),
      undefined,
    );
    expect(librarianResponse.status).toBe(403);
    expect(mocks.requestLoan).toHaveBeenCalledTimes(1);
  });

  it("devuelve 200 para reintento idempotente y 409 para conflicto del dominio", async () => {
    mocks.requestLoan.mockResolvedValue({ loan, created: false });
    const retry = await requestRoute(
      request("http://localhost/api/loans", "POST", {
        bookId: "book-1",
        clientRequestId: "request-123",
      }),
      undefined,
    );
    mocks.requestLoan.mockRejectedValue(
      new ApiError(409, "ALREADY_ACTIVE", "Ya existe un préstamo activo."),
    );
    const conflict = await requestRoute(
      request("http://localhost/api/loans", "POST", {
        bookId: "book-1",
        clientRequestId: "request-456",
      }),
      undefined,
    );

    expect(retry.status).toBe(200);
    expect((await retry.json()).created).toBe(false);
    expect(conflict.status).toBe(409);
    expect((await conflict.json()).error.code).toBe("ALREADY_ACTIVE");
  });

  it("solo el bibliotecario modifica estados y procesa transiciones ilegales como 409", async () => {
    const forbidden = await transitionRoute(
      request("http://localhost/api/loans/loan-1", "PATCH", {
        action: "approve",
      }),
      { params: Promise.resolve({ id: "loan-1" }) },
    );
    expect(forbidden.status).toBe(403);

    mocks.requireUser.mockResolvedValue(librarian);
    mocks.transitionLoan.mockRejectedValue(
      new ApiError(409, "INVALID_STATE", "Transición inválida."),
    );
    const conflict = await transitionRoute(
      request("http://localhost/api/loans/loan-1", "PATCH", {
        action: "approve",
      }),
      { params: Promise.resolve({ id: "loan-1" }) },
    );

    expect(conflict.status).toBe(409);
    expect((await conflict.json()).error.code).toBe("INVALID_STATE");

    mocks.transitionLoan.mockResolvedValue({ ...loan, status: "approved" });
    const approved = await transitionRoute(
      request("http://localhost/api/loans/loan-1", "PATCH", {
        action: "approve",
      }),
      { params: Promise.resolve({ id: "loan-1" }) },
    );
    expect(approved.status).toBe(200);
    expect((await approved.json()).loan.status).toBe("approved");
  });

  it("mantiene 404 cuando el préstamo no existe o no pertenece al estudiante", async () => {
    mocks.getLoan.mockRejectedValue(
      new ApiError(404, "NOT_FOUND", "Préstamo no encontrado."),
    );
    const response = await detailRoute(
      request("http://localhost/api/loans/private-loan"),
      { params: Promise.resolve({ id: "private-loan" }) },
    );

    expect(response.status).toBe(404);
    expect((await response.json()).error.code).toBe("NOT_FOUND");
    expect(mocks.getLoan).toHaveBeenCalledWith("private-loan", student);
  });

  it("valida status, cuerpo de solicitud y acción de bibliotecario", async () => {
    const invalidFilter = await listRoute(
      request("http://localhost/api/loans?status=all"),
      undefined,
    );
    const invalidBody = await requestRoute(
      request("http://localhost/api/loans", "POST", {
        bookId: "book-1",
        clientRequestId: "x",
      }),
      undefined,
    );
    mocks.requireUser.mockResolvedValue(librarian);
    const invalidAction = await transitionRoute(
      request("http://localhost/api/loans/loan-1", "PATCH", {
        action: "delete",
      }),
      { params: Promise.resolve({ id: "loan-1" }) },
    );

    expect(invalidFilter.status).toBe(400);
    expect(invalidBody.status).toBe(400);
    expect(invalidAction.status).toBe(400);

    mocks.requireUser.mockResolvedValue(student);
    const invalidBookId = await requestRoute(
      request("http://localhost/api/loans", "POST", {
        bookId: "books/book-1",
        clientRequestId: "request-123",
      }),
      undefined,
    );
    expect(invalidBookId.status).toBe(400);
  });
});
