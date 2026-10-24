import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { ApiError } from "@/lib/errors";
import { errorResponse, parseBody, parseQuery, route } from "@/lib/http";

describe("route() y respuestas de error", () => {
  it("convierte ApiError a JSON uniforme y conserva su estado", async () => {
    const handler = route(async () => {
      throw new ApiError(409, "NO_COPIES", "Sin ejemplares", { bookId: "x" });
    });
    const response = await handler(new Request("http://localhost/api"), undefined);

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: {
        code: "NO_COPIES",
        message: "Sin ejemplares",
        details: { bookId: "x" },
      },
    });
  });

  it("convierte ZodError y cuerpos JSON inválidos a 400", async () => {
    const handler = route(async (request) => {
      await parseBody(request, z.object({ count: z.number() }));
      return Response.json({ ok: true });
    });
    const response = await handler(
      new Request("http://localhost/api", {
        method: "POST",
        body: JSON.stringify({ count: "uno" }),
      }),
      undefined,
    );
    const invalidJson = await handler(
      new Request("http://localhost/api", {
        method: "POST",
        body: "no-json",
      }),
      undefined,
    );

    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("VALIDATION_ERROR");
    expect(invalidJson.status).toBe(400);
    expect((await invalidJson.json()).error.code).toBe("VALIDATION_ERROR");
  });

  it("valida query params y no expone errores internos", async () => {
    const query = parseQuery(
      new Request("http://localhost/api?count=2"),
      z.object({ count: z.string() }),
    );
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    try {
      const response = errorResponse(new Error("secreto interno"));
      const body = await response.text();

      expect(query.count).toBe("2");
      expect(response.status).toBe(500);
      expect(body).not.toContain("secreto interno");
      expect(body).toContain("INTERNAL_ERROR");
    } finally {
      spy.mockRestore();
    }
  });
});
