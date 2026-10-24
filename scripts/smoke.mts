import { randomBytes, randomUUID } from "node:crypto";
import sharp from "sharp";

const projectId = process.env.FIREBASE_PROJECT_ID?.trim();
const testProjectId = process.env.FIREBASE_TEST_PROJECT_ID?.trim();
const webApiKey = process.env.FIREBASE_WEB_API_KEY?.trim();
const baseUrl = (process.env.BASE_URL?.trim() || "http://localhost:3000").replace(
  /\/+$/,
  "",
);

if (!projectId || !testProjectId || projectId !== testProjectId) {
  throw new Error(
    "Smoke cancelado: configura FIREBASE_TEST_PROJECT_ID igual a FIREBASE_PROJECT_ID para identificar explícitamente un proyecto de pruebas.",
  );
}
if (/(^|[-_])(prod|production|live)([-_]|$)/i.test(projectId)) {
  throw new Error("Smoke cancelado: no se permiten proyectos de producción.");
}
if (!webApiKey) {
  throw new Error("Smoke cancelado: falta FIREBASE_WEB_API_KEY.");
}

const parsedBaseUrl = new URL(baseUrl);
const isLoopback =
  parsedBaseUrl.hostname === "localhost" ||
  parsedBaseUrl.hostname === "127.0.0.1" ||
  parsedBaseUrl.hostname === "::1";
if (
  !isLoopback &&
  process.env.LIBRARY_SMOKE_ALLOW_REMOTE !==
    "I_UNDERSTAND_THIS_WRITES_TEST_DATA"
) {
  throw new Error(
    "Smoke cancelado: BASE_URL no es local. Para un servidor de pruebas remoto configura LIBRARY_SMOKE_ALLOW_REMOTE=I_UNDERSTAND_THIS_WRITES_TEST_DATA; nunca lo ejecutes contra producción.",
  );
}
if (!["http:", "https:"].includes(parsedBaseUrl.protocol)) {
  throw new Error("BASE_URL debe usar HTTP o HTTPS.");
}

for (const name of [
  "FIREBASE_CLIENT_EMAIL",
  "FIREBASE_PRIVATE_KEY",
] as const) {
  if (!process.env[name]?.trim()) {
    throw new Error(`Smoke cancelado: falta ${name}; no se creó ningún dato.`);
  }
}

const runId = randomUUID().replaceAll("-", "");
const baseEmail = `library-smoke-${runId}`;
const studentEmail = `${baseEmail}-student@example.com`;
const secondStudentEmail = `${baseEmail}-student2@example.com`;
const librarianEmail = `${baseEmail}-librarian@example.com`;
const publicEmail = `${baseEmail}-public@example.com`;
const displayName = `Smoke ${runId}`;
const password = randomBytes(24).toString("base64url");
const coverBookId = `smoke-${runId}-cover`;
const singleCopyBookId = `smoke-${runId}-single`;
const multiCopyBookId = `smoke-${runId}-multi`;
const createdUsers: Array<{ uid: string; email: string }> = [];
const createdBooks: string[] = [];
const createdUserDocuments = new Set<string>();
const stepsPassed: string[] = [];
const failures: string[] = [];
let currentStep = "preflight";
let stepCount = 0;
let studentToken = "";
let secondStudentToken = "";
let librarianToken = "";
let activeLoanId = "";
let firstSingleLoanId = "";
let secondSingleLoanId = "";
let preCoverUpdatedAt = "";
let coverBytes = Buffer.alloc(0);
let registrationAttempted = false;
let registrationConfirmedAbsent = false;
let registrationStartedAt = 0;
let registrationDisplayName = "";
let registrationUid: string | undefined;
let admin: typeof import("./admin.mts") | undefined;

type JsonRecord = Record<string, unknown>;
type ApiResult = { response: Response; body: JsonRecord };

function object(value: unknown): JsonRecord | undefined {
  return typeof value === "object" && value !== null
    ? (value as JsonRecord)
    : undefined;
}

function errorCode(body: JsonRecord): string | undefined {
  return object(body.error)?.code as string | undefined;
}

function authErrorCode(error: unknown): string | undefined {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string"
  ) {
    return error.code;
  }
  return undefined;
}

