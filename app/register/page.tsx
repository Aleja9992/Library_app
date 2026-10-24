import Link from "next/link";
import { Suspense } from "react";
import { RegisterForm } from "@/components/forms";

function RegisterContent() {
  return (
    <main className="auth-page">
      <section className="auth-card">
        <div className="auth-emblem" aria-hidden="true">L</div>
        <p className="eyebrow">Tu próxima lectura te espera</p>
        <h1>Crea tu cuenta</h1>
        <p className="auth-intro">Únete a la comunidad de lectores de nuestra biblioteca.</p>
        <RegisterForm />
        <p className="auth-switch">¿Ya tienes una cuenta? <Link href="/login">Inicia sesión</Link></p>
      </section>
      <aside className="auth-aside register-aside">
        <span className="aside-quote-mark" aria-hidden="true">“</span>
        <blockquote>Leer es soñar con los ojos abiertos.</blockquote>
        <p>Un mundo nuevo en cada página.</p>
        <div className="aside-decoration" aria-hidden="true">✳</div>
      </aside>
    </main>
  );
}

export default function RegisterPage() {
  return (
    <>
      <Suspense fallback={<div className="page-loading">Preparando registro…</div>}>
        <RegisterContent />
      </Suspense>
    </>
  );
}
