import Link from "next/link";
import Image from "next/image";
import type { Book, Loan, LoanStatus } from "@/lib/types";

export function PageHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="page-header">
      <div>
        {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
        <h1>{title}</h1>
        {description ? <p className="page-description">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function Notice({
  children,
  tone = "error",
}: {
  children: React.ReactNode;
  tone?: "error" | "success" | "info";
}) {
  return (
    <div className={`notice notice-${tone}`} role={tone === "error" ? "alert" : "status"}>
      {children}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  href,
  linkText,
}: {
  title: string;
  description: string;
  href?: string;
  linkText?: string;
}) {
  return (
    <div className="empty-state">
      <span className="empty-icon" aria-hidden="true">✦</span>
      <h2>{title}</h2>
      <p>{description}</p>
      {href && linkText ? <Link className="button button-secondary" href={href}>{linkText}</Link> : null}
    </div>
  );
}

export function BookCard({ book }: { book: Book }) {
  return (
    <article className="book-card">
      <Link className="book-cover-link" href={`/books/${book.id}`} aria-label={`Ver ${book.title}`}>
        <BookCover book={book} className="book-card-cover" />
      </Link>
      <div className="book-card-body">
        <span className="category-label">{book.category}</span>
        <h2><Link href={`/books/${book.id}`}>{book.title}</Link></h2>
        <p className="book-author">{book.author}</p>
        <div className="book-card-footer">
          <span className={book.availableCopies > 0 ? "availability available" : "availability unavailable"}>
            {book.availableCopies > 0 ? `${book.availableCopies} disponibles` : "No disponible"}
          </span>
          <Link className="text-link" href={`/books/${book.id}`}>Ver libro <span aria-hidden="true">→</span></Link>
        </div>
      </div>
    </article>
  );
}

export function BookCover({
  book,
  className = "",
}: {
  book: Book;
  className?: string;
}) {
  return book.coverUrl ? (
    <Image
      className={className}
      src={book.coverUrl}
      alt={`Portada de ${book.title}`}
      width={400}
      height={560}
      unoptimized
    />
  ) : (
    <div className={`cover-placeholder ${className}`} aria-label={`Sin portada para ${book.title}`}>
      <span aria-hidden="true">L</span>
      <small>Biblioteca</small>
    </div>
  );
}

const loanStatusLabels: Record<LoanStatus, string> = {
  requested: "Pendiente",
  approved: "Aprobado",
  rejected: "Rechazado",
  returned: "Devuelto",
};

export function LoanStatusBadge({ status }: { status: LoanStatus }) {
  return <span className={`status-badge status-${status}`}>{loanStatusLabels[status]}</span>;
}

export function LoanCard({
  loan,
  librarian = false,
  actions,
}: {
  loan: Loan;
  librarian?: boolean;
  actions?: React.ReactNode;
}) {
  return (
    <article className="loan-card">
      <div className="loan-card-main">
        <div>
          <span className="category-label">Solicitud {loan.id.slice(0, 8)}</span>
          <h2><Link href={`/books/${loan.bookId}`}>{loan.bookTitle}</Link></h2>
          <p className="book-author">
            {librarian ? `${loan.userName} · ${loan.userEmail} · ` : ""}
            Solicitado el {formatDate(loan.requestedAt)}
          </p>
          {loan.dueDate ? <p className="loan-date">Fecha límite: {formatDate(loan.dueDate)}</p> : null}
        </div>
        <LoanStatusBadge status={loan.status} />
      </div>
      {actions}
    </article>
  );
}

export function formatDate(value: string): string {
  return new Intl.DateTimeFormat("es", { dateStyle: "medium" }).format(new Date(value));
}
