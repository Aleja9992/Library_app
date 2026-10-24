import { randomUUID } from "node:crypto";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { CoverUploadForm, RequestLoanForm } from "@/components/forms";
import { BookCover } from "@/components/ui";
import { getWebBook } from "@/lib/web/data";
import { getWebUser } from "@/lib/web/session";
import { ApiError } from "@/lib/errors";

async function BookDetails({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const bookPromise = getWebBook(id).catch((error: unknown) => {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  });
  const [book, user] = await Promise.all([bookPromise, getWebUser()]);

  return (
    <main className="content-wrap book-detail-page">
      <Link className="back-link" href="/books">← Volver al catálogo</Link>
      <section className="book-detail">
        <div className="detail-cover-wrap"><BookCover className="detail-cover" book={book} /></div>
        <div className="detail-copy">
          <p className="eyebrow">{book.category} <span>·</span> {book.year}</p>
          <h1>{book.title}</h1>
          <p className="detail-author">por {book.author}</p>
          <p className="detail-description">{book.description}</p>
          <div className={`detail-availability ${book.availableCopies > 0 ? "available" : "unavailable"}`}>
            <span className="availability-dot" />
            {book.availableCopies > 0
              ? `${book.availableCopies} de ${book.totalCopies} ejemplares disponibles`
              : "No hay ejemplares disponibles"}
          </div>
          {user?.role === "student" && book.availableCopies > 0 ? <RequestLoanForm bookId={book.id} clientRequestId={randomUUID()} /> : null}
          {user?.role === "student" && book.availableCopies === 0 ? <p className="detail-note">Puedes volver a consultar cuando haya ejemplares disponibles.</p> : null}
          {user?.role === "librarian" ? (
            <div className="librarian-tools">
              <Link className="text-link" href="/loans">Gestionar préstamos <span aria-hidden="true">→</span></Link>
              <CoverUploadForm bookId={book.id} />
            </div>
          ) : null}
          <dl className="book-facts">
            <div><dt>Disponibilidad</dt><dd>{book.availableCopies} / {book.totalCopies}</dd></div>
            <div><dt>Publicado</dt><dd>{book.year}</dd></div>
            <div><dt>Categoría</dt><dd>{book.category}</dd></div>
          </dl>
        </div>
      </section>
    </main>
  );
}

export default async function BookPage({ params }: PageProps<"/books/[id]">) {
  return (
    <Suspense fallback={<main className="content-wrap"><div className="page-loading">Cargando libro…</div></main>}>
      <BookDetails params={params} />
    </Suspense>
  );
}
