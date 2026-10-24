import Link from "next/link";
import { Suspense } from "react";
import { LoginForm } from "@/components/forms";
import { Notice } from "@/components/ui";

async function LoginContent({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const expired = params.expired === "1";
  return (
    <main className="auth-page">
      <section className="auth-card">
        <div className="auth-emblem" aria-hidden="true">L</div>
        <p className="eyebrow">Qué bueno tenerte de vuelta</p>
        <h1>Inicia sesión</h1>
        <p className="auth-intro">Continúa donde dejaste tu última lectura.</p>
        {expired ? <Notice tone="info">Tu sesión ha caducado. Inicia sesión de nuevo para continuar.</Notice> : null}
        <LoginForm />
        <p className="auth-switch">¿Aún no tienes cuenta? <Link href="/register">Regístrate gratis</Link></p>
      </section>
      <aside className="auth-aside">
        <span className="aside-quote-mark" aria-hidden="true">“</span>
        <blockquote>Un libro es un sueño que tienes en tus manos.</blockquote>
        <p>— Neil Gaiman</p>
        <div className="aside-decoration" aria-hidden="true">✳</div>
      </aside>
    </main>
  );
}

export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    <>
      <Suspense fallback={<div className="page-loading">Preparando inicio de sesión…</div>}>
        <LoginContent searchParams={searchParams} />
      </Suspense>
    </>
  );
}
