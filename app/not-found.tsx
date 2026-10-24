import Link from "next/link";

export default function NotFound() {
  return (
    <main className="content-wrap not-found-page">
      <p className="eyebrow">Página no encontrada</p>
      <h1>Este libro no está en el catálogo.</h1>
      <p>Comprueba el enlace o vuelve a explorar nuestra colección.</p>
      <Link className="button" href="/books">Volver al catálogo</Link>
    </main>
  );
}
