import { beforeEach, describe, expect, it, vi } from "vitest";

const { db } = vi.hoisted(() => ({ db: vi.fn() }));
vi.mock("@/lib/firebase", () => ({ db }));

import { getCover, saveCover } from "@/lib/data/books";

type Data = Record<string, unknown>;
type Reference = { collectionName: string; id: string };

function makeFirestore() {
  const documents = new Map<string, Map<string, Data>>();
  documents.set(
    "books",
    new Map([
      [
        "book-1",
        {
          title: "Libro",
          author: "Autora",
          category: "Novela",
          year: 2020,
          description: "Descripción",
          totalCopies: 2,
          availableCopies: 2,
          coverVersion: 3,
          updatedAt: "2026-10-23T00:00:00.000Z",
        },
      ],
    ]),
  );

  const get = async (reference: Reference) => {
    const data = documents.get(reference.collectionName)?.get(reference.id);
    return {
      id: reference.id,
      exists: data !== undefined,
      data: () => data,
    };
  };

  return {
    collection: (collectionName: string) => ({
      doc: (id: string) => ({
        collectionName,
        id,
        get: () => get({ collectionName, id }),
      }),
    }),
    runTransaction: async <T>(
      callback: (transaction: {
        get: (reference: Reference) => Promise<Awaited<ReturnType<typeof get>>>;
        set: (reference: Reference, data: Data) => void;
        update: (reference: Reference, data: Data) => void;
      }) => Promise<T>,
    ) => {
      const writes: Array<() => void> = [];
      const result = await callback({
        get,
        set: (reference, data) => {
          writes.push(() => {
            const collection =
              documents.get(reference.collectionName) ?? new Map<string, Data>();
            collection.set(reference.id, data);
            documents.set(reference.collectionName, collection);
          });
        },
        update: (reference, updates) => {
          writes.push(() => {
            const collection = documents.get(reference.collectionName);
            const current = collection?.get(reference.id);
            if (!collection || !current) throw new Error("Missing document");
            collection.set(reference.id, { ...current, ...updates });
          });
        },
      });
      writes.forEach((write) => write());
      return result;
    },
    read: (collectionName: string, id: string) =>
      documents.get(collectionName)?.get(id),
    seed: (collectionName: string, id: string, data: Data) => {
      const collection =
        documents.get(collectionName) ?? new Map<string, Data>();
      collection.set(id, data);
      documents.set(collectionName, collection);
    },
  };
}

describe("almacenamiento privado de portadas", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("guarda portada y aumenta coverVersion con updatedAt en una transacción", async () => {
    vi.useFakeTimers();
    const serverTime = "2026-10-24T00:00:00.000Z";
    vi.setSystemTime(new Date(serverTime));
    const firestore = makeFirestore();
    db.mockReturnValue(firestore);
    try {
      const saved = await saveCover("book-1", "image/png", "cG5nLWJ5dGVz");
      const storedBook = firestore.read("books", "book-1");
      const storedCover = firestore.read("bookCovers", "book-1");

      expect(storedBook).toMatchObject({
        coverVersion: 4,
        updatedAt: saved.updatedAt,
      });
      expect(saved.coverUrl).toBe("/api/books/book-1/cover?v=4");
      expect(storedCover).toMatchObject({
        contentType: "image/png",
        data: "cG5nLWJ5dGVz",
        updatedAt: saved.updatedAt,
      });
      expect(Date.parse(saved.updatedAt)).toBeGreaterThan(
        Date.parse(serverTime),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("recupera bytes originales y versión; devuelve 404 para portada ausente", async () => {
    const firestore = makeFirestore();
    const original = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0xff]);
    firestore.seed("bookCovers", "book-1", {
      contentType: "image/png",
      data: original.toString("base64"),
    });
    db.mockReturnValue(firestore);

    await expect(getCover("book-1")).resolves.toMatchObject({
      contentType: "image/png",
      bytes: original,
      version: 3,
    });
    await expect(getCover("missing")).rejects.toMatchObject({
      status: 404,
      code: "NOT_FOUND",
    });
  });
});
