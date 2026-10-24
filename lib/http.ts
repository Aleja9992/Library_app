import { unstable_rethrow } from "next/navigation";
import { ZodError, type ZodType } from "zod";
import { ApiError } from "@/lib/errors";

type Handler<Context> = (
  request: Request,
  context: Context,
) => Promise<Response>;

export function errorResponse(error: unknown): Response {
  if (error instanceof ApiError) {
    const body = {
      error: {
        code: error.code,
        message: error.message,
        ...(error.details === undefined ? {} : { details: error.details }),
      },
    };

    return Response.json(body, { status: error.status });
  }

  if (error instanceof ZodError) {
    return Response.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: error.issues[0]?.message ?? "Los datos enviados no son válidos.",
          details: error.issues.map((issue) => ({
            path: issue.path.join("."),
            message: issue.message,
          })),
        },
      },
      { status: 400 },
    );
  }

  console.error("[api] error no controlado:", error);
  return Response.json(
    {
      error: {
        code: "INTERNAL_ERROR",
        message: "Error interno del servidor.",
      },
    },
    { status: 500 },
  );
}

export function route<Context = unknown>(
  handler: Handler<Context>,
): Handler<Context> {
  return async (request, context) => {
    try {
      return await handler(request, context);
    } catch (error) {
      unstable_rethrow(error);
      return errorResponse(error);
    }
  };
}

export async function parseBody<Output>(
  request: Request,
  schema: ZodType<Output>,
): Promise<Output> {
  let raw: unknown;

  try {
    raw = await request.json();
  } catch (error) {
    unstable_rethrow(error);
    throw new ApiError(400, "VALIDATION_ERROR", "El cuerpo debe ser JSON válido.");
  }

  return schema.parse(raw);
}

export function parseQuery<Output>(
  request: Request,
  schema: ZodType<Output>,
): Output {
  const query = Object.fromEntries(new URL(request.url).searchParams);
  return schema.parse(query);
}
