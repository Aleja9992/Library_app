"use client";

export default function ErrorPage({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="content-wrap error-page">
      <p className="eyebrow">Algo no salió como esperábamos</p>
      <h1>No pudimos cargar esta página</h1>
      <p>Puede que haya un problema temporal de conexión. Inténtalo de nuevo.</p>
      <button className="button" onClick={() => reset()} type="button">
        Reintentar
      </button>
    </main>
  );
}
