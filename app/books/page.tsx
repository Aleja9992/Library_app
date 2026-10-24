import { Suspense } from "react";
import { BookCard, EmptyState, Notice, PageHeader } from "@/components/ui";
import { getWebBooks, getWebCategories } from "@/lib/web/data";
import { bookQuerySchema } from "@/lib/schemas";

type BooksSearchParams = Promise<Record<string, string | string[] | undefined>>;

async function BooksContent({ searchParams }: { searchParams: BooksSearchParams }) {
  const params = await searchParams;
  const query = bookQuerySchema.safeParse({
    q: typeof params.q === "string" ? params.q : undefined,
    category: typeof params.category === "string" ? params.category : undefined,
  });
  const filter = query.success ? query.data : {};
  const [books, categories] = await Promise.all([
    getWebBooks(filter),
    getWebCategories(),
  ]);

  return (
    <main className="content-wrap">
      <PageHeader
        eyebrow="Encuentra tu próxima lectura"
        title="El catálogo"
        description="Explora nuestra colección y encuentra ese libro que estabas buscando."
      />
      {params.error === "forbidden" ? (
        <div className="page-alert"><Notice>Tu cuenta no tiene permisos para esa sección.</Notice></div>
      ) : null}
      <form className="catalog-filters" action="/books" method="get">
        <label className="search-field">
          <span className="sr-only">Buscar por título o autor</span>
          <span className="search-icon" aria-hidden="true">⌕</span>
          <input defaultValue={filter.q} name="q" placeholder="Buscar por título o autor…" />
        </label>
        <label className="category-filter">
          <span className="sr-only">Filtrar por categoría</span>
          <select defaultValue={filter.category ?? ""} name="category">
            <option value="">Todas las categorías</option>
            {categories.map((category) => <option key={category} value={category}>{category}</option>)}
          </select>
        </label>
        <button className="button button-secondary" type="submit">Buscar</button>
      </form>
      <div className="catalog-meta"><span>{books.length} {books.length === 1 ? "libro" : "libros"}</span>{filter.category ? <span className="active-filter">{filter.category}</span> : null}</div>
      {books.length ? (
        <div className="book-grid">{books.map((book) => <BookCard book={book} key={book.id} />)}</div>
      ) : (
        <EmptyState title="No encontramos libros" description="Prueba con otra búsqueda o cambia la categoría seleccionada." />
      )}
    </main>
  );
}

export default function BooksPage({ searchParams }: PageProps<"/books">) {
  return (
    <Suspense fallback={<main className="content-wrap"><div className="page-loading">Cargando catálogo…</div></main>}>
      <BooksContent searchParams={searchParams} />
    </Suspense>
  );
}
