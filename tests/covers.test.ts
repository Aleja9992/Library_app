import { beforeEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { ApiError } from "@/lib/errors";
import type { Book } from "@/lib/types";

const mocks = vi.hoisted(() => ({
  getCover: vi.fn(),
  saveCover: vi.fn(),
  requireUser: vi.fn(),
}));

vi.mock("@/lib/data/books", () => ({
  getCover: mocks.getCover,
  saveCover: mocks.saveCover,
}));
vi.mock("@/lib/guard", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/guard")>();
  return { ...actual, requireUser: mocks.requireUser };
});

import { GET as getCoverRoute, PUT as putCoverRoute } from "@/app/api/books/[id]/cover/route";
import { validateCoverImage } from "@/lib/services/covers";

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

async function image(format: "jpeg" | "png" | "webp"): Promise<Buffer> {
  return sharp({
    create: {
      width: 3,
      height: 3,
      channels: 3,
      background: { r: 30, g: 90, b: 160 },
    },
  })
    .toFormat(format)
    .toBuffer();
}

function context(id = "book-1"): RouteContext<"/api/books/[id]/cover"> {
  return { params: Promise.resolve({ id }) };
}

function putRequest(contentType: string, data: string): Request {
  return new Request("http://localhost/api/books/book-1/cover", {
    method: "PUT",
    body: JSON.stringify({ contentType, data }),
    headers: { "Content-Type": "application/json" },
  });
}

describe("validación local de archivos de portada", () => {
  it.each([
    ["jpeg", "image/jpeg"],
    ["png", "image/png"],
    ["webp", "image/webp"],
  ] as const)("decodifica una imagen %s válida", async (format, contentType) => {
    const bytes = await image(format);
    await expect(
      validateCoverImage(contentType, bytes.toString("base64")),
    ).resolves.toEqual(bytes);
  });

  it("rechaza MIME no coincidente, HTML renombrado, Base64 inválido y contenido vacío", async () => {
    const png = await image("png");
    const html = Buffer.from(
      "<!doctype html><html><body>Esto no es una imagen real.</body></html>",
    ).toString("base64");

    await expect(
      validateCoverImage("image/jpeg", png.toString("base64")),
    ).rejects.toMatchObject({ status: 400, code: "VALIDATION_ERROR" });
    await expect(
      validateCoverImage("image/png", html),
    ).rejects.toMatchObject({ status: 400, code: "VALIDATION_ERROR" });
    await expect(
      validateCoverImage("image/png", "%%%not-base64%%%"),
    ).rejects.toMatchObject({ status: 400, code: "VALIDATION_ERROR" });
    await expect(
      validateCoverImage("image/png", ""),
    ).rejects.toMatchObject({ status: 400, code: "VALIDATION_ERROR" });
  });
});

describe("rutas de portada", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.requireUser.mockResolvedValue(librarian);
  });

  it("descarga exactamente los bytes con MIME y caché por versión", async () => {
    const bytes = await image("webp");
    mocks.getCover.mockResolvedValue({
      contentType: "image/webp",
      bytes,
      version: 4,
    });

    const current = await getCoverRoute(
      new Request("http://localhost/api/books/book-1/cover?v=4"),
      context(),
    );
    const oldVersion = await getCoverRoute(
      new Request("http://localhost/api/books/book-1/cover?v=3"),
      context(),
    );

    expect(current.status).toBe(200);
    expect(current.headers.get("content-type")).toBe("image/webp");
    expect(current.headers.get("cache-control")).toBe(
      "public, max-age=31536000, immutable",
    );
    expect(Buffer.from(await current.arrayBuffer())).toEqual(bytes);
    expect(oldVersion.headers.get("cache-control")).toBe("no-cache");
  });

  it("devuelve 404 si no hay portada o libro", async () => {
    mocks.getCover.mockRejectedValue(
      new ApiError(404, "NOT_FOUND", "Portada no encontrada."),
    );
    const response = await getCoverRoute(
      new Request("http://localhost/api/books/missing/cover"),
      context("missing"),
    );

    expect(response.status).toBe(404);
    expect((await response.json()).error.code).toBe("NOT_FOUND");
  });

  it("prohíbe a estudiantes, valida contenido y permite subir a bibliotecarios", async () => {
    const bytes = await image("png");
    const base64 = bytes.toString("base64");
    mocks.requireUser.mockResolvedValue(student);
    const forbidden = await putCoverRoute(
      putRequest("image/png", base64),
      context(),
    );
    expect(forbidden.status).toBe(403);
    expect(mocks.saveCover).not.toHaveBeenCalled();

    mocks.requireUser.mockResolvedValue(librarian);
    const badImage = await putCoverRoute(
      putRequest("image/png", Buffer.from("<html>not an image</html>").toString("base64")),
      context(),
    );
    expect(badImage.status).toBe(400);
    expect(mocks.saveCover).not.toHaveBeenCalled();

    const updatedBook: Book = {
      id: "book-1",
      title: "Libro",
      author: "Autora",
      category: "Novela",
      year: 2020,
      description: "Descripción",
      totalCopies: 1,
      availableCopies: 1,
      coverUrl: "/api/books/book-1/cover?v=5",
      updatedAt: "2026-10-24T00:00:00.000Z",
    };
    mocks.saveCover.mockResolvedValue(updatedBook);
    const saved = await putCoverRoute(
      putRequest("image/png", base64),
      context(),
    );

    expect(saved.status).toBe(200);
    expect((await saved.json()).book).toEqual(updatedBook);
    expect(mocks.saveCover).toHaveBeenCalledWith(
      "book-1",
      "image/png",
      base64,
    );
  });

  it("devuelve 404 si el libro no existe al guardar una portada válida", async () => {
    const bytes = await image("jpeg");
    mocks.saveCover.mockRejectedValue(
      new ApiError(404, "NOT_FOUND", "Libro no encontrado."),
    );

    const response = await putCoverRoute(
      putRequest("image/jpeg", bytes.toString("base64")),
      context("missing"),
    );

    expect(response.status).toBe(404);
    expect((await response.json()).error.code).toBe("NOT_FOUND");
  });

  it("rechaza GIF, archivos truncados y content-type sin correspondencia", async () => {
    const png = await image("png");
    const truncated = png.subarray(0, Math.floor(png.length / 2));
    const truncatedResponse = await putCoverRoute(
      putRequest("image/png", truncated.toString("base64")),
      context(),
    );
    const gifResponse = await putCoverRoute(
      putRequest(
        "image/gif",
        Buffer.from("GIF89a").toString("base64"),
      ),
      context(),
    );

    expect(truncatedResponse.status).toBe(400);
    expect(gifResponse.status).toBe(400);
    expect(mocks.saveCover).not.toHaveBeenCalled();
  });

  it("rechaza una petición superior al límite antes de parsear el JSON", async () => {
    const response = await putCoverRoute(
      new Request("http://localhost/api/books/book-1/cover", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": "702000",
        },
        body: "{}",
      }),
      context(),
    );

    expect(response.status).toBe(413);
    expect((await response.json()).error.code).toBe("PAYLOAD_TOO_LARGE");
  });
});
