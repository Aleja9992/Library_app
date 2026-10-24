import { beforeEach, describe, expect, it, vi } from "vitest";

const { db, queryCalls } = vi.hoisted(() => ({
  db: vi.fn(),
  queryCalls: [] as unknown[][],
}));

vi.mock("@/lib/firebase", () => ({ db }));

import { listBooks } from "@/lib/data/books";

const bookDocument = (title: string, updatedAt: string) => ({
  title,
  author: "Autor",
  category: "Novela",
  year: 2020,
  description: "Descripción",
  totalCopies: 1,
  availableCopies: 1,
  updatedAt,
});

describe("sincronización incremental del catálogo", () => {
  beforeEach(() => {
    queryCalls.length = 0;
    db.mockReturnValue({
      collection: () => ({
        where: (field: string, operator: string, since: string) => {
          queryCalls.push([field, operator, since]);
          return {
            get: async () => ({
              docs: [
                {
                  id: "old",
                  data: () => bookDocument("Anterior", "2026-10-22T00:00:00.000Z"),
                },
                {
                  id: "new",
                  data: () => bookDocument("Actualizado", "2026-10-24T00:00:00.000Z"),
                },
              ].filter((document) => document.data().updatedAt > since),
            }),
          };
        },
        get: async () => ({ docs: [] }),
      }),
    });
  });

  it("filtra updatedAt estrictamente posterior a updatedSince", async () => {
    const books = await listBooks({
      updatedSince: "2026-10-23T00:00:00.000Z",
    });

    expect(queryCalls).toEqual([
      ["updatedAt", ">", "2026-10-23T00:00:00.000Z"],
    ]);
    expect(books.map((book) => book.id)).toEqual(["new"]);
  });
});
