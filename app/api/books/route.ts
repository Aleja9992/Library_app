import { listBooks, listCategories } from "@/lib/data/books";
import { requireUser } from "@/lib/guard";
import { parseQuery, route } from "@/lib/http";
import { bookQuerySchema } from "@/lib/schemas";

export const GET = route(async (request) => {
  await requireUser(request);
  const filter = parseQuery(request, bookQuerySchema);
  const serverTime = new Date().toISOString();
  const [books, categories] = await Promise.all([
    listBooks(filter),
    listCategories(),
  ]);

  return Response.json({ books, categories, serverTime });
});
