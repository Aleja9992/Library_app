import { getCover, saveCover } from "@/lib/data/books";
import { assertRole, requireUser } from "@/lib/guard";
import { ApiError } from "@/lib/errors";
import { route } from "@/lib/http";
import { coverSchema, MAX_COVER_BASE64_LENGTH } from "@/lib/schemas";
import { validateCoverImage } from "@/lib/services/covers";

const MAX_COVER_REQUEST_BYTES = MAX_COVER_BASE64_LENGTH + 1_024;

export const GET = route(
  async (request, context: RouteContext<"/api/books/[id]/cover">) => {
    const { id } = await context.params;
    const cover = await getCover(id);
    const requestedVersion = new URL(request.url).searchParams.get("v");
    const isCurrentVersion =
      requestedVersion !== null &&
      /^\d+$/.test(requestedVersion) &&
      Number(requestedVersion) === cover.version;

    return new Response(new Uint8Array(cover.bytes), {
      headers: {
        "Content-Type": cover.contentType,
        "Content-Length": String(cover.bytes.byteLength),
        "Cache-Control": isCurrentVersion
          ? "public, max-age=31536000, immutable"
          : "no-cache",
        "X-Content-Type-Options": "nosniff",
      },
    });
  },
);

export const PUT = route(
  async (request, context: RouteContext<"/api/books/[id]/cover">) => {
    const user = await requireUser(request);
    assertRole(user, "librarian");

    const contentLength = request.headers.get("content-length");
    if (
      contentLength &&
      (!/^\d+$/.test(contentLength) ||
        Number(contentLength) > MAX_COVER_REQUEST_BYTES)
    ) {
      throw new ApiError(
        413,
        "PAYLOAD_TOO_LARGE",
        "La portada supera el tamaño máximo permitido.",
      );
    }

    const body = await readLimitedJson(request);
    const { contentType, data } = coverSchema.parse(body);
    await validateCoverImage(contentType, data);
    const { id } = await context.params;
    const book = await saveCover(id, contentType, data);
    return Response.json({ book });
  },
);

async function readLimitedJson(request: Request): Promise<unknown> {
  if (!request.body) {
    throw new ApiError(400, "VALIDATION_ERROR", "El cuerpo debe ser JSON válido.");
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > MAX_COVER_REQUEST_BYTES) {
        await reader.cancel();
        throw new ApiError(
          413,
          "PAYLOAD_TOO_LARGE",
          "La portada supera el tamaño máximo permitido.",
        );
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new ApiError(400, "VALIDATION_ERROR", "El cuerpo debe ser JSON válido.");
  }
}
