import { z } from "zod";
import {
  bookQuerySchema,
  coverSchema,
  createLoanSchema,
  loanActionSchema,
  loanQuerySchema,
  loginSchema,
  refreshSchema,
  registerSchema,
} from "@/lib/schemas";

interface OpenApiSchema {
  [key: string]: unknown;
  properties?: Record<string, OpenApiSchema>;
}
type HttpMethod =
  | "get"
  | "post"
  | "put"
  | "patch"
  | "delete"
  | "options"
  | "head";

interface OpenApiOperation {
  [key: string]: unknown;
  responses?: Record<string, unknown>;
  security?: Array<Record<string, string[]>>;
}

interface OpenApiPaths {
  [path: string]: Partial<Record<HttpMethod, OpenApiOperation>>;
}

interface OpenApiDocument {
  [key: string]: unknown;
  openapi: string;
  info: { title: string; version: string; description: string };
  servers: Array<{ url: string; description: string }>;
  tags: Array<{ name: string }>;
  paths: OpenApiPaths;
  components: {
    securitySchemes: Record<string, OpenApiSchema>;
    schemas: Record<string, OpenApiSchema>;
  };
}

export function zodToOpenApiSchema(schema: z.ZodType): OpenApiSchema {
  const jsonSchema = z.toJSONSchema(schema, { target: "draft-2020-12" });
  return Object.fromEntries(
    Object.entries(jsonSchema).filter(([key]) => key !== "$schema"),
  ) as OpenApiSchema;
}

const validationSchema = z.object({
  error: z.object({
    code: z.literal("VALIDATION_ERROR"),
    message: z.string(),
    details: z.array(z.object({
      path: z.string(),
      message: z.string(),
    })).optional(),
  }),
});

const apiErrorSchema = z.object({
  error: z.object({
    code: z.enum([
      "UNAUTHENTICATED",
      "INVALID_CREDENTIALS",
      "FORBIDDEN",
      "NOT_FOUND",
      "EMAIL_IN_USE",
      "ALREADY_ACTIVE",
      "NO_COPIES",
      "INVALID_STATE",
      "PAYLOAD_TOO_LARGE",
      "RATE_LIMITED",
      "CONFIG_ERROR",
      "INTERNAL_ERROR",
    ]),
    message: z.string(),
    details: z.unknown().optional(),
  }),
});

const authUserSchema = z.object({
  uid: z.string(),
  email: z.string(),
  name: z.string(),
  role: z.enum(["student", "librarian"]),
});
const tokenSchema = z.object({
  idToken: z.string().describe("Firebase ID token. No se persiste en localStorage."),
  refreshToken: z.string(),
  expiresIn: z.number().int(),
});
const authResultSchema = z.object({
  user: authUserSchema,
  tokens: tokenSchema,
});
const bookSchema = z.object({
  id: z.string(),
  title: z.string(),
  author: z.string(),
  category: z.string(),
  year: z.number().int(),
  description: z.string(),
  totalCopies: z.number().int(),
  availableCopies: z.number().int(),
  coverUrl: z.string().nullable(),
  updatedAt: z.string().datetime(),
});
const loanSchema = z.object({
  id: z.string(),
  bookId: z.string(),
  bookTitle: z.string(),
  userId: z.string(),
  userEmail: z.string(),
  userName: z.string(),
  status: z.enum(["requested", "approved", "rejected", "returned"]),
  clientRequestId: z.string(),
  requestedAt: z.string().datetime(),
  resolvedAt: z.string().datetime().nullable(),
  dueDate: z.string().datetime().nullable(),
  returnedAt: z.string().datetime().nullable(),
  updatedAt: z.string().datetime(),
});
const errorResponseSchema = zodToOpenApiSchema(apiErrorSchema);
const validationResponseSchema = zodToOpenApiSchema(validationSchema);
const registerRequest = zodToOpenApiSchema(registerSchema);
const loginRequest = zodToOpenApiSchema(loginSchema);
const refreshRequest = zodToOpenApiSchema(refreshSchema);
const createLoanRequest = zodToOpenApiSchema(createLoanSchema);
const loanActionRequest = zodToOpenApiSchema(loanActionSchema);
const coverRequest = zodToOpenApiSchema(coverSchema);
const bookQuery = zodToOpenApiSchema(bookQuerySchema);
const loanQuery = zodToOpenApiSchema(loanQuerySchema);

function ref(name: string) {
  return { $ref: `#/components/schemas/${name}` };
}

