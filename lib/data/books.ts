import "server-only";
import { ApiError } from "@/lib/errors";
import { db } from "@/lib/firebase";
import type { Book } from "@/lib/types";

export const BOOKS = "books";
export const COVERS = "bookCovers";

type BookDocument = Omit<Book, "id" | "coverUrl"> & {
  coverVersion?: number;
};

export interface BookFilter {
  q?: string;
  category?: string;
  updatedSince?: string;
}

export interface BookCover {
  contentType: string;
  bytes: Buffer;
  version: number;
}

export type CoverContentType = "image/jpeg" | "image/png" | "image/webp";

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("es");
}

export function toBook(id: string, data: BookDocument): Book {
  const { coverVersion = 0, ...book } = data;
  return {
    id,
    ...book,
    coverUrl:
      coverVersion > 0 ? `/api/books/${id}/cover?v=${coverVersion}` : null,
  };
}

export async function listBooks(filter: BookFilter = {}): Promise<Book[]> {
  const booksCollection = db().collection(BOOKS);
  const snapshot = filter.updatedSince
    ? await booksCollection
        .where("updatedAt", ">", filter.updatedSince)
        .get()
    : await booksCollection.get();
  let books = snapshot.docs.map((document) =>
    toBook(document.id, document.data() as BookDocument),
  );

  if (filter.category) {
    books = books.filter((book) => book.category === filter.category);
  }

  if (filter.q) {
    const query = normalize(filter.q);
    books = books.filter((book) =>
      normalize(`${book.title} ${book.author}`).includes(query),
    );
  }

  return books.sort((left, right) =>
    left.title.localeCompare(right.title, "es"),
  );
}

export async function getBook(id: string): Promise<Book> {
  const snapshot = await db().collection(BOOKS).doc(id).get();
  if (!snapshot.exists) {
    throw new ApiError(404, "NOT_FOUND", "Libro no encontrado.");
  }

  return toBook(snapshot.id, snapshot.data() as BookDocument);
}

export async function listCategories(): Promise<string[]> {
  const books = await listBooks();
  return [...new Set(books.map((book) => book.category))].sort((left, right) =>
    left.localeCompare(right, "es"),
  );
}

export async function saveCover(
  bookId: string,
  contentType: CoverContentType,
  data: string,
): Promise<Book> {
  const firestore = db();
  const bookReference = firestore.collection(BOOKS).doc(bookId);
  const coverReference = firestore.collection(COVERS).doc(bookId);

  await firestore.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(bookReference);
    if (!snapshot.exists) {
      throw new ApiError(404, "NOT_FOUND", "Libro no encontrado.");
    }

    const current = snapshot.data() as BookDocument;
    const previousUpdate = Date.parse(current.updatedAt);
    const updatedAt = new Date(
      Math.max(
        Date.now() + 1,
        Number.isFinite(previousUpdate) ? previousUpdate + 1 : 0,
      ),
    ).toISOString();
    transaction.set(coverReference, { contentType, data, updatedAt });
    // La versión y updatedAt notifican a los clientes que deben renovar la portada.
    transaction.update(bookReference, {
      coverVersion: (current.coverVersion ?? 0) + 1,
      updatedAt,
    });
  });

  return getBook(bookId);
}

export async function getCover(bookId: string): Promise<BookCover> {
  const firestore = db();
  const bookReference = firestore.collection(BOOKS).doc(bookId);
  const coverReference = firestore.collection(COVERS).doc(bookId);
  return firestore.runTransaction(async (transaction) => {
    const [bookSnapshot, coverSnapshot] = await Promise.all([
      transaction.get(bookReference),
      transaction.get(coverReference),
    ]);

    if (!bookSnapshot.exists || !coverSnapshot.exists) {
      throw new ApiError(404, "NOT_FOUND", "Portada no encontrada.");
    }

    const book = bookSnapshot.data() as BookDocument;
    const cover = coverSnapshot.data() as {
      contentType: CoverContentType;
      data: string;
    };
    return {
      contentType: cover.contentType,
      bytes: Buffer.from(cover.data, "base64"),
      version: book.coverVersion ?? 0,
    };
  });
}
