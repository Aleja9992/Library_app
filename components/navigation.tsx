import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { getWebUser } from "@/lib/web/session";
import { logoutAction } from "@/app/actions";

async function NavigationContent() {
  await connection();
  const user = await getWebUser();
  return (
    <header className="site-header">
      <div className="nav-wrap">
        <Link className="brand" href="/" aria-label="Biblioteca, inicio">
          <span className="brand-mark" aria-hidden="true">L</span>
          <span>Biblioteca<span className="brand-period">.</span></span>
        </Link>
        <nav className="main-nav" aria-label="Navegación principal">
          {user ? (
            <>
              <Link href="/books">Catálogo</Link>
              <Link href="/loans">
                {user.role === "librarian" ? "Gestión de préstamos" : "Mis préstamos"}
              </Link>
              <span className="nav-user">{user.name}</span>
              <form action={logoutAction}>
                <button className="nav-logout" type="submit">Cerrar sesión</button>
              </form>
            </>
          ) : (
            <>
              <Link href="/login">Iniciar sesión</Link>
              <Link className="button button-small" href="/register">Crear cuenta</Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}

export function Navigation() {
  return (
    <Suspense fallback={<header className="site-header nav-loading"><div className="nav-wrap"><Link className="brand" href="/">Biblioteca<span className="brand-period">.</span></Link></div></header>}>
      <NavigationContent />
    </Suspense>
  );
}

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="footer-inner">
        <Link className="brand" href="/"><span className="brand-mark" aria-hidden="true">L</span><span>Biblioteca<span className="brand-period">.</span></span></Link>
        <p>Un buen libro abre nuevos caminos.</p>
      </div>
    </footer>
  );
}
