import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthUser } from "@/lib/types";

const { db } = vi.hoisted(() => ({ db: vi.fn() }));

vi.mock("@/lib/firebase", () => ({ db }));
vi.mock("@/lib/data/books", () => ({ BOOKS: "books" }));

import {
  getLoan,
  LOANS,
  requestLoan,
  transitionLoan,
} from "@/lib/data/loans";

type RecordData = Record<string, unknown>;
type FakeReference = { collectionName: string; id: string };
type FakeQuery = {
  kind: "query";
  collectionName: string;
  field: string;
  value: unknown;
};
type FakeSnapshot = {
  id: string;
  exists: boolean;
  data: () => RecordData | undefined;
  docs?: FakeSnapshot[];
};

function makeFirestore(initial: Record<string, RecordData> = {}) {
  const collections = new Map<string, Map<string, RecordData>>();
  for (const [id, data] of Object.entries(initial)) {
    const collection = collections.get("books") ?? new Map<string, RecordData>();
    collection.set(id, data);
    collections.set("books", collection);
  }

  const snapshot = (id: string, data?: RecordData): FakeSnapshot => ({
    id,
    exists: data !== undefined,
    data: () => data,
  });

  const reference = (collectionName: string, id: string) => ({
    collectionName,
    id,
    get: async () =>
      snapshot(id, collections.get(collectionName)?.get(id)),
  });

  const collection = (collectionName: string) => ({
    doc: (id: string) => reference(collectionName, id),
    where: (field: string, _operator: string, value: unknown): FakeQuery => ({
      kind: "query",
      collectionName,
      field,
      value,
    }),
  });

  const firestore = {
    collection,
    runTransaction: async <T>(
      callback: (transaction: {
        get: (target: FakeReference | FakeQuery) => Promise<FakeSnapshot>;
        create: (target: FakeReference, data: RecordData) => void;
        set: (target: FakeReference, data: RecordData) => void;
        update: (target: FakeReference, data: RecordData) => void;
        delete: (target: FakeReference) => void;
      }) => Promise<T>,
    ): Promise<T> => {
      const writes: Array<() => void> = [];
      const transaction = {
        get: async (target: FakeReference | FakeQuery) => {
          if ("kind" in target) {
            const docs = [...(collections.get(target.collectionName) ?? new Map())]
              .filter(([, data]) => data[target.field] === target.value)
              .map(([id, data]) => snapshot(id, data));
            return {
              id: "",
              exists: true,
              data: () => undefined,
              docs,
            };
          }
          return snapshot(
            target.id,
            collections.get(target.collectionName)?.get(target.id),
          );
        },
        create: (target: FakeReference, data: RecordData) => {
          writes.push(() => {
            const documents =
              collections.get(target.collectionName) ??
              new Map<string, RecordData>();
            if (documents.has(target.id)) {
              throw new Error("Document already exists.");
            }
            documents.set(target.id, data);
            collections.set(target.collectionName, documents);
          });
        },
        set: (target: FakeReference, data: RecordData) => {
          writes.push(() => {
            const documents =
              collections.get(target.collectionName) ??
              new Map<string, RecordData>();
            documents.set(target.id, data);
            collections.set(target.collectionName, documents);
          });
        },
        update: (target: FakeReference, data: RecordData) => {
          writes.push(() => {
            const documents = collections.get(target.collectionName);
            const current = documents?.get(target.id);
            if (!documents || !current) throw new Error("Document missing.");
            documents.set(target.id, { ...current, ...data });
          });
        },
        delete: (target: FakeReference) => {
          writes.push(() => collections.get(target.collectionName)?.delete(target.id));
        },
      };
      const result = await callback(transaction);
      writes.forEach((write) => write());
      return result;
    },
    count: (collectionName: string) =>
      collections.get(collectionName)?.size ?? 0,
    read: (collectionName: string, id: string) =>
      collections.get(collectionName)?.get(id),
    seed: (collectionName: string, id: string, data: RecordData) => {
      const documents =
        collections.get(collectionName) ?? new Map<string, RecordData>();
      documents.set(id, data);
      collections.set(collectionName, documents);
    },
  };
  return firestore;
}

const student: AuthUser = {
  uid: "student-1",
  email: "ana@example.com",
  name: "Ana",
  role: "student",
};

describe("acceso a préstamos (adaptador Firestore secuencial simulado)", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("reutiliza el documento del mismo clientRequestId en reintentos secuenciales", async () => {
    const firestore = makeFirestore({
      "book-1": {
        title: "Libro",
        totalCopies: 2,
        availableCopies: 2,
        updatedAt: "2026-10-24T00:00:00.000Z",
      },
    });
    db.mockReturnValue(firestore);

    const first = await requestLoan(student, "book-1", "request-123");
    const retry = await requestLoan(student, "book-1", "request-123");

    expect(first.created).toBe(true);
    expect(retry.created).toBe(false);
    expect(retry.loan.id).toBe(first.loan.id);
    expect(firestore.count(LOANS)).toBe(1);
    expect(firestore.count("loanLocks")).toBe(1);
  });

  it("oculta un préstamo ajeno al estudiante con 404", async () => {
    const firestore = makeFirestore();
    firestore.seed(LOANS, "private-loan", {
      bookId: "book-1",
      bookTitle: "Libro",
      userId: "other-student",
      userEmail: "otro@example.com",
      userName: "Otro",
      status: "requested",
      clientRequestId: "request-123",
      requestedAt: "2026-10-24T00:00:00.000Z",
      resolvedAt: null,
      dueDate: null,
      returnedAt: null,
      updatedAt: "2026-10-24T00:00:00.000Z",
    });
    db.mockReturnValue(firestore);

    await expect(getLoan("private-loan", student)).rejects.toMatchObject({
      status: 404,
      code: "NOT_FOUND",
    });
  });

  it("actualiza préstamo e inventario juntos al aprobar", async () => {
    const firestore = makeFirestore({
      "book-1": {
        title: "Libro",
        totalCopies: 1,
        availableCopies: 1,
        updatedAt: "2026-10-23T00:00:00.000Z",
      },
    });
    firestore.seed(LOANS, "loan-1", {
      bookId: "book-1",
      bookTitle: "Libro",
      userId: student.uid,
      userEmail: student.email,
      userName: student.name,
      status: "requested",
      clientRequestId: "request-123",
      requestedAt: "2026-10-23T00:00:00.000Z",
      resolvedAt: null,
      dueDate: null,
      returnedAt: null,
      updatedAt: "2026-10-23T00:00:00.000Z",
    });
    firestore.seed("loanLocks", "ignored-lock-id", { loanId: "loan-1" });
    db.mockReturnValue(firestore);

    const result = await transitionLoan("loan-1", "approve");
    const savedBook = firestore.read("books", "book-1");
    const savedLoan = firestore.read(LOANS, "loan-1");

    expect(result.status).toBe("approved");
    expect(savedLoan).toMatchObject({
      status: "approved",
      resolvedAt: result.resolvedAt,
      dueDate: result.dueDate,
    });
    expect(savedBook).toMatchObject({
      availableCopies: 0,
      updatedAt: result.updatedAt,
    });
  });
});
