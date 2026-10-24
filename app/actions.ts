"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ApiError } from "@/lib/errors";
import { requestLoan, transitionLoan } from "@/lib/data/loans";
import { saveCover } from "@/lib/data/books";
import { assertRole } from "@/lib/guard";
import {
  createLoanSchema,
  coverSchema,
  loanActionSchema,
  loginSchema,
  registerSchema,
  MAX_COVER_BASE64_LENGTH,
} from "@/lib/schemas";
import { login, register } from "@/lib/services/auth";
import { validateCoverImage } from "@/lib/services/covers";
import { clearSessionCookie, setSessionCookie } from "@/lib/web/session";
import { requireWebUser } from "@/lib/web/access";
import type { CoverContentType } from "@/lib/data/books";

export interface ActionState {
  error?: string;
  success?: string;
  fieldErrors?: Record<string, string>;
  resourceUrl?: string;
}

function validationErrors(issues: { path: PropertyKey[]; message: string }[]) {
  return Object.fromEntries(
    issues.map((issue) => [String(issue.path[0] ?? "form"), issue.message]),
  );
}

function friendlyAuthError(error: unknown, registering = false): string {
  if (!(error instanceof ApiError)) {
    return "No se pudo conectar con el servicio. Comprueba tu conexión e inténtalo de nuevo.";
  }
  if (error.code === "INVALID_CREDENTIALS") {
    return "Correo o contraseña incorrectos.";
  }
  if (registering && error.code === "EMAIL_IN_USE") {
    return "No se pudo crear la cuenta con esos datos. Comprueba el correo e inténtalo de nuevo.";
  }
  if (error.code === "RATE_LIMITED") {
    return "Hay demasiados intentos. Espera un momento e inténtalo de nuevo.";
  }
  if (error.code === "VALIDATION_ERROR") return error.message;
  return "No se pudo completar la solicitud. Inténtalo de nuevo.";
}

export async function loginAction(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { fieldErrors: validationErrors(parsed.error.issues) };

  let destination = "/books";
  try {
    const result = await login(parsed.data.email, parsed.data.password);
    await setSessionCookie(result.tokens.idToken);
    if (result.user.role === "librarian") destination = "/loans";
  } catch (error) {
    return { error: friendlyAuthError(error) };
  }
  redirect(destination);
}

export async function registerAction(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = registerSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    displayName: formData.get("displayName"),
  });
  if (!parsed.success) return { fieldErrors: validationErrors(parsed.error.issues) };

  try {
    const result = await register(
      parsed.data.email,
      parsed.data.password,
      parsed.data.displayName,
    );
    await setSessionCookie(result.tokens.idToken);
  } catch (error) {
    return { error: friendlyAuthError(error, true) };
  }
  redirect("/books");
}

export async function logoutAction(): Promise<void> {
  await clearSessionCookie();
  redirect("/login");
}

export async function requestLoanAction(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireWebUser();
  assertRole(user, "student");
  const parsed = createLoanSchema.safeParse({
    bookId: formData.get("bookId"),
    clientRequestId: formData.get("clientRequestId"),
  });
  if (!parsed.success) return { fieldErrors: validationErrors(parsed.error.issues) };

  try {
    await requestLoan(user, parsed.data.bookId, parsed.data.clientRequestId);
    revalidatePath("/loans");
    revalidatePath(`/books/${parsed.data.bookId}`);
    return { success: "Solicitud enviada. Puedes consultar su estado en Mis préstamos." };
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.code === "NO_COPIES") return { error: "No hay ejemplares disponibles en este momento." };
      if (error.code === "ALREADY_ACTIVE") return { error: "Ya tienes una solicitud o préstamo activo de este libro." };
      if (error.code === "NOT_FOUND") return { error: "No encontramos este libro." };
    }
    return { error: "No se pudo enviar la solicitud. Comprueba tu conexión e inténtalo de nuevo." };
  }
}

export async function transitionLoanAction(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireWebUser();
  assertRole(user, "librarian");
  const parsed = loanActionSchema.safeParse({ action: formData.get("action") });
  const loanId = formData.get("loanId");
  if (!parsed.success || typeof loanId !== "string" || !loanId) {
    return { error: "La acción o el préstamo no son válidos." };
  }

  try {
    await transitionLoan(loanId, parsed.data.action);
    revalidatePath("/loans");
    revalidatePath("/books");
    return { success: "El estado del préstamo se actualizó." };
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.code === "NO_COPIES") return { error: "No quedan ejemplares disponibles para aprobar el préstamo." };
      if (error.code === "INVALID_STATE") return { error: "El préstamo cambió de estado y esa acción ya no está permitida. Actualiza la página." };
      if (error.code === "NOT_FOUND") return { error: "No encontramos el préstamo o el libro asociado." };
    }
    return { error: "No se pudo actualizar el préstamo. Comprueba tu conexión e inténtalo de nuevo." };
  }
}

export async function uploadCoverAction(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireWebUser();
  assertRole(user, "librarian");
  const bookId = formData.get("bookId");
  const file = formData.get("cover");
  if (typeof bookId !== "string" || !bookId || !(file instanceof File)) {
    return { error: "Selecciona una imagen válida." };
  }

  const maximumBytes = Math.floor(MAX_COVER_BASE64_LENGTH / 4) * 3;
  if (!file.size || file.size > maximumBytes) {
    return { error: "La imagen está vacía o supera el tamaño máximo permitido (525 KB)." };
  }
  const extensionMime: Record<string, CoverContentType> = {
    "image/jpeg": "image/jpeg",
    "image/png": "image/png",
    "image/webp": "image/webp",
  };
  const contentType = extensionMime[file.type];
  if (!contentType) return { error: "Usa una imagen JPEG, PNG o WebP." };

  try {
    const data = Buffer.from(await file.arrayBuffer()).toString("base64");
    const parsed = coverSchema.safeParse({ contentType, data });
    if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "La imagen no es válida." };
    await validateCoverImage(contentType, data);
    const book = await saveCover(bookId, contentType, data);
    revalidatePath(`/books/${bookId}`);
    revalidatePath("/books");
    return {
      success: "Portada actualizada correctamente.",
      resourceUrl: book.coverUrl ?? undefined,
    };
  } catch (error) {
    if (error instanceof ApiError && error.code === "NOT_FOUND") {
      return { error: "No encontramos este libro." };
    }
    if (error instanceof ApiError && error.code === "VALIDATION_ERROR") {
      return { error: error.message };
    }
    return { error: "No se pudo guardar la portada. Comprueba tu conexión e inténtalo de nuevo." };
  }
}
