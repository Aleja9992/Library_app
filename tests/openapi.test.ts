import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { beforeAll, describe, expect, it } from "vitest";
import { Validator } from "@seriousme/openapi-schema-validator";
import { GET as openApiRoute } from "@/app/api/openapi.json/route";
import { GET as docsRoute } from "@/app/api/docs/route";
import {
  buildOpenApiSpec,
  zodToOpenApiSchema,
} from "@/lib/openapi";
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

type ApiMethod =
  | "get"
  | "post"
  | "put"
  | "patch"
  | "delete"
  | "options"
  | "head";

const httpMethods = new Set(["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"]);
let spec: ReturnType<typeof buildOpenApiSpec>;

interface TestOperation {
  [key: string]: unknown;
  description?: string;
  parameters?: Array<Record<string, unknown>>;
  requestBody?: {
    content?: {
      "application/json"?: { schema?: unknown };
    };
  };
  responses: Record<string, unknown>;
  security?: unknown[];
}

function getOperation(routePath: string, method: ApiMethod): TestOperation {
  const operation = spec.paths[routePath]?.[method];
  if (!operation) throw new Error(`No existe ${method.toUpperCase()} ${routePath}`);
  return operation as TestOperation;
}

function listRouteFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return listRouteFiles(fullPath);
    return entry.isFile() && entry.name === "route.ts" ? [fullPath] : [];
  });
}

function routeInventory(): Map<string, Set<ApiMethod>> {
  const apiDirectory = path.join(process.cwd(), "app", "api");
  const inventory = new Map<string, Set<ApiMethod>>();

  for (const filename of listRouteFiles(apiDirectory)) {
    const source = ts.createSourceFile(
      filename,
      readFileSync(filename, "utf8"),
      ts.ScriptTarget.Latest,
      true,
    );
    const methods = new Set<ApiMethod>();
    for (const statement of source.statements) {
      if (!ts.canHaveModifiers(statement)) continue;
      const modifiers = ts.getModifiers(statement);
      if (!modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)) {
        continue;
      }

      if (ts.isVariableStatement(statement)) {
        for (const declaration of statement.declarationList.declarations) {
          if (ts.isIdentifier(declaration.name) && httpMethods.has(declaration.name.text)) {
            methods.add(declaration.name.text.toLowerCase() as ApiMethod);
          }
        }
      } else if (
        ts.isFunctionDeclaration(statement) &&
        statement.name &&
        httpMethods.has(statement.name.text)
      ) {
        methods.add(statement.name.text.toLowerCase() as ApiMethod);
      }
    }

    const relative = path.relative(apiDirectory, filename);
    const segments = relative
      .split(path.sep)
      .slice(0, -1)
      .map((segment) => segment.replace(/^\[([^\]]+)\]$/, "{$1}"));
    const routePath = `/api/${segments.join("/")}`.replace(/\/$/, "");
    inventory.set(routePath, methods);
  }
  return inventory;
}

function documentedInventory(document: ReturnType<typeof buildOpenApiSpec>) {
  const inventory = new Map<string, Set<ApiMethod>>();
  for (const [routePath, item] of Object.entries(document.paths)) {
    inventory.set(
      routePath,
      new Set(Object.keys(item).filter((method) => httpMethods.has(method.toUpperCase())) as ApiMethod[]),
    );
  }
  return inventory;
}

function requestSchema(routePath: string, method: ApiMethod): unknown {
  return getOperation(routePath, method).requestBody?.content?.["application/json"]?.schema;
}

beforeAll(() => {
  spec = buildOpenApiSpec();
});

