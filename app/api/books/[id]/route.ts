import { getBook } from "@/lib/data/books";
import { requireUser } from "@/lib/guard";
import { route } from "@/lib/http";

export const GET = route(
  async (request, context: RouteContext<"/api/books/[id]">) => {
    await requireUser(request);
    const { id } = await context.params;
    return Response.json({ book: await getBook(id) });
  },
);
