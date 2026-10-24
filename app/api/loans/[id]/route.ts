import { getLoan, transitionLoan } from "@/lib/data/loans";
import { assertRole, requireUser } from "@/lib/guard";
import { parseBody, route } from "@/lib/http";
import { loanActionSchema } from "@/lib/schemas";

export const GET = route(
  async (request, context: RouteContext<"/api/loans/[id]">) => {
    const user = await requireUser(request);
    const { id } = await context.params;
    return Response.json({ loan: await getLoan(id, user) });
  },
);

export const PATCH = route(
  async (request, context: RouteContext<"/api/loans/[id]">) => {
    const user = await requireUser(request);
    assertRole(user, "librarian");
    const { action } = await parseBody(request, loanActionSchema);
    const { id } = await context.params;
    return Response.json({ loan: await transitionLoan(id, action) });
  },
);
