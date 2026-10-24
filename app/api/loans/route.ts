import { listLoans, requestLoan } from "@/lib/data/loans";
import { assertRole, requireUser } from "@/lib/guard";
import { parseBody, parseQuery, route } from "@/lib/http";
import { createLoanSchema, loanQuerySchema } from "@/lib/schemas";

export const GET = route(async (request) => {
  const user = await requireUser(request);
  const { status } = parseQuery(request, loanQuerySchema);
  const serverTime = new Date().toISOString();
  const loans = await listLoans(user, status);
  return Response.json({ loans, serverTime });
});

export const POST = route(async (request) => {
  const user = await requireUser(request);
  assertRole(user, "student");
  const { bookId, clientRequestId } = await parseBody(
    request,
    createLoanSchema,
  );
  const result = await requestLoan(user, bookId, clientRequestId);
  return Response.json(result, { status: result.created ? 201 : 200 });
});
