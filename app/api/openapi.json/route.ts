import { buildOpenApiSpec } from "@/lib/openapi";

export function GET(): Response {
  return Response.json(buildOpenApiSpec(), {
    headers: { "Cache-Control": "public, max-age=300, stale-while-revalidate=600" },
  });
}
