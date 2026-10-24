import Link from "next/link";

const highlights = [
  { number: "01", title: "Encuentra tu próxima lectura", text: "Explora el catálogo y descubre historias para cada momento." },
  { number: "02", title: "Solicita en unos pasos", text: "Pide tus libros favoritos y sigue el estado de cada solicitud." },
  { number: "03", title: "Lee sin prisa", text: "Consulta tus préstamos y fechas de devolución desde cualquier dispositivo." },
];

export default function HomePage() {
  return (
    <>
      <main>
        <section className="hero">
          <div className="hero-inner">
            <p className="eyebrow hero-eyebrow">Un lugar para cada historia</p>
            <h1>Abre un libro.<br /><span>Abre un mundo.</span></h1>
            <p className="hero-copy">Una biblioteca cercana, sencilla y hecha para que siempre encuentres algo que valga la pena leer.</p>
            <div className="hero-actions">
              <Link className="button" href="/register">Explorar la biblioteca <span aria-hidden="true">→</span></Link>
              <Link className="hero-secondary-link" href="/login">Ya tengo una cuenta</Link>
            </div>
            <div className="hero-note"><span className="hero-dot" /> Lecturas para cada curiosidad</div>
          </div>
          <div className="hero-art" aria-hidden="true">
            <div className="art-orbit orbit-one" />
            <div className="art-orbit orbit-two" />
            <div className="art-book art-book-back"><span>Ideas que<br />permanecen</span></div>
            <div className="art-book art-book-front"><span>Una historia<br />por descubrir</span><small>BIBLIOTECA · 2026</small></div>
            <span className="art-star star-one">✳</span><span className="art-star star-two">✦</span>
          </div>
        </section>
        <section className="home-highlights section-wrap">
          <div className="section-intro"><p className="eyebrow">Así de sencillo</p><h2>Leer más, buscar menos.</h2></div>
          <div className="highlight-grid">
            {highlights.map((item) => (
              <article className="highlight-card" key={item.number}>
                <span className="highlight-number">{item.number}</span>
                <h3>{item.title}</h3>
                <p>{item.text}</p>
              </article>
            ))}
          </div>
        </section>
        <section className="home-cta">
          <div><p className="eyebrow">Tu siguiente capítulo empieza aquí</p><h2>¿Qué te gustaría leer hoy?</h2></div>
          <Link className="button button-light" href="/register">Crear una cuenta <span aria-hidden="true">→</span></Link>
        </section>
      </main>
    </>
  );
}