describe("contrato OpenAPI 3.1", () => {
  it("valida el documento con @seriousme/openapi-schema-validator", async () => {
    const validator = new Validator();
    const result = await validator.validate(spec);
    expect(result.valid, JSON.stringify(result.errors, null, 2)).toBe(true);
  });

  it("documenta exactamente todas las rutas y métodos API exportados en ambos sentidos", () => {
    const implementation = routeInventory();
    const documented = documentedInventory(spec);
    const missing: string[] = [];
    const stale: string[] = [];

    for (const [routePath, methods] of implementation) {
      for (const method of methods) {
        if (!documented.get(routePath)?.has(method)) {
          missing.push(`${method.toUpperCase()} ${routePath}`);
        }
      }
    }
    for (const [routePath, methods] of documented) {
      for (const method of methods) {
        if (!implementation.get(routePath)?.has(method)) {
          stale.push(`${method.toUpperCase()} ${routePath}`);
        }
      }
    }

    expect(missing, `Operaciones sin documentar: ${missing.join(", ")}`).toEqual([]);
    expect(stale, `Operaciones documentadas inexistentes: ${stale.join(", ")}`).toEqual([]);
    expect(implementation.size).toBe(12);
    expect([...implementation.values()].reduce((count, methods) => count + methods.size, 0)).toBe(15);
  });

  it("convierte los cuerpos de petición desde los esquemas Zod de runtime", () => {
    expect(requestSchema("/api/auth/register", "post")).toEqual(
      zodToOpenApiSchema(registerSchema),
    );
    expect(requestSchema("/api/auth/login", "post")).toEqual(
      zodToOpenApiSchema(loginSchema),
    );
    expect(requestSchema("/api/auth/refresh", "post")).toEqual(
      zodToOpenApiSchema(refreshSchema),
    );
    expect(requestSchema("/api/books/{id}/cover", "put")).toEqual(
      zodToOpenApiSchema(coverSchema),
    );
    expect(requestSchema("/api/loans", "post")).toEqual(
      zodToOpenApiSchema(createLoanSchema),
    );
    expect(requestSchema("/api/loans/{id}", "patch")).toEqual(
      zodToOpenApiSchema(loanActionSchema),
    );
    expect(getOperation("/api/books", "get").parameters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "q",
          schema: (zodToOpenApiSchema(bookQuerySchema).properties as Record<string, unknown>).q,
        }),
        expect.objectContaining({
          name: "category",
          schema: (zodToOpenApiSchema(bookQuerySchema).properties as Record<string, unknown>).category,
        }),
        expect.objectContaining({
          name: "updatedSince",
          schema: (zodToOpenApiSchema(bookQuerySchema).properties as Record<string, unknown>).updatedSince,
        }),
      ]),
    );
    expect(getOperation("/api/loans", "get").parameters?.[0]).toMatchObject({
      name: "status",
      schema: (zodToOpenApiSchema(loanQuerySchema).properties as Record<string, unknown>).status,
    });
  });

  it("marca rutas públicas con security vacío y protegidas con Bearer y 401", () => {
    const publicOperations: Array<[string, ApiMethod]> = [
      ["/api/health", "get"],
      ["/api/auth/register", "post"],
      ["/api/auth/login", "post"],
      ["/api/auth/refresh", "post"],
      ["/api/books/{id}/cover", "get"],
      ["/api/openapi.json", "get"],
      ["/api/docs", "get"],
    ];
    for (const [routePath, method] of publicOperations) {
      expect(getOperation(routePath, method).security).toEqual([]);
    }

    const implementation = routeInventory();
    for (const [routePath, methods] of implementation) {
      for (const method of methods) {
        const operation = getOperation(routePath, method);
        if (operation.security?.length === 0) continue;
        expect(operation.security).toEqual([{ BearerAuth: [] }]);
        expect(operation.responses).toHaveProperty("401");
      }
    }
    expect(spec.components.securitySchemes.BearerAuth).toMatchObject({
      type: "http",
      scheme: "bearer",
      bearerFormat: "JWT",
    });
    expect(getOperation("/api/books/{id}/cover", "put")["x-required-role"]).toBe("librarian");
    expect(getOperation("/api/loans", "post")["x-required-role"]).toBe("student");
    expect(getOperation("/api/loans/{id}", "patch")["x-required-role"]).toBe("librarian");
  });

  it("describe errores uniformes, idempotencia y estados del préstamo", () => {
    const description = spec.info.description;
    expect(description).toContain("VALIDATION_ERROR");
    expect(description).toContain("INVALID_STATE");
    expect(getOperation("/api/loans", "post").description).toContain("clientRequestId");
    expect(getOperation("/api/loans", "post").responses).toHaveProperty("200");
    expect(getOperation("/api/loans", "post").responses).toHaveProperty("201");
    expect(getOperation("/api/loans/{id}", "patch").description).toContain("requested → approved");
    expect(getOperation("/api/loans/{id}", "patch").responses).toHaveProperty("409");
    expect(getOperation("/api/books/{id}/cover", "get").security).toEqual([]);
    expect(getOperation("/api/books/{id}/cover", "put").responses).toHaveProperty("403");
  });

  it("expone el JSON y Swagger UI como rutas públicas con sus Content-Type", async () => {
    const jsonResponse = openApiRoute();
    const servedSpec = await jsonResponse.json();
    const htmlResponse = docsRoute();
    const html = await htmlResponse.text();

    expect(jsonResponse.status).toBe(200);
    expect(jsonResponse.headers.get("content-type")).toContain("application/json");
    expect(servedSpec).toEqual(spec);
    expect(htmlResponse.status).toBe(200);
    expect(htmlResponse.headers.get("content-type")).toBe("text/html; charset=utf-8");
    expect(html).toContain(`swagger-ui-dist@5.17.14/swagger-ui.css`);
    expect(html).toContain(`swagger-ui-dist@5.17.14/swagger-ui-bundle.js`);
    expect(html).toContain('url: "/api/openapi.json"');
  });
});
