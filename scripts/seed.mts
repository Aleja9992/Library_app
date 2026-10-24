const requiredEnvironment = [
  "FIREBASE_PROJECT_ID",
  "FIREBASE_CLIENT_EMAIL",
  "FIREBASE_PRIVATE_KEY",
] as const;

for (const name of requiredEnvironment) {
  if (!process.env[name]?.trim()) {
    console.error(`Falta ${name}. Completa .env a partir de .env.example.`);
    process.exit(1);
  }
}

const { firestore } = await import("./admin.mts");
const reset = process.argv.includes("--reset");

interface SeedBook {
  id: string;
  title: string;
  author: string;
  category: string;
  year: number;
  description: string;
  totalCopies: number;
}

const books: SeedBook[] = [
  {
    id: "cien-anos-de-soledad",
    title: "Cien años de soledad",
    author: "Gabriel García Márquez",
    category: "Novela",
    year: 1967,
    description:
      "La historia de la familia Buendía a lo largo de siete generaciones en el pueblo ficticio de Macondo.",
    totalCopies: 3,
  },
  {
    id: "don-quijote",
    title: "Don Quijote de la Mancha",
    author: "Miguel de Cervantes",
    category: "Clásicos",
    year: 1605,
    description:
      "Un hidalgo enloquecido por los libros de caballerías sale a recorrer La Mancha junto a su escudero Sancho Panza.",
    totalCopies: 2,
  },
  {
    id: "amor-en-los-tiempos-del-colera",
    title: "El amor en los tiempos del cólera",
    author: "Gabriel García Márquez",
    category: "Novela",
    year: 1985,
    description:
      "Una historia de amor que espera más de cincuenta años en una ciudad del Caribe.",
    totalCopies: 2,
  },
  {
    id: "rayuela",
    title: "Rayuela",
    author: "Julio Cortázar",
    category: "Novela",
    year: 1963,
    description:
      "Novela que puede leerse en más de un orden, entre París y Buenos Aires.",
    totalCopies: 1,
  },
  {
    id: "pedro-paramo",
    title: "Pedro Páramo",
    author: "Juan Rulfo",
    category: "Novela",
    year: 1955,
    description:
      "Juan Preciado llega a Comala en busca de su padre y encuentra un pueblo poblado por voces de muertos.",
    totalCopies: 2,
  },
  {
    id: "la-ciudad-y-los-perros",
    title: "La ciudad y los perros",
    author: "Mario Vargas Llosa",
    category: "Novela",
    year: 1963,
    description: "La vida de un grupo de cadetes en un colegio militar de Lima.",
    totalCopies: 1,
  },
  {
    id: "clean-code",
    title: "Clean Code",
    author: "Robert C. Martin",
    category: "Tecnología",
    year: 2008,
    description:
      "Principios y prácticas para escribir código legible, mantenible y fácil de cambiar.",
    totalCopies: 3,
  },
  {
    id: "introduction-to-algorithms",
    title: "Introduction to Algorithms",
    author: "Cormen, Leiserson, Rivest y Stein",
    category: "Tecnología",
    year: 1990,
    description:
      "Referencia clásica de algoritmos y estructuras de datos con análisis de complejidad.",
    totalCopies: 2,
  },
  {
    id: "pragmatic-programmer",
    title: "The Pragmatic Programmer",
    author: "Andrew Hunt y David Thomas",
    category: "Tecnología",
    year: 1999,
    description:
      "Consejos prácticos para el oficio de desarrollar software a lo largo de una carrera.",
    totalCopies: 2,
  },
  {
    id: "dont-make-me-think",
    title: "Don't Make Me Think",
    author: "Steve Krug",
    category: "Diseño",
    year: 2000,
    description:
      "Una guía breve sobre usabilidad para que las interfaces se entiendan sin esfuerzo.",
    totalCopies: 2,
  },
];

const batch = firestore.batch();
let writes = 0;

for (const { id, ...book } of books) {
  const reference = firestore.collection("books").doc(id);
  const snapshot = await reference.get();

  // Sin --reset, se preserva cualquier inventario ya existente en Firestore.
  if (snapshot.exists && !reset) {
    console.log(`= libro existente: ${book.title}`);
    continue;
  }

  batch.set(reference, {
    ...book,
    availableCopies: book.totalCopies,
    coverVersion: 0,
    updatedAt: new Date().toISOString(),
  });
  writes += 1;
  console.log(`${snapshot.exists ? "~ libro actualizado:" : "+ libro:"} ${book.title}`);
}

if (writes > 0) {
  await batch.commit();
}

console.log(`\nSeed finalizado: ${writes} libros escritos.`);