function jsonResponse(description: string, schema: OpenApiSchema) {
  return {
    description,
    content: { "application/json": { schema } },
  };
}

function errorResponses(statuses: Record<string, string>) {
  return Object.fromEntries(
    Object.entries(statuses).map(([status, description]) => [
      status,
      jsonResponse(description, status === "400" ? validationResponseSchema : ref("ErrorResponse")),
    ]),
  );
}

function body(schema: OpenApiSchema) {
  return {
    required: true,
    content: { "application/json": { schema } },
  };
}

function secured(operation: OpenApiOperation): OpenApiOperation {
  return { ...operation, security: [{ BearerAuth: [] }] };
}

function publicOperation(operation: OpenApiOperation): OpenApiOperation {
  return { ...operation, security: [] };
}

function pathParameter(name: string, description: string) {
  return {
    name,
    in: "path",
    required: true,
    description,
    schema: { type: "string", minLength: 1 },
  };
}

const healthOperation = publicOperation({
  operationId: "getHealth",
  summary: "Comprobar disponibilidad de la API",
  responses: {
    "200": jsonResponse("Servicio disponible.", {
      type: "object",
      required: ["status", "service"],
      properties: {
        status: { type: "string", const: "ok" },
        service: { type: "string", const: "library_api" },
      },
    }),
  },
});

const docOperation = publicOperation({
  operationId: "getOpenApiDocument",
  summary: "Obtener el documento OpenAPI",
  responses: {
    "200": {
      description: "Especificación OpenAPI 3.1 en JSON.",
      content: { "application/json": { schema: { type: "object" } } },
    },
  },
});

const docsOperation = publicOperation({
  operationId: "getSwaggerUi",
  summary: "Abrir la documentación interactiva",
  responses: {
    "200": {
      description: "Interfaz Swagger UI.",
      content: { "text/html": { schema: { type: "string" } } },
    },
  },
});

