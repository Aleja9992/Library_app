import { z } from "zod";

z.config(z.locales.es());

const emailField = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email("El correo electrónico no es válido."));

export const loginSchema = z.object({
  email: emailField,
  password: z.string().min(1, "La contraseña es obligatoria."),
});

export const registerSchema = z.object({
  email: emailField,
  password: z.string().min(6, "La contraseña debe tener al menos 6 caracteres."),
  displayName: z
    .string()
    .trim()
    .min(2, "El nombre debe tener al menos 2 caracteres.")
    .max(80, "El nombre no puede superar los 80 caracteres."),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(1, "El token de actualización es obligatorio."),
});

export const createLoanSchema = z.object({
  bookId: z
    .string()
    .min(1, "El identificador del libro es obligatorio.")
    .max(120, "El identificador del libro no puede superar los 120 caracteres.")
    .regex(
      /^[^/]+$/,
      "El identificador del libro no puede contener barras.",
    ),
  clientRequestId: z
    .string()
    .min(8, "El identificador de solicitud debe tener al menos 8 caracteres.")
    .max(100, "El identificador de solicitud no puede superar los 100 caracteres.")
    .regex(
      /^[A-Za-z0-9_-]+$/,
      "El identificador de solicitud solo puede contener letras, números, guion y guion bajo.",
    ),
});

export const loanActionSchema = z.object({
  action: z.enum(["approve", "reject", "return"], {
    error: "La acción debe ser approve, reject o return.",
  }),
});

export const MAX_COVER_BASE64_LENGTH = 700_000;

const BASE64_PATTERN =
  /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

export const coverSchema = z.object({
  contentType: z.enum(["image/jpeg", "image/png", "image/webp"], {
    error: "El formato debe ser JPEG, PNG o WebP.",
  }),
  data: z
    .string()
    .min(100, "La portada debe contener al menos 100 caracteres en Base64.")
    .max(MAX_COVER_BASE64_LENGTH, "La imagen es demasiado grande.")
    .regex(BASE64_PATTERN, "Los datos de la portada deben ser Base64 válido."),
});

export const bookQuerySchema = z.object({
  q: z.string().trim().max(100, "La búsqueda no puede superar los 100 caracteres.").optional(),
  category: z
    .string()
    .trim()
    .max(60, "La categoría no puede superar los 60 caracteres.")
    .optional(),
  updatedSince: z.iso.datetime({
    error: "updatedSince debe ser una fecha ISO 8601 válida.",
  }).optional(),
});

export const loanQuerySchema = z.object({
  status: z.enum(["requested", "approved", "rejected", "returned"], {
    error: "El estado del préstamo no es válido.",
  }).optional(),
});
