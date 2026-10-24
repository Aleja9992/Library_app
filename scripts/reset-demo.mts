import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";

const required = (name: string): string => {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Falta ${name}; no se modificó ningún dato.`);
  }
  return value;
};

const projectId = required("FIREBASE_PROJECT_ID");
const demoProjectId = required("FIREBASE_DEMO_PROJECT_ID");

if (
  projectId !== demoProjectId ||
  /(^|[-_])(prod|production|live)([-_]|$)/i.test(projectId) ||
  process.env.NODE_ENV === "production"
) {
  throw new Error(
    "Reset cancelado: el proyecto debe coincidir con FIREBASE_DEMO_PROJECT_ID y no puede ser de producción.",
  );
}
if (!stdin.isTTY || !stdout.isTTY) {
  throw new Error(
    "Reset cancelado: se requiere una terminal interactiva para confirmar la operación.",
  );
}

const readline = createInterface({ input: stdin, output: stdout });
try {
  console.error(
    `PELIGRO: el reset eliminará TODOS los préstamos, bloqueos de préstamos y portadas de Firebase "${projectId}", y restaurará el inventario de todos los libros. No modificará usuarios. Esta operación es destructiva.`,
  );
  const confirmation = await readline.question(
    `Escribe el ID del proyecto (${projectId}) para continuar: `,
  );
  if (confirmation.trim() !== projectId) {
    throw new Error("Confirmación incorrecta; no se modificó ningún dato.");
  }
  const destructiveConfirmation = await readline.question(
    'Escribe "RESET DEMO DATA" para borrar los datos: ',
  );
  if (destructiveConfirmation.trim() !== "RESET DEMO DATA") {
    throw new Error("Confirmación incorrecta; no se modificó ningún dato.");
  }
} finally {
  readline.close();
}

const { firestore } = await import("./admin.mts");
const database = firestore;
const booksSnapshot = await database.collection("books").get();
for (const book of booksSnapshot.docs) {
  const totalCopies = book.data().totalCopies;
  if (
    typeof totalCopies !== "number" ||
    !Number.isInteger(totalCopies) ||
    totalCopies < 0
  ) {
    throw new Error(
      `Reset cancelado: el libro ${book.id} tiene totalCopies inválido; no se inició el borrado.`,
    );
  }
}

async function deleteCollection(collectionName: string): Promise<number> {
  const collection = database.collection(collectionName);
  let processed = 0;
  let lastDocument: FirebaseFirestore.QueryDocumentSnapshot | undefined;

  while (true) {
    let query = collection.orderBy("__name__").limit(400);
    if (lastDocument) {
      query = query.startAfter(lastDocument);
    }
    const snapshot = await query.get();
    if (snapshot.empty) break;

    const batch = database.batch();
    for (const document of snapshot.docs) {
      batch.delete(document.ref);
    }
    await batch.commit();
    processed += snapshot.size;
    lastDocument = snapshot.docs[snapshot.docs.length - 1];
  }

  return processed;
}

async function resetBooks(): Promise<number> {
  let processed = 0;
  for (let index = 0; index < booksSnapshot.docs.length; index += 400) {
    const documents = booksSnapshot.docs.slice(index, index + 400);
    const batch = database.batch();
    const updatedAt = new Date().toISOString();
    for (const document of documents) {
      batch.update(document.ref, {
        availableCopies: document.data().totalCopies,
        coverVersion: 0,
        updatedAt,
      });
    }
    await batch.commit();
    processed += documents.length;
  }
  return processed;
}

const processed = { loans: 0, locks: 0, covers: 0, books: 0 };
try {
  processed.loans = await deleteCollection("loans");
  processed.locks = await deleteCollection("loanLocks");
  processed.covers = await deleteCollection("bookCovers");
  processed.books = await resetBooks();
  console.log("Reset de demostración completado.");
} finally {
  console.log(`Préstamos eliminados: ${processed.loans}`);
  console.log(`Bloqueos de préstamo eliminados: ${processed.locks}`);
  console.log(`Portadas eliminadas: ${processed.covers}`);
  console.log(`Libros restaurados: ${processed.books}`);
  console.log("Usuarios de Firebase Auth y users/{uid} no fueron modificados.");
}