function ensure(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function step(name: string, operation: () => Promise<void>): Promise<void> {
  stepCount += 1;
  currentStep = `${stepCount}/41 ${name}`;
  await operation();
  stepsPassed.push(name);
  console.log(`OK ${currentStep}`);
}

async function api(
  path: string,
  options: {
    method?: string;
    token?: string;
    body?: JsonRecord;
  } = {},
): Promise<ApiResult> {
  const headers = new Headers();
  if (options.body) headers.set("Content-Type", "application/json");
  if (options.token) headers.set("Authorization", `Bearer ${options.token}`);

  const response = await fetch(`${baseUrl}${path}`, {
    method: options.method ?? "GET",
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });

  let body: JsonRecord = {};
  if (response.headers.get("content-type")?.includes("application/json")) {
    body = (await response.json()) as JsonRecord;
  }
  return { response, body };
}

function requestId(): string {
  return randomUUID().replaceAll("-", "");
}

async function createTestUser(
  email: string,
  role: "student" | "librarian",
): Promise<void> {
  if (!admin) throw new Error("Firebase Admin no está inicializado.");
  const user = await admin.auth.createUser({
    email,
    password,
    displayName,
  });
  createdUsers.push({ uid: user.uid, email });
  await admin.auth.setCustomUserClaims(user.uid, { role });
  await admin.firestore.collection("users").doc(user.uid).create({
    email,
    displayName,
    role,
    createdAt: new Date().toISOString(),
  });
  createdUserDocuments.add(user.uid);
}

async function login(
  email: string,
): Promise<{ token: string; refreshToken: string; role: string }> {
  const result = await api("/api/auth/login", {
    method: "POST",
    body: { email, password },
  });
  const tokens = object(result.body.tokens);
  const user = object(result.body.user);
  ensure(
    result.response.status === 200 &&
      typeof tokens?.idToken === "string" &&
      typeof tokens.refreshToken === "string",
    "El endpoint de login no devolvió tokens válidos.",
  );
  const decoded = await admin!.auth.verifyIdToken(tokens.idToken);
  return {
    token: tokens.idToken,
    refreshToken: tokens.refreshToken,
    role: String(decoded.role ?? user?.role ?? ""),
  };
}

async function saveTestBook(
  id: string,
  title: string,
  totalCopies: number,
): Promise<void> {
  if (!admin) throw new Error("Firebase Admin no está inicializado.");
  const reference = admin.firestore.collection("books").doc(id);
  if ((await reference.get()).exists) {
    throw new Error("Colisión de ID en recurso de prueba; se aborta sin sobrescribir.");
  }
  await reference.create({
    title,
    author: "Library smoke test",
    category: "Smoke Test",
    year: 2026,
    description: "Registro temporal creado por el smoke test.",
    totalCopies,
    availableCopies: totalCopies,
    coverVersion: 0,
    updatedAt: new Date(Date.now() - 5_000).toISOString(),
  });
  createdBooks.push(id);
}

async function firestoreLoan(id: string): Promise<JsonRecord> {
  if (!admin) throw new Error("Firebase Admin no está inicializado.");
  const snapshot = await admin.firestore.collection("loans").doc(id).get();
  ensure(snapshot.exists, "El préstamo esperado no está persistido en Firestore.");
  return snapshot.data() as JsonRecord;
}

async function bookDocument(id: string): Promise<JsonRecord> {
  if (!admin) throw new Error("Firebase Admin no está inicializado.");
  const snapshot = await admin.firestore.collection("books").doc(id).get();
  ensure(snapshot.exists, "El libro esperado no está persistido en Firestore.");
  return snapshot.data() as JsonRecord;
}

async function cleanup(): Promise<void> {
  if (!admin) return;
  const database = admin.firestore;
  for (const [email, expectedName] of [
    [publicEmail, registrationDisplayName],
  ] as const) {
    if (!registrationAttempted || !registrationConfirmedAbsent) continue;
    try {
      const user = await admin.auth.getUserByEmail(email);
      const userDocument = await database
        .collection("users")
        .doc(user.uid)
        .get();
      const createdAt = Date.parse(user.metadata.creationTime);
      const isOurs =
        user.uid === registrationUid ||
        (expectedName.length > 0 &&
          user.displayName === expectedName &&
          Number.isFinite(createdAt) &&
          createdAt >= registrationStartedAt &&
          (!userDocument.exists ||
            userDocument.data()?.displayName === expectedName));
      if (isOurs) {
        createdUsers.push({ uid: user.uid, email });
        if (userDocument.exists) createdUserDocuments.add(user.uid);
      }
      else failures.push("cleanup: registro parcial no identificado; se dejó intacto por seguridad.");
    } catch (error) {
      if (authErrorCode(error) !== "auth/user-not-found") {
        failures.push("cleanup: no se pudo verificar la cuenta del registro público.");
      }
    }
  }

  const uids = new Set(createdUsers.map(({ uid }) => uid));
  const cleanupErrors: string[] = [];
  for (const uid of uids) {
    try {
      const loans = await database
        .collection("loans")
        .where("userId", "==", uid)
        .get();
      const batch = database.batch();
      for (const loan of loans.docs) batch.delete(loan.ref);
      if (!loans.empty) await batch.commit();
    } catch {
      cleanupErrors.push("no se pudieron eliminar los préstamos de una cuenta temporal.");
    }
  }

  for (const bookId of createdBooks) {
    try {
      await database.collection("bookCovers").doc(bookId).delete();
      await database.collection("books").doc(bookId).delete();
      for (const uid of uids) {
        const lockId = await lockDocumentId(uid, bookId);
        await database.collection("loanLocks").doc(lockId).delete();
      }
    } catch {
      cleanupErrors.push("no se pudo eliminar un libro/portada temporal.");
    }
  }

  for (const { uid } of createdUsers) {
    try {
      if (createdUserDocuments.has(uid)) {
        await database.collection("users").doc(uid).delete();
      }
      await admin.auth.deleteUser(uid);
    } catch (error) {
      if (authErrorCode(error) !== "auth/user-not-found") {
        cleanupErrors.push("no se pudo eliminar completamente una cuenta temporal.");
      }
    }
  }
  failures.push(...cleanupErrors.map((message) => `cleanup: ${message}`));
}

async function lockDocumentId(uid: string, bookId: string): Promise<string> {
  const { createHash } = await import("node:crypto");
  return createHash("sha256").update(`${uid}:${bookId}`).digest("hex");
}

async function main(): Promise<void> {
  const health = await fetch(`${baseUrl}/api/health`, {
    cache: "no-store",
    signal: AbortSignal.timeout(5_000),
  }).catch(() => undefined);
  if (!health?.ok) {
    throw new Error(
      `La API no responde en ${baseUrl}/api/health. Iníciala antes de ejecutar el smoke.`,
    );
  }
  const healthBody = await health
    .json()
    .then(object)
    .catch(() => undefined);
  if (
    healthBody?.status !== "ok" ||
    healthBody.service !== "library_api"
  ) {
    throw new Error("La API responde, pero su endpoint de salud no es válido.");
  }

  try {
    admin = await import("./admin.mts");
    await admin.auth.listUsers(1);
    await admin.firestore.collection("books").limit(1).get();
  } catch {
    throw new Error(
      "Firebase Auth o Firestore no están disponibles con las credenciales configuradas.",
    );
  }

  await createTestUser(studentEmail, "student");
  await createTestUser(secondStudentEmail, "student");
  await createTestUser(librarianEmail, "librarian");

  await step("401 sin token en catálogo", async () => {
    const result = await api("/api/books");
    ensure(
      result.response.status === 401 &&
        errorCode(result.body) === "UNAUTHENTICATED",
      "Se esperaba 401 UNAUTHENTICATED.",
    );
  });

  await step("credenciales inválidas uniformes", async () => {
    const result = await api("/api/auth/login", {
      method: "POST",
      body: { email: studentEmail, password: randomBytes(24).toString("hex") },
    });
    ensure(
      result.response.status === 401 &&
        errorCode(result.body) === "INVALID_CREDENTIALS",
      "Se esperaba 401 INVALID_CREDENTIALS sin filtrar el motivo.",
    );
  });

  await step("login y refresh de estudiante con rol persistido", async () => {
    const result = await login(studentEmail);
    ensure(result.role === "student", "El ID token no contiene role student.");
    const refreshed = await api("/api/auth/refresh", {
      method: "POST",
      body: { refreshToken: result.refreshToken },
    });
    const tokens = object(refreshed.body.tokens);
    const refreshedUser = object(refreshed.body.user);
    ensure(
      refreshed.response.status === 200 &&
        typeof tokens?.idToken === "string" &&
        refreshedUser?.role === "student" &&
        (await admin!.auth.verifyIdToken(tokens.idToken)).uid ===
          (await admin!.auth.verifyIdToken(result.token)).uid,
      "El refresh no renovó el token del mismo estudiante.",
    );
    studentToken = tokens.idToken;
  });

  await step("GET me valida identidad y rol", async () => {
    const result = await api("/api/auth/me", { token: studentToken });
    const user = object(result.body.user);
    const sessionCookie = await admin!.auth.createSessionCookie(studentToken, {
      expiresIn: 5 * 24 * 60 * 60 * 1000,
    });
    const sessionUser = await admin!.auth.verifySessionCookie(sessionCookie, true);
    ensure(
      result.response.status === 200 &&
        user?.role === "student" &&
        user.email === studentEmail &&
        sessionUser.uid === user.uid &&
        sessionUser.role === "student",
      "GET /api/auth/me o la sesión Firebase de cinco días no validó el estudiante.",
    );
  });

  await step("login de bibliotecario con rol", async () => {
    const result = await login(librarianEmail);
    librarianToken = result.token;
    ensure(result.role === "librarian", "El token no contiene role librarian.");
  });

  let catalog: JsonRecord = {};
  await step("catálogo inicial con los 10 libros sembrados", async () => {
    const result = await api("/api/books", { token: studentToken });
    catalog = result.body;
    const books = Array.isArray(catalog.books) ? catalog.books : [];
    ensure(
      result.response.status === 200 &&
        books.length === 10 &&
        typeof catalog.serverTime === "string",
      "El catálogo no contiene exactamente los 10 libros de seed.",
    );
  });

  await step("categorías devueltas y no vacías", async () => {
    const categories = catalog.categories;
    ensure(
      Array.isArray(categories) &&
        categories.length > 0 &&
        categories.includes("Novela") &&
        categories.includes("Tecnología"),
      "El catálogo no devolvió las categorías esperadas.",
    );
  });

  await step("búsqueda sin tildes", async () => {
    const result = await api("/api/books?q=cien%20anos", {
      token: studentToken,
    });
    const books = Array.isArray(result.body.books) ? result.body.books : [];
    ensure(
      result.response.status === 200 &&
        books.some((book) => object(book)?.id === "cien-anos-de-soledad"),
      "La búsqueda sin tildes no encontró Cien años de soledad.",
    );
  });

  await step("filtro exacto por categoría", async () => {
    const result = await api("/api/books?category=Novela", {
      token: studentToken,
    });
    const books = Array.isArray(result.body.books) ? result.body.books : [];
    ensure(
      result.response.status === 200 &&
        books.length > 0 &&
        books.every((book) => object(book)?.category === "Novela"),
      "El filtro devolvió libros de otra categoría.",
    );
  });

  await step("filtro updatedSince en el futuro", async () => {
    const result = await api(
      "/api/books?updatedSince=9999-12-31T23%3A59%3A59.000Z",
      { token: studentToken },
    );
    const books = Array.isArray(result.body.books) ? result.body.books : [];
    ensure(
      result.response.status === 200 &&
        books.length === 0 &&
        typeof result.body.serverTime === "string",
      "updatedSince no excluyó los libros posteriores al límite.",
    );
  });

  await step("detalle contiene los datos del libro", async () => {
    const result = await api("/api/books/cien-anos-de-soledad", {
      token: studentToken,
    });
    const book = object(result.body.book);
    ensure(
      result.response.status === 200 &&
        book?.id === "cien-anos-de-soledad" &&
        book.title === "Cien años de soledad",
      "El detalle no contiene el libro solicitado.",
    );
  });

  await step("detalle inexistente devuelve 404", async () => {
    const result = await api(`/api/books/smoke-not-found-${runId}`, {
      token: studentToken,
    });
    ensure(
      result.response.status === 404 &&
        errorCode(result.body) === "NOT_FOUND",
      "Un libro inexistente no devolvió 404 NOT_FOUND.",
    );
  });

  await saveTestBook(coverBookId, `Smoke Cover ${runId}`, 2);
  await saveTestBook(multiCopyBookId, `Smoke Multi ${runId}`, 2);
  await saveTestBook(singleCopyBookId, `Smoke Single ${runId}`, 1);

  let requestLoanId = "";
  const activeRequestId = requestId();
  await step("solicitud 201 persistida en Firestore", async () => {
    const result = await api("/api/loans", {
      method: "POST",
      token: studentToken,
      body: { bookId: multiCopyBookId, clientRequestId: activeRequestId },
    });
    const loan = object(result.body.loan);
    requestLoanId = String(loan?.id ?? "");
    const persisted = requestLoanId ? await firestoreLoan(requestLoanId) : {};
    ensure(
      result.response.status === 201 &&
        result.body.created === true &&
        persisted.status === "requested" &&
        persisted.userId === createdUsers[0]?.uid,
      "La solicitud no se creó y persistió como requested.",
    );
    activeLoanId = requestLoanId;
  });

  await step("clientRequestId idempotente no duplica préstamo", async () => {
    const result = await api("/api/loans", {
      method: "POST",
      token: studentToken,
      body: { bookId: multiCopyBookId, clientRequestId: activeRequestId },
    });
    const loans = await admin!.firestore
      .collection("loans")
      .where("userId", "==", createdUsers[0]!.uid)
      .get();
    const matchingLoans = loans.docs.filter(
      (document) => document.data().clientRequestId === activeRequestId,
    );
    ensure(
      result.response.status === 200 &&
        result.body.created === false &&
        object(result.body.loan)?.id === activeLoanId &&
        matchingLoans.length === 1,
      "El reintento creó un documento duplicado o no devolvió el existente.",
    );
  });

  await step("segunda solicitud activa devuelve ALREADY_ACTIVE", async () => {
    const result = await api("/api/loans", {
      method: "POST",
      token: studentToken,
      body: { bookId: multiCopyBookId, clientRequestId: requestId() },
    });
    ensure(
      result.response.status === 409 &&
        errorCode(result.body) === "ALREADY_ACTIVE",
      "Se esperaba 409 ALREADY_ACTIVE para el mismo libro.",
    );
  });

  await step("login de segundo estudiante y rol verificado", async () => {
    const loginResult = await login(secondStudentEmail);
    secondStudentToken = loginResult.token;
    ensure(loginResult.role === "student", "El segundo token no es de estudiante.");
  });

  await step("aislamiento: otro estudiante solo lista sus préstamos", async () => {
    const result = await api("/api/loans", { token: secondStudentToken });
    const loans = Array.isArray(result.body.loans) ? result.body.loans : [];
    ensure(
      result.response.status === 200 &&
        loans.length === 0 &&
        typeof result.body.serverTime === "string",
      "El estudiante pudo ver préstamos ajenos o falta serverTime.",
    );
  });

  await step("préstamo ajeno devuelve 404", async () => {
    const result = await api(`/api/loans/${encodeURIComponent(activeLoanId)}`, {
      token: secondStudentToken,
    });
    ensure(
      result.response.status === 404 &&
        errorCode(result.body) === "NOT_FOUND",
      "El préstamo ajeno debe ser indistinguible de uno inexistente.",
    );
  });

  await step("estudiante no puede cambiar estado", async () => {
    const result = await api(`/api/loans/${activeLoanId}`, {
      method: "PATCH",
      token: studentToken,
      body: { action: "approve" },
    });
    ensure(
      result.response.status === 403 &&
        errorCode(result.body) === "FORBIDDEN",
      "El estudiante pudo acceder a una transición de bibliotecario.",
    );
  });

  await step("bibliotecario ve préstamos globales y serverTime", async () => {
    const result = await api("/api/loans?status=requested", {
      token: librarianToken,
    });
    const loans = Array.isArray(result.body.loans) ? result.body.loans : [];
    ensure(
      result.response.status === 200 &&
        loans.some((loan) => object(loan)?.id === activeLoanId) &&
        typeof result.body.serverTime === "string",
      "El bibliotecario no vio la solicitud filtrada.",
    );
  });

  await step("aprobación fija vencimiento de 14 días y persiste estado", async () => {
    const result = await api(`/api/loans/${activeLoanId}`, {
      method: "PATCH",
      token: librarianToken,
      body: { action: "approve" },
    });
    const loan = object(result.body.loan);
    const persisted = await firestoreLoan(activeLoanId);
    const requestedAt = Date.parse(String(persisted.resolvedAt));
    const dueDate = Date.parse(String(persisted.dueDate));
    ensure(
      result.response.status === 200 &&
        loan?.status === "approved" &&
        persisted.status === "approved" &&
        Number.isFinite(requestedAt) &&
        dueDate - requestedAt === 14 * 24 * 60 * 60 * 1000 &&
        persisted.returnedAt === null,
      "La aprobación no fijó estado, fechas de resolución y vencimiento correctamente.",
    );
  });

  await step("aprobación descuenta inventario y actualiza updatedAt", async () => {
    const book = await bookDocument(multiCopyBookId);
    ensure(
      book.availableCopies === 1 &&
        book.totalCopies === 2 &&
        Date.parse(String(book.updatedAt)) >=
          Date.parse(String((await firestoreLoan(activeLoanId)).resolvedAt)),
      "La aprobación no descontó una copia ni actualizó updatedAt.",
    );
  });

  await step("doble aprobación devuelve INVALID_STATE", async () => {
    const result = await api(`/api/loans/${activeLoanId}`, {
      method: "PATCH",
      token: librarianToken,
      body: { action: "approve" },
    });
    ensure(
      result.response.status === 409 &&
        errorCode(result.body) === "INVALID_STATE",
      "La máquina de estados permitió aprobar dos veces.",
    );
  });

  await step("devolución marca returned y repone inventario", async () => {
    const result = await api(`/api/loans/${activeLoanId}`, {
      method: "PATCH",
      token: librarianToken,
      body: { action: "return" },
    });
    const persisted = await firestoreLoan(activeLoanId);
    const book = await bookDocument(multiCopyBookId);
    ensure(
      result.response.status === 200 &&
        persisted.status === "returned" &&
        typeof persisted.returnedAt === "string" &&
        book.availableCopies === 2,
      "La devolución no se persistió o no repuso el ejemplar.",
    );
  });

  await step("devolución doble devuelve INVALID_STATE", async () => {
    const result = await api(`/api/loans/${activeLoanId}`, {
      method: "PATCH",
      token: librarianToken,
      body: { action: "return" },
    });
    ensure(
      result.response.status === 409 &&
        errorCode(result.body) === "INVALID_STATE",
      "La máquina de estados permitió devolver dos veces.",
    );
  });

  await step("bibliotecario no puede solicitar como estudiante", async () => {
    const result = await api("/api/loans", {
      method: "POST",
      token: librarianToken,
      body: { bookId: multiCopyBookId, clientRequestId: requestId() },
    });
    ensure(
      result.response.status === 403 &&
        errorCode(result.body) === "FORBIDDEN",
      "Un bibliotecario pudo crear una solicitud de estudiante.",
    );
  });

  let rejectedLoanId = "";
  await step("rechazar conserva inventario y persiste rejected", async () => {
    const request = await api("/api/loans", {
      method: "POST",
      token: studentToken,
      body: { bookId: multiCopyBookId, clientRequestId: requestId() },
    });
    rejectedLoanId = String(object(request.body.loan)?.id ?? "");
    ensure(request.response.status === 201 && rejectedLoanId, "No se creó la solicitud para rechazar.");
    const before = await bookDocument(multiCopyBookId);
    const rejection = await api(`/api/loans/${rejectedLoanId}`, {
      method: "PATCH",
      token: librarianToken,
      body: { action: "reject" },
    });
    const persisted = await firestoreLoan(rejectedLoanId);
    const after = await bookDocument(multiCopyBookId);
    ensure(
      rejection.response.status === 200 &&
        persisted.status === "rejected" &&
        before.availableCopies === after.availableCopies,
      "Rechazar alteró el inventario o no persistió el estado.",
    );
  });

  await step("un préstamo rejected permite una nueva solicitud", async () => {
    const result = await api("/api/loans", {
      method: "POST",
      token: studentToken,
      body: { bookId: multiCopyBookId, clientRequestId: requestId() },
    });
    const loan = object(result.body.loan);
    ensure(
      result.response.status === 201 &&
        result.body.created === true &&
        loan?.status === "requested",
      "El préstamo rechazado bloqueó una nueva solicitud.",
    );
  });

  await step("dos solicitudes pendientes no reservan ejemplares", async () => {
    const first = await api("/api/loans", {
      method: "POST",
      token: studentToken,
      body: { bookId: singleCopyBookId, clientRequestId: requestId() },
    });
    const second = await api("/api/loans", {
      method: "POST",
      token: secondStudentToken,
      body: { bookId: singleCopyBookId, clientRequestId: requestId() },
    });
    firstSingleLoanId = String(object(first.body.loan)?.id ?? "");
    secondSingleLoanId = String(object(second.body.loan)?.id ?? "");
    const book = await bookDocument(singleCopyBookId);
    ensure(
      first.response.status === 201 &&
        second.response.status === 201 &&
        firstSingleLoanId &&
        secondSingleLoanId &&
        book.availableCopies === 1,
      "Las solicitudes no se aceptaron sin reservar ejemplares.",
    );
  });

  await step("primera aprobación consume el último ejemplar", async () => {
    const result = await api(`/api/loans/${firstSingleLoanId}`, {
      method: "PATCH",
      token: librarianToken,
      body: { action: "approve" },
    });
    const book = await bookDocument(singleCopyBookId);
    const loan = await firestoreLoan(firstSingleLoanId);
    ensure(
      result.response.status === 200 &&
        loan.status === "approved" &&
        book.availableCopies === 0,
      "La aprobación no consumió la única copia.",
    );
  });

  await step("inventario agotado produce NO_COPIES sin valor negativo", async () => {
    const result = await api(`/api/loans/${secondSingleLoanId}`, {
      method: "PATCH",
      token: librarianToken,
      body: { action: "approve" },
    });
    const book = await bookDocument(singleCopyBookId);
    const loan = await firestoreLoan(secondSingleLoanId);
    ensure(
      result.response.status === 409 &&
        errorCode(result.body) === "NO_COPIES" &&
        book.availableCopies === 0 &&
        loan.status === "requested",
      "El conflicto de inventario no preservó el préstamo solicitado.",
    );
  });

  await step("devolver primera solicitud repone última copia", async () => {
    const result = await api(`/api/loans/${firstSingleLoanId}`, {
      method: "PATCH",
      token: librarianToken,
      body: { action: "return" },
    });
    const book = await bookDocument(singleCopyBookId);
    ensure(
      result.response.status === 200 &&
        (await firestoreLoan(firstSingleLoanId)).status === "returned" &&
        book.availableCopies === 1 &&
        typeof book.totalCopies === "number" &&
        book.availableCopies <= book.totalCopies,
      "La devolución no restauró exactamente una copia.",
    );
  });

  await step("aprobar solicitud pendiente tras reposición", async () => {
    const result = await api(`/api/loans/${secondSingleLoanId}`, {
      method: "PATCH",
      token: librarianToken,
      body: { action: "approve" },
    });
    ensure(
      result.response.status === 200 &&
        (await firestoreLoan(secondSingleLoanId)).status === "approved" &&
        (await bookDocument(singleCopyBookId)).availableCopies === 0,
      "No se pudo aprobar tras restablecer el inventario.",
    );
  });

  await step("devolución final respeta totalCopies", async () => {
    const result = await api(`/api/loans/${secondSingleLoanId}`, {
      method: "PATCH",
      token: librarianToken,
      body: { action: "return" },
    });
    const book = await bookDocument(singleCopyBookId);
    ensure(
      result.response.status === 200 &&
        (await firestoreLoan(secondSingleLoanId)).status === "returned" &&
        book.availableCopies === book.totalCopies &&
        book.availableCopies === 1,
      "La devolución superó totalCopies o no restauró el inventario.",
    );
  });

  await step("registro público crea solo student y sincroniza Firestore", async () => {
    const absent = await admin!.auth
      .getUserByEmail(publicEmail)
      .then(() => false)
      .catch((error: unknown) =>
        authErrorCode(error) === "auth/user-not-found",
      );
    ensure(absent, "El correo temporal ya existe; se aborta sin modificarlo.");
    registrationConfirmedAbsent = true;
    registrationAttempted = true;
    registrationDisplayName = `Smoke Public ${runId}`;
    registrationStartedAt = Date.now() - 5_000;
    const result = await api("/api/auth/register", {
      method: "POST",
      body: {
        email: publicEmail,
        password,
        displayName: registrationDisplayName,
      },
    });
    const user = object(result.body.user);
    registrationUid = typeof user?.uid === "string" ? user.uid : undefined;
    if (registrationUid) {
      createdUsers.push({ uid: registrationUid, email: publicEmail });
      createdUserDocuments.add(registrationUid);
    }
    const persisted = registrationUid
      ? await admin!.firestore.collection("users").doc(registrationUid).get()
      : undefined;
    ensure(
      result.response.status === 201 &&
        user?.role === "student" &&
        typeof object(result.body.tokens)?.idToken === "string" &&
        persisted?.exists === true &&
        persisted.data()?.role === "student",
      "El registro no devolvió tokens de estudiante ni sincronizó el usuario.",
    );
  });

  await step("correo de registro duplicado devuelve EMAIL_IN_USE", async () => {
    const result = await api("/api/auth/register", {
      method: "POST",
      body: {
        email: publicEmail,
        password,
        displayName: `Smoke Duplicate ${runId}`,
      },
    });
    ensure(
      result.response.status === 409 &&
        errorCode(result.body) === "EMAIL_IN_USE",
      "El correo duplicado no produjo 409 EMAIL_IN_USE.",
    );
  });

  preCoverUpdatedAt = String((await bookDocument(coverBookId)).updatedAt);
  coverBytes = await sharp({
    create: {
      width: 8,
      height: 8,
      channels: 3,
      background: { r: 32, g: 96, b: 160 },
    },
  })
    .png()
    .toBuffer();

  await step("bibliotecario sube PNG válido y persiste versión y bytes", async () => {
    const result = await api(`/api/books/${coverBookId}/cover`, {
      method: "PUT",
      token: librarianToken,
      body: { contentType: "image/png", data: coverBytes.toString("base64") },
    });
    const book = object(result.body.book);
    const stored = await admin!.firestore
      .collection("bookCovers")
      .doc(coverBookId)
      .get();
    const storedBytes = stored.exists
      ? Buffer.from(String(stored.data()?.data), "base64")
      : Buffer.alloc(0);
    ensure(
      result.response.status === 200 &&
        book?.coverUrl === `/api/books/${coverBookId}/cover?v=1` &&
        (await bookDocument(coverBookId)).coverVersion === 1 &&
        stored.exists &&
        stored.data()?.contentType === "image/png" &&
        storedBytes.equals(coverBytes),
      "La portada válida no fue guardada íntegramente en Firestore.",
    );
  });

  await step("descarga devuelve exactamente los bytes originales", async () => {
    const response = await fetch(
      `${baseUrl}/api/books/${coverBookId}/cover?v=1`,
      { cache: "no-store" },
    );
    const downloaded = Buffer.from(await response.arrayBuffer());
    ensure(
      response.status === 200 &&
        response.headers.get("content-type")?.includes("image/png") &&
        downloaded.equals(coverBytes),
      "La descarga difiere de los bytes PNG subidos.",
    );
  });

  await step("archivo falso se rechaza y no reemplaza la portada", async () => {
    const fakeImage = Buffer.from(
      `<!doctype html><html><body>${`fake image ${runId} `.repeat(3)}</body></html>`,
    ).toString("base64");
    const result = await api(`/api/books/${coverBookId}/cover`, {
      method: "PUT",
      token: librarianToken,
      body: { contentType: "image/png", data: fakeImage },
    });
    ensure(
      result.response.status === 400 &&
        errorCode(result.body) === "VALIDATION_ERROR" &&
        (await bookDocument(coverBookId)).coverVersion === 1,
      "El servidor aceptó el archivo falso o modificó la versión.",
    );
  });

  await step("estudiante recibe 403 al subir portada", async () => {
    const result = await api(`/api/books/${coverBookId}/cover`, {
      method: "PUT",
      token: studentToken,
      body: { contentType: "image/png", data: coverBytes.toString("base64") },
    });
    ensure(
      result.response.status === 403 &&
        errorCode(result.body) === "FORBIDDEN" &&
        (await bookDocument(coverBookId)).coverVersion === 1,
      "El estudiante pudo subir una portada o alteró el libro.",
    );
  });

  await step("updatedSince incluye el libro tras actualizar su portada", async () => {
    const book = await bookDocument(coverBookId);
    const result = await api(
      `/api/books?updatedSince=${encodeURIComponent(preCoverUpdatedAt)}`,
      { token: studentToken },
    );
    const books = Array.isArray(result.body.books) ? result.body.books : [];
    ensure(
      Date.parse(String(book.updatedAt)) > Date.parse(preCoverUpdatedAt) &&
        book.coverVersion === 1 &&
        result.response.status === 200 &&
        books.some((entry) => object(entry)?.id === coverBookId),
      "La actualización de portada no aparece en la sincronización incremental.",
    );
  });
}

try {
  await main();
} catch (error) {
  failures.push(
    `${currentStep}: ${error instanceof Error ? error.message : "fallo inesperado"}`,
  );
} finally {
  await cleanup();
}

console.log(`\nComprobaciones superadas: ${stepsPassed.length}/41`);
for (const failure of failures) console.error(`FALLO: ${failure}`);
if (stepCount !== 41 && failures.length === 0) {
  failures.push(`Se ejecutaron ${stepCount} comprobaciones; se esperaban 41.`);
  console.error(`FALLO: ${failures[failures.length - 1]}`);
}
if (failures.length > 0) process.exitCode = 1;
