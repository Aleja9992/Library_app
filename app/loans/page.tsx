import Link from "next/link";
import { Suspense } from "react";
import { LoanFilters } from "@/components/loan-filters";
import { LoanCard, EmptyState, PageHeader } from "@/components/ui";
import { LoanTransitionForm } from "@/components/forms";
import { getWebLoans } from "@/lib/web/data";
import { getWebUser } from "@/lib/web/session";
import { loanQuerySchema } from "@/lib/schemas";

type LoanSearchParams = Promise<Record<string, string | string[] | undefined>>;

async function LoansContent({ searchParams }: { searchParams: LoanSearchParams }) {
  const params = await searchParams;
  const parsed = loanQuerySchema.safeParse({
    status: typeof params.status === "string" ? params.status : undefined,
  });
  const status = parsed.success ? parsed.data.status : undefined;
  const [loans, user] = await Promise.all([getWebLoans(status), getWebUser()]);
  const librarian = user?.role === "librarian";

  return (
    <main className="content-wrap">
      <PageHeader
        eyebrow={librarian ? "Administración" : "Tu espacio de lectura"}
        title={librarian ? "Gestión de préstamos" : "Mis préstamos"}
        description={librarian ? "Revisa solicitudes y gestiona las devoluciones." : "Consulta el estado de tus solicitudes y tus fechas de devolución."}
        action={librarian ? <LoanFilters status={status} /> : undefined}
      />
      {librarian ? <div className="loan-filter-mobile"><LoanFilters status={status} /></div> : null}
      {loans.length ? (
        <div className="loan-list">
          {loans.map((loan) => {
            const actions = librarian
              ? loan.status === "requested"
                ? ["approve", "reject"]
                : loan.status === "approved"
                  ? ["return"]
                  : []
              : [];
            return (
              <LoanCard
                actions={actions.length ? <LoanTransitionForm actions={actions} loanId={loan.id} /> : null}
                key={loan.id}
                librarian={librarian}
                loan={loan}
              />
            );
          })}
        </div>
      ) : (
        <EmptyState
          title={status ? "No hay préstamos en este estado" : "Aún no hay préstamos"}
          description={librarian ? "Las solicitudes nuevas aparecerán aquí." : "Cuando solicites un libro, podrás seguir su estado desde esta página."}
          href={librarian ? undefined : "/books"}
          linkText={librarian ? undefined : "Explorar el catálogo"}
        />
      )}
      {!librarian ? <p className="loans-catalog-link"><Link className="text-link" href="/books">Explorar catálogo <span aria-hidden="true">→</span></Link></p> : null}
    </main>
  );
}

export default function LoansPage({ searchParams }: PageProps<"/loans">) {
  return (
    <Suspense fallback={<main className="content-wrap"><div className="page-loading">Cargando préstamos…</div></main>}>
      <LoansContent searchParams={searchParams} />
    </Suspense>
  );
}
