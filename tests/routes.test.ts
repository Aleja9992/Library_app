import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Book } from "@/lib/types";
import { getBook, listBooks, listCategories } from "@/lib/data/books";
import { GET as healthRoute } from "@/app/api/health/route";
import { GET as booksRoute } from "@/app/api/books/route";
import { GET as bookRoute } from "@/app/api/books/[id]/route";

vi.mock("@/lib/data/books", () => ({
  getBook: vi.fn(),
  listBooks: vi.fn(),
  listCategories: vi.fn(),
}));

vi.mock("@/lib/guard", () => ({
  requireUser: vi.fn().mockResolvedValue({
    uid: "student-1",
    email: "ana@example.com",
    name: "Ana",
    role: "student",
  }),
}));

const book: Book = {
  id: "clean-code",
  title: "Clean Code",
  author: "Robert C. Martin",
  category: "Tecnología",
  year: 2008,
  description: "Prácticas para escribir código mantenible.",
  totalCopies: 3,
  availableCopies: 3,
  coverUrl: null,
  updatedAt: "2026-10-24T00:00:00.000Z",
};

describe("rutas autenticadas de catálogo", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("health responde sin depender del catálogo", async () => {
    const response = await healthRoute();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      status: "ok",
      service: "library_api",
    });
    expect(listBooks).not.toHaveBeenCalled();
  });

  it("lista libros, categorías y serverTime con filtros validados", async () => {
    vi.mocked(listBooks).mockResolvedValue([book]);
    vi.mocked(listCategories).mockResolvedValue(["Tecnología"]);
    const response = await booksRoute(
      new Request("http://localhost/api/books?q=clean&category=Tecnolog%C3%ADa"),
      undefined,
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      books: [book],
      categories: ["Tecnología"],
    });
    expect(Number.isNaN(Date.parse(body.serverTime))).toBe(false);
    expect(listBooks).toHaveBeenCalledWith({
      q: "clean",
      category: "Tecnología",
    });
  });

  it("usa updatedSince y captura serverTime antes de consultar el catálogo", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-24T10:00:00.000Z"));
    vi.mocked(listBooks).mockImplementation(async () => {
      vi.setSystemTime(new Date("2026-10-24T10:00:05.000Z"));
      return [book];
    });
    vi.mocked(listCategories).mockResolvedValue(["Tecnología"]);

    try {
      const response = await booksRoute(
        new Request(
          "http://localhost/api/books?updatedSince=2026-10-23T10%3A00%3A00.000Z",
        ),
        undefined,
      );
      const body = await response.json();

      expect(body.serverTime).toBe("2026-10-24T10:00:00.000Z");
      expect(listBooks).toHaveBeenCalledWith({
        updatedSince: "2026-10-23T10:00:00.000Z",
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("devuelve 400 para filtros inválidos y envuelve el detalle individual", async () => {
    const invalidQuery = await booksRoute(
      new Request("http://localhost/api/books?updatedSince=ayer"),
      undefined,
    );
    vi.mocked(getBook).mockResolvedValue(book);
    const detail = await bookRoute(new Request("http://localhost/api/books/clean-code"), {
      params: Promise.resolve({ id: "clean-code" }),
    });

    expect(invalidQuery.status).toBe(400);
    expect((await invalidQuery.json()).error.code).toBe("VALIDATION_ERROR");
    expect(detail.status).toBe(200);
    expect(await detail.json()).toEqual({ book });
    expect(getBook).toHaveBeenCalledWith("clean-code");
  });
});