export function buildOpenApiSpec(): OpenApiDocument {
  const paths = {
    "/api/health": { get: healthOperation },
    "/api/auth/register": {
      post: publicOperation({
        operationId: "register",
        summary: "Registrar una cuenta pública de estudiante",
        description: "El rol siempre se asigna a student; no se acepta en el cuerpo.",
        requestBody: body(registerRequest),
        responses: {
          "201": jsonResponse("Cuenta estudiante creada y tokens emitidos.", ref("AuthResult")),
          ...errorResponses({
            "400": "Cuerpo inválido o contraseña no aceptada.",
            "409": "El correo ya está registrado.",
            "502": "Proveedor de autenticación no disponible.",
          }),
        },
      }),
    },
    "/api/auth/login": {
      post: publicOperation({
        operationId: "login",
        summary: "Iniciar sesión",
        description: "Credenciales inválidas producen un error uniforme sin enumerar cuentas.",
        requestBody: body(loginRequest),
        responses: {
          "200": jsonResponse("Autenticación correcta.", ref("AuthResult")),
          ...errorResponses({
            "400": "Cuerpo inválido.",
            "401": "Credenciales inválidas.",
            "403": "Cuenta deshabilitada.",
            "429": "Exceso de intentos.",
            "502": "Proveedor de autenticación no disponible.",
          }),
        },
      }),
    },
    "/api/auth/refresh": {
      post: publicOperation({
        operationId: "refreshTokens",
        summary: "Renovar tokens de Firebase",
        requestBody: body(refreshRequest),
        responses: {
          "200": jsonResponse("Tokens renovados.", ref("AuthResult")),
          ...errorResponses({
            "400": "Cuerpo inválido.",
            "401": "Refresh token inválido o expirado.",
            "429": "Exceso de intentos.",
            "502": "Proveedor de autenticación no disponible.",
          }),
        },
      }),
    },
    "/api/auth/me": {
      get: secured({
        operationId: "getCurrentUser",
        summary: "Obtener el usuario autenticado",
        responses: {
          "200": jsonResponse("Usuario autenticado.", {
            type: "object",
            required: ["user"],
            properties: { user: ref("AuthUser") },
          }),
          ...errorResponses({ "401": "Token ausente, inválido, revocado o expirado." }),
        },
      }),
    },
    "/api/books": {
      get: secured({
        operationId: "listBooks",
        summary: "Listar y buscar libros",
        description: "Todos los filtros son opcionales. updatedSince incluye libros con updatedAt estrictamente posterior al valor.",
        parameters: [
          { name: "q", in: "query", schema: bookQuery.properties?.q },
          { name: "category", in: "query", schema: bookQuery.properties?.category },
          { name: "updatedSince", in: "query", schema: bookQuery.properties?.updatedSince },
        ],
        responses: {
          "200": jsonResponse("Catálogo, categorías y hora del servidor.", {
            type: "object",
            required: ["books", "categories", "serverTime"],
            properties: {
              books: { type: "array", items: ref("Book") },
              categories: { type: "array", items: { type: "string" } },
              serverTime: { type: "string", format: "date-time" },
            },
          }),
          ...errorResponses({
            "400": "Filtros inválidos.",
            "401": "Token ausente, inválido, revocado o expirado.",
          }),
        },
      }),
    },
    "/api/books/{id}": {
      get: secured({
        operationId: "getBook",
        summary: "Obtener detalle de un libro",
        parameters: [pathParameter("id", "Identificador del libro.")],
        responses: {
          "200": jsonResponse("Libro encontrado.", {
            type: "object",
            required: ["book"],
            properties: { book: ref("Book") },
          }),
          ...errorResponses({
            "401": "Token ausente, inválido, revocado o expirado.",
            "404": "Libro no encontrado.",
          }),
        },
      }),
    },
    "/api/books/{id}/cover": {
      get: publicOperation({
        operationId: "getBookCover",
        summary: "Descargar portada",
        description: "Devuelve los bytes originales. Con ?v=coverVersion vigente se permite caché inmutable.",
        parameters: [
          pathParameter("id", "Identificador del libro."),
          { name: "v", in: "query", required: false, schema: { type: "integer", minimum: 1 } },
        ],
        responses: {
          "200": {
            description: "Bytes de imagen JPEG, PNG o WebP.",
            headers: {
              "Cache-Control": { schema: { type: "string" } },
              "X-Content-Type-Options": { schema: { type: "string", const: "nosniff" } },
            },
            content: {
              "image/jpeg": { schema: { type: "string", format: "binary" } },
              "image/png": { schema: { type: "string", format: "binary" } },
              "image/webp": { schema: { type: "string", format: "binary" } },
            },
          },
          ...errorResponses({ "404": "Libro o portada no encontrado." }),
        },
      }),
      put: secured({
        operationId: "putBookCover",
        summary: "Subir o reemplazar portada",
        description: "Exclusivo de librarian. Valida Base64 y formato real de imagen, y actualiza coverVersion y updatedAt.",
        parameters: [pathParameter("id", "Identificador del libro.")],
        "x-required-role": "librarian",
        requestBody: body(coverRequest),
        responses: {
          "200": jsonResponse("Portada guardada y versión incrementada.", {
            type: "object",
            required: ["book"],
            properties: { book: ref("Book") },
          }),
          ...errorResponses({
            "400": "Cuerpo, Base64 o formato de imagen inválido.",
            "401": "Token ausente, inválido, revocado o expirado.",
            "403": "Solo bibliotecarios pueden subir portadas.",
            "404": "Libro no encontrado.",
            "413": "Cuerpo demasiado grande.",
          }),
        },
      }),
    },
    "/api/loans": {
      get: secured({
        operationId: "listLoans",
        summary: "Listar préstamos propios o todos",
        description: "Estudiantes solo ven sus préstamos. Bibliotecarios pueden listar todos. Orden descendente por requestedAt.",
        parameters: [
          {
            name: "status",
            in: "query",
            required: false,
            schema: loanQuery.properties?.status,
          },
        ],
        responses: {
          "200": jsonResponse("Préstamos y hora del servidor.", {
            type: "object",
            required: ["loans", "serverTime"],
            properties: {
              loans: { type: "array", items: ref("Loan") },
              serverTime: { type: "string", format: "date-time" },
            },
          }),
          ...errorResponses({
            "400": "Filtro de estado inválido.",
            "401": "Token ausente, inválido, revocado o expirado.",
          }),
        },
      }),
      post: secured({
        operationId: "requestLoan",
        summary: "Solicitar un préstamo",
        description: "Solo student. clientRequestId es idempotente por usuario: el primer envío responde 201; un reintento devuelve el recurso existente con 200. Flujo: requested → approved → returned o requested → rejected.",
        "x-required-role": "student",
        requestBody: body(createLoanRequest),
        responses: {
          "201": jsonResponse("Solicitud creada.", {
            type: "object",
            required: ["loan", "created"],
            properties: { loan: ref("Loan"), created: { type: "boolean", const: true } },
          }),
          "200": jsonResponse("Reintento idempotente; préstamo existente.", {
            type: "object",
            required: ["loan", "created"],
            properties: { loan: ref("Loan"), created: { type: "boolean", const: false } },
          }),
          ...errorResponses({
            "400": "Cuerpo inválido.",
            "401": "Token ausente, inválido, revocado o expirado.",
            "403": "Solo estudiantes pueden solicitar préstamos.",
            "404": "Libro no encontrado.",
            "409": "ALREADY_ACTIVE o NO_COPIES.",
          }),
        },
      }),
    },
    "/api/loans/{id}": {
      get: secured({
        operationId: "getLoan",
        summary: "Obtener préstamo",
        description: "El estudiante solo puede consultar préstamos propios; un préstamo ajeno responde 404.",
        parameters: [pathParameter("id", "Identificador del préstamo.")],
        responses: {
          "200": jsonResponse("Préstamo encontrado.", {
            type: "object",
            required: ["loan"],
            properties: { loan: ref("Loan") },
          }),
          ...errorResponses({
            "401": "Token ausente, inválido, revocado o expirado.",
            "404": "Préstamo inexistente o no visible para este usuario.",
          }),
        },
      }),
      patch: secured({
        operationId: "transitionLoan",
        summary: "Aprobar, rechazar o devolver un préstamo",
        description: "Solo librarian. requested → approved fija dueDate a 14 días y descuenta inventario; requested → rejected no modifica inventario; approved → returned devuelve un ejemplar.",
        "x-required-role": "librarian",
        parameters: [pathParameter("id", "Identificador del préstamo.")],
        requestBody: body(loanActionRequest),
        responses: {
          "200": jsonResponse("Estado del préstamo actualizado.", {
            type: "object",
            required: ["loan"],
            properties: { loan: ref("Loan") },
          }),
          ...errorResponses({
            "400": "Acción inválida.",
            "401": "Token ausente, inválido, revocado o expirado.",
            "403": "Solo bibliotecarios pueden modificar préstamos.",
            "404": "Préstamo o libro asociado no encontrado.",
            "409": "NO_COPIES o INVALID_STATE.",
          }),
        },
      }),
    },
    "/api/openapi.json": { get: docOperation },
    "/api/docs": { get: docsOperation },
  } satisfies OpenApiPaths;

  const schemas = {
    AuthUser: zodToOpenApiSchema(authUserSchema),
    AuthResult: zodToOpenApiSchema(authResultSchema),
    Book: zodToOpenApiSchema(bookSchema),
    Loan: zodToOpenApiSchema(loanSchema),
    ErrorResponse: errorResponseSchema,
  };

  return {
    openapi: "3.1.0",
    info: {
      title: "Biblioteca API",
      version: "1.0.0",
      description: [
        "API de catálogo, autenticación, préstamos y portadas.",
        "Las operaciones del catálogo y préstamos requieren ID token JWT de Firebase en Authorization: Bearer <idToken>, salvo donde security: [] indique acceso público.",
        "Los errores JSON siguen el formato { error: { code, message, details? } }. Las validaciones Zod responden 400 VALIDATION_ERROR.",
        "Los estados de préstamo válidos son requested → approved → returned y requested → rejected. Transiciones ilegales responden 409 INVALID_STATE.",
      ].join("\n\n"),
    },
    servers: [{ url: "/", description: "Servidor actual" }],
    tags: [
      { name: "Salud" },
      { name: "Autenticación" },
      { name: "Libros" },
      { name: "Préstamos" },
      { name: "Documentación" },
    ],
    paths: Object.fromEntries(
      Object.entries(paths).map(([path, pathItem]) => [
        path,
        Object.fromEntries(
          Object.entries(pathItem).map(([method, operation]) => [
            method,
            {
              tags: [tagForPath(path)],
              ...operation,
              responses: {
                ...(operation.responses ?? {}),
                ...(!("401" in (operation.responses ?? {}))
                  && !(operation.security && operation.security.length === 0)
                  ? errorResponses({ "401": "Autenticación requerida o token inválido." })
                  : {}),
              },
            },
          ]),
        ) as OpenApiPaths,
      ]),
    ),
    components: {
      securitySchemes: {
        BearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
          description: "Firebase ID token firmado, enviado como Authorization: Bearer <idToken>.",
        },
      },
      schemas,
    },
  };
}

function tagForPath(path: string): string {
  if (path === "/api/health") return "Salud";
  if (path.startsWith("/api/auth/")) return "Autenticación";
  if (path.startsWith("/api/books")) return "Libros";
  if (path.startsWith("/api/loans")) return "Préstamos";
  return "Documentación";
}
