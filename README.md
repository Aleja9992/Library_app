# Library API

API REST para una biblioteca construida con Next.js 16 App Router, React 19,
TypeScript, Tailwind CSS y Firebase Admin SDK. La Semana 9 implementa el
catálogo; la Semana 10 añade autenticación y autorización mediante Firebase;
la Semana 11 implementa las reglas de dominio y préstamos transaccionales.

## Descripción, alcance y arquitectura

Proyecto académico de catálogo y gestión de préstamos bibliotecarios. Incluye
una interfaz web, una API HTTP documentada, autenticación Firebase, persistencia
en Firestore y reglas de dominio reutilizables. Los servicios privilegiados de
Firebase se ejecutan solo en servidor; navegador y futura app móvil consumen
HTTP y no acceden directamente a Firestore.

Flujo de una petición protegida:

1. Un cliente envía un ID token Firebase como `Authorization: Bearer <idToken>`
   (la web usa una cookie de sesión `httpOnly` en páginas y acciones).
2. `lib/guard.ts` verifica el token con Firebase Admin; el rol procede del
   custom claim verificado, nunca del cuerpo.
3. Las rutas de `app/api/**/route.ts` validan entrada mediante los esquemas
   compartidos de `lib/schemas.ts`.
4. `lib/data/` accede a Firestore y `lib/domain/loan-rules.ts` centraliza las
   transiciones y restricciones de inventario.
5. Las operaciones críticas de préstamos y portadas usan transacciones de
   Firestore; `lib/http.ts` normaliza los errores HTTP.

| Capa | Responsabilidad |
|---|---|
| `app/` | App Router, handlers API, páginas y acciones del servidor |
| `components/` | UI reutilizable; componentes cliente solo para interacción |
| `lib/services/` | Integración server-only con Firebase Auth/Admin e imágenes |
| `lib/data/` | Consultas y escrituras Firestore |
| `lib/domain/` | Reglas de negocio puras y probadas |
| `lib/schemas.ts` | Validación runtime con Zod |
| `scripts/` | Seed, administración de roles, smoke y reset de demo |
| `tests/` | Pruebas unitarias, de rutas y de contrato OpenAPI |

### Tecnologías y versiones

Versiones declaradas en `package.json`; el lockfile fija la resolución instalada:

| Tecnología | Versión declarada |
|---|---:|
| Next.js | `^16.4.3` |
| React / React DOM | `^19.3.1` |
| Firebase Admin | `^13.10.0` |
| Zod | `^4.6.7` |
| Sharp | `^0.35.5` |
| Tailwind CSS | `^4.3.3` |
| TypeScript | `^5.9.3` |
| pnpm | `10.34.8` (`packageManager`) |
| Vitest | `^5.0.5` |
| tsx | `^4.23.15` |
| ESLint | `^9.39.2` |
| OpenAPI Schema Validator | `^2.11.0` (desarrollo) |

Requisitos: Node.js `>=22.12` para Vitest 5, Corepack, pnpm `10.34.8` y un
proyecto Firebase para Auth/Firestore reales. El entorno local de esta revisión
tenía Node.js `24.20.0`; las pruebas unitarias no requieren Firebase remoto.

### Catálogo de ejemplo

`pnpm seed` añade, sin sobrescribir documentos existentes, diez títulos de
ejemplo: *Cien años de soledad*, *Don Quijote de la Mancha*, *El amor en los
tiempos del cólera*, *Rayuela*, *Pedro Páramo*, *La ciudad y los perros*,
*Clean Code*, *Introduction to Algorithms*, *The Pragmatic Programmer* y
*Don't Make Me Think*. Sus categorías sembradas son Novela, Clásicos,
Tecnología y Diseño. El seed no crea cuentas.

## Requisitos locales

- Node.js 24 (Vitest 5 requiere Node.js 22.12 o superior).
- Corepack y pnpm 10.34.8, fijado en `package.json`.
- Un proyecto Firebase propio para usar Firebase Authentication o Firestore.

Instala las dependencias y configura el entorno local:

```powershell
corepack pnpm install
Copy-Item .env.example .env
```

Edita `.env` con el ID de proyecto, correo y clave privada de una cuenta de
servicio, además de la clave web de tu proyecto. `.env.example` solo enumera
los nombres requeridos y no contiene credenciales. Nunca compartas ni
confirmes `.env` o credenciales de servicio.

## Comandos

```powershell
corepack pnpm dev
corepack pnpm dev:lan
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm test
```

Para abrir el servidor de desarrollo desde un teléfono en la misma red, ejecuta
`corepack pnpm dev:lan`, averigua la IP LAN del PC y usa
`http://<IP_LAN_DEL_PC>:3000` desde el teléfono; `localhost` en el teléfono
apunta al propio teléfono. Ambos dispositivos deben estar en la misma Wi-Fi.
Permite Node.js o el puerto TCP 3000 en el firewall de Windows para redes
privadas y comprueba que el router no tenga aislamiento de clientes. No abras
ese puerto a Internet; usa HTTPS para la API desplegada.

Los endpoints de autenticación son `POST /api/auth/register`,
`POST /api/auth/login`, `POST /api/auth/refresh` y `GET /api/auth/me`. El
catálogo `GET /api/books` y `GET /api/books/:id` requiere
`Authorization: Bearer <idToken>`.

## Inventario de endpoints HTTP

La especificación completa está en `GET /api/openapi.json` y Swagger UI en
`GET /api/docs`. Las rutas públicas se identifican como **públicas**; las demás
requieren ID token en Bearer y verificación del rol en el servidor.

| Método | Ruta | Autenticación | Rol autorizado | Propósito | HTTP relevante |
|---|---|---|---|---|---|
| GET | `/api/health` | Pública | Cualquiera | Estado del servicio | 200 |
| POST | `/api/auth/register` | Pública | Crea siempre `student` | Registro y tokens | 201, 400, 409, 502 |
| POST | `/api/auth/login` | Pública | Cualquiera | Iniciar sesión y emitir tokens | 200, 400, 401, 403, 429, 502 |
| POST | `/api/auth/refresh` | Pública | Cualquiera con refresh token | Renovar tokens | 200, 400, 401, 429, 502 |
| GET | `/api/auth/me` | Bearer | Student o librarian | Usuario autenticado | 200, 401 |
| GET | `/api/books` | Bearer | Student o librarian | Catálogo, búsqueda/filtros, `serverTime` | 200, 400, 401 |
| GET | `/api/books/{id}` | Bearer | Student o librarian | Detalle de libro | 200, 401, 404 |
| GET | `/api/books/{id}/cover` | Pública | Cualquiera | Descargar bytes de portada | 200, 404 |
| PUT | `/api/books/{id}/cover` | Bearer | Solo librarian | Validar y guardar portada | 200, 400, 401, 403, 404, 413 |
| GET | `/api/loans` | Bearer | Student (propios) o librarian (todos) | Listar préstamos y `serverTime` | 200, 400, 401 |
| POST | `/api/loans` | Bearer | Solo student | Solicitud de préstamo idempotente | 201, 200, 400, 401, 403, 404, 409 |
| GET | `/api/loans/{id}` | Bearer | Student (propio) o librarian | Consultar préstamo | 200, 401, 404 |
| PATCH | `/api/loans/{id}` | Bearer | Solo librarian | Aprobar, rechazar o devolver | 200, 400, 401, 403, 404, 409 |
| GET | `/api/openapi.json` | Pública | Cualquiera | Especificación OpenAPI 3.1 | 200 |
| GET | `/api/docs` | Pública | Cualquiera | Swagger UI HTML | 200 |

Los cuerpos de autenticación, préstamo, acción y portada se validan con Zod.
Los errores JSON usan `{ error: { code, message, details? } }`. Entre los
códigos comunes están `VALIDATION_ERROR` (400), `UNAUTHENTICATED` /
`INVALID_CREDENTIALS` (401), `FORBIDDEN` (403), `NOT_FOUND` (404) y conflictos
de negocio (409). Login unifica las credenciales inválidas para no enumerar
cuentas. `ALREADY_ACTIVE` explica que el estudiante ya tiene un préstamo activo
del libro solicitado.

### Filtros, sincronización e idempotencia

- Catálogo: `q` busca sin distinguir diacríticos en título/autor; `category`
  filtra categoría; `updatedSince` es ISO 8601 y selecciona `updatedAt` mayor
  que la marca recibida. El handler captura `serverTime` antes de consultar.
- Préstamos: `status` admite `requested`, `approved`, `rejected` o `returned`.
- Cada solicitud tiene `clientRequestId`; el ID documental deriva del UID y
  esta clave. Repetir la clave devuelve el mismo préstamo (`created: false`,
  HTTP 200); una nueva solicitud responde 201.
- Solicitar no descuenta ejemplares; aprobar descuenta dentro de una transacción.
  Los mocks de test no prueban concurrencia real de Firebase.

## Préstamos

Todos los endpoints de préstamos requieren `Authorization: Bearer <idToken>`.
`GET /api/loans?status=requested` lista los préstamos permitidos para el usuario
autenticado e incluye `serverTime`; `POST /api/loans` acepta `bookId` y
`clientRequestId` (una clave idempotente) y crea solicitudes en estado
`requested`. Repetir una clave para el mismo usuario devuelve el préstamo
existente con `created: false` y estado 200, sin crear otro documento.
`GET /api/loans/:id` devuelve 404 si un estudiante intenta acceder a un préstamo
ajeno. `PATCH /api/loans/:id` acepta `approve`, `reject` o `return` y solo está
disponible para bibliotecarios.

Las transiciones y reglas puras del dominio viven en
`lib/domain/loan-rules.ts`, compartibles con la aplicación cliente. Las
solicitudes y transiciones persisten en transacciones de Firestore. La solicitud
no reserva ni descuenta inventario; aprobar descuenta una copia y devolver la
repone, actualizando `books.updatedAt` en la misma transacción.
La prueba de idempotencia usa un adaptador secuencial simulado: no acredita
concurrencia real ni sustituye una validación contra Firebase Emulator o un
proyecto Firebase de pruebas.

## Portadas de libros

`GET /api/books/:id/cover` es público y devuelve los bytes originales. Las URLs
con `?v=<coverVersion>` usan caché inmutable solo cuando la versión coincide con
la vigente; sin versión o con una versión antigua deben revalidarse.
`PUT /api/books/:id/cover` requiere token Bearer de bibliotecario y JSON con
`contentType` (`image/jpeg`, `image/png` o `image/webp`) y `data` Base64.
El servidor limita el cuerpo, verifica el MIME real y decodifica la imagen
localmente antes de almacenarla en Firestore. No se suben imágenes a servicios
externos ni se exponen directamente documentos de Firestore. La escritura de
`bookCovers/{bookId}`, `coverVersion` y `updatedAt` se hace en una transacción.

La decodificación utiliza Sharp/libvips como dependencia directa, con límite de
20 megapíxeles. A diferencia de una comprobación solo de magic bytes o
`metadata()`, su decodificación local rechaza datos truncados o malformados sin
transformar los bytes originales.

## Modelo de datos en Firestore

| Colección | Documento / campos relevantes | Uso y consistencia |
|---|---|---|
| `books` | `id`, `title`, `author`, `category`, `year`, `description`, `totalCopies`, `availableCopies`, `coverUrl`, `coverVersion`, `updatedAt` | Catálogo; cambios de inventario/portada actualizan `updatedAt` para sincronización incremental. |
| `bookCovers` | documento `{bookId}` con `data` Base64 y `contentType` | Conserva los bytes originales codificados; datos y versión del libro se escriben atómicamente. |
| `loans` | `id`, `bookId`, `bookTitle`, `userId`, `userEmail`, `userName`, `status`, `clientRequestId`, `requestedAt`, `resolvedAt`, `dueDate`, `returnedAt`, `updatedAt` | Solicitudes y estado actual; listado por `requestedAt` descendente. |
| `users` | documento `{uid}` con `email`, `displayName`, `role`, `createdAt` | Perfil sincronizado con Auth; los claims verificados son la autoridad de autorización. |
| `loanLocks` | clave usuario/libro y referencia a solicitud activa | Exclusión transaccional para impedir más de un préstamo activo del mismo libro por usuario. |

La máquina de estados es exactamente `requested → approved → returned` o
`requested → rejected`. Solo librarian resuelve o devuelve. Aprobar fija
`resolvedAt`, `dueDate` a 14 días, `returnedAt: null` y decrementa
`availableCopies`; rechazar no toca inventario; devolver fija `returnedAt` y
repone una unidad sin superar `totalCopies`. `requested` y `approved` cuentan
como activos. Un estudiante solo ve sus préstamos; solicitar un ID ajeno
responde 404 para no revelar su existencia.

La futura app móvil debe consumir esta API por HTTPS: Admin SDK evita exponer
privilegios del servidor, la API aplica roles y reglas de negocio, y las reglas
de Firestore niegan el acceso directo al cliente.

## Roles y matriz de permisos

Los roles provienen de custom claims firmados por Firebase y solo se aceptan
después de verificar el token en el servidor. El registro público crea siempre
un estudiante; ningún campo enviado por el cliente puede elevar el rol.
El claim estándar es `student` o `librarian`; por compatibilidad, claims
administrativos verificados `admin`, `administrator`, `administrador` y
`bibliotecario` se interpretan como `librarian`. El claim firmado es la fuente
preferente. Para cuentas antiguas sin claim reconocido se usa como respaldo el
campo `role` del documento `users/{uid}`, leído exclusivamente por Firebase
Admin; las reglas deniegan escritura directa desde clientes. Si ninguna fuente
contiene un rol permitido, se deniega el acceso y no se degrada silenciosamente
a estudiante. Cambia roles solo con `pnpm set-role` y credenciales Admin en un
entorno confiable: el comando sincroniza claim y perfil y revoca refresh
tokens. Después, cierra sesión e inicia sesión otra vez para emitir una cookie
con el rol actualizado.

| Operación | Sin sesión | Estudiante | Bibliotecario |
| --- | --- | --- | --- |
| Registro público | Permitido; crea `student` | Permitido; crea `student` | Permitido; crea `student` |
| Login y refresh | Permitido | Permitido | Permitido |
| `GET /api/auth/me` | 401 | Permitido | Permitido |
| Catálogo y detalle de libros | 401 | Permitido | Permitido |
| Listar préstamos | 401 | Solo sus préstamos | Todos, con filtro opcional por estado |
| Solicitar préstamo | 401 | Permitido | 403 |
| Consultar préstamo individual | 401 | Solo sus préstamos (ajenos responden 404) | Permitido |
| Aprobar, rechazar o devolver préstamo | 401 | 403 | Permitido |
| `PUT` de portada | 401 | 403 | Permitido |
| Cambiar rol | No disponible públicamente | Prohibido | Solo mediante herramienta administrativa |


## Crear el primer bibliotecario de forma local

Configura las credenciales administrativas únicamente en el `.env` local
ignorado por Git: `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL` y
`FIREBASE_PRIVATE_KEY`. Firebase Authentication debe estar habilitado en el
proyecto. El script de administración no requiere la API key web y nunca
escribe la contraseña en el código fuente o en argumentos del proceso.

En PowerShell, desde la raíz del repositorio, solicita la contraseña de forma
oculta y pásala al proceso solo mediante una variable temporal:

```powershell
$securePassword = Read-Host "Contraseña de Firebase (mínimo 6 caracteres)" -AsSecureString
$passwordPointer = [IntPtr]::Zero
try {
    $passwordPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
    $env:LIBRARY_ADMIN_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($passwordPointer)
    corepack pnpm create-user -- bibliotecario@tu-dominio.com "Nombre Bibliotecario" librarian
} finally {
    Remove-Item Env:LIBRARY_ADMIN_PASSWORD -ErrorAction SilentlyContinue
    if ($passwordPointer -ne [IntPtr]::Zero) {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($passwordPointer)
    }
    $securePassword.Dispose()
}
```

El comando crea o actualiza la cuenta, fija el custom claim `role: librarian`,
sincroniza `users/{uid}` y revoca los refresh tokens previos. Si Firebase
rechaza la operación, verifica la configuración y permisos de la cuenta de
servicio; no compartas ni imprimas el `.env`. Tras cambiar el rol, las sesiones
anteriores quedan revocadas: cierra sesión y vuelve a iniciarla para recibir un
ID token y una cookie de sesión nuevos con los claims vigentes. Los clientes
móviles deben renovar el ID token y volver a autenticarse si el refresh es
rechazado; no basta con cambiar el rol guardado localmente.

Para modificar el rol de una cuenta existente:

```powershell
corepack pnpm set-role -- bibliotecario@tu-dominio.com librarian
```

`create-user` y `set-role` requieren conexión y credenciales reales. Las pruebas
unitarias simulan Admin SDK/Auth REST y no demuestran conectividad con Firebase
remoto.

## Reglas de Firestore

`firestore.rules` deniega el acceso directo desde clientes. Publícala
manualmente en Firebase Console, en **Firestore Database → Rules**, cuando
tengas acceso al proyecto. Esta configuración no publica reglas ni confirma
una conexión con Firebase.

Para publicarlas: abre Firebase Console, selecciona el proyecto correcto,
entra en **Firestore Database → Rules**, reemplaza las reglas por el contenido
de `firestore.rules`, revisa que todas las lecturas y escrituras de clientes
queden denegadas y pulsa **Publish**. Las rutas del servidor usan Firebase Admin
y no dependen de reglas de cliente. No publiques reglas permisivas para hacer
funcionar la API.

## Sitio web

La aplicación web incluye inicio/registro/cierre de sesión, catálogo con
búsqueda y categoría, detalle, solicitudes y gestión de préstamos, además de
subida de portadas para bibliotecarios. La sesión web usa una cookie Firebase
Admin `httpOnly`; ni el ID token ni el refresh token se guardan en `localStorage`
ni se envían a componentes cliente. Las páginas y Server Actions validan la
sesión y el rol en el servidor, además de las protecciones de las API.

Para usar los flujos con datos reales, configura en el `.env` local las
credenciales Admin y `FIREBASE_WEB_API_KEY`, habilita Email/Password en Firebase
Authentication, crea la base de Firestore y ejecuta `corepack pnpm seed`.
Después inicia con `corepack pnpm dev`. Crear el primer bibliotecario requiere
el procedimiento local descrito arriba. Sin configuración Firebase funcionan
la compilación, los tests y las vistas públicas; la autenticación real y las
lecturas/escrituras del catálogo y préstamos no pueden validarse.

## OpenAPI

La documentación interactiva está en `GET /api/docs` y el contrato JSON en
`GET /api/openapi.json`. El contrato se construye en runtime mediante
`lib/openapi.ts`; sus esquemas de petición se derivan directamente de los
esquemas Zod 4 existentes con `z.toJSONSchema` y no dependen de una copia manual
de sus validaciones. La dependencia de desarrollo
`@seriousme/openapi-schema-validator` valida el documento OpenAPI 3.1 en la
suite. La prueba también descubre métodos exportados en `app/api/**/route.ts`
y falla si una operación nueva no se documenta o si queda una ruta obsoleta.
Swagger UI se sirve desde jsDelivr, versión fijada `swagger-ui-dist@5.17.14`;
si el CDN no está disponible, el endpoint JSON permanece servido por la API.

## Pruebas de humo y reset de demostración

`pnpm smoke` ejecuta 41 comprobaciones contra la API en ejecución y verifica
también Auth y Firestore reales: exige el catálogo de los 10 libros sembrados,
comprueba roles, préstamos, inventario, idempotencia, registro y portadas, y
limpia en `finally` únicamente las cuentas, préstamos, libros, bloqueos y
portadas que creó con identificadores aleatorios. No inicia la API ni siembra
libros por sí solo. Antes de usarlo, configura en `.env`
`FIREBASE_TEST_PROJECT_ID` con el mismo ID que `FIREBASE_PROJECT_ID`, usa un
proyecto Firebase dedicado no productivo, habilita Email/Password y arranca la
API local. La URL se puede cambiar con `BASE_URL`; un host remoto requiere
además `LIBRARY_SMOKE_ALLOW_REMOTE=I_UNDERSTAND_THIS_WRITES_TEST_DATA`. No uses
ese permiso para producción. Los tokens y contraseñas aleatorias solo viven en
memoria y no se imprimen.

`pnpm reset-demo` es **destructivo**: elimina todos los documentos de `loans`,
`loanLocks` y `bookCovers` del proyecto seleccionado y restaura el inventario,
`coverVersion` y `updatedAt` de todos los libros. No modifica cuentas ni
documentos `users/{uid}`. Antes de permitirlo, requiere que
`FIREBASE_DEMO_PROJECT_ID` coincida exactamente con `FIREBASE_PROJECT_ID`, que
el ID no parezca de producción y dos confirmaciones interactivas; no tiene una
opción automática/no interactiva. Inspecciona el proyecto seleccionado y
asegúrate de que es un Firebase de demostración antes de confirmar. El script
no se ejecuta automáticamente ni se ha ejecutado durante esta implementación.

Comandos manuales en PowerShell, desde la raíz:

```powershell
# 1. Siembra los 10 libros. Sin --reset, conserva libros existentes.
corepack pnpm seed

# 2. En una terminal, inicia la API local:
corepack pnpm dev

# 3. En otra terminal, configura FIREBASE_TEST_PROJECT_ID en .env para el
#    proyecto dedicado de pruebas y ejecuta las 41 comprobaciones:
$env:BASE_URL = "http://localhost:3000"
corepack pnpm smoke
Remove-Item Env:BASE_URL -ErrorAction SilentlyContinue

# 4. Solo tras inspeccionar y confirmar que .env apunta al proyecto demo:
#    establece FIREBASE_DEMO_PROJECT_ID en .env y ejecuta el reset interactivo.
corepack pnpm reset-demo
```

`pnpm seed -- --reset` también sobrescribe los documentos de los 10 libros
sembrados, por lo que no debe usarse para conservar cambios de inventario o
portadas. `pnpm smoke` modifica temporalmente el proyecto de pruebas, pero
verifica su limpieza al finalizar; si Firebase impide alguna limpieza, el
informe marca el error y el proceso termina con código distinto de cero.

## Preparar el despliegue en Vercel (sin desplegar)

El repositorio está preparado con `vercel.json`: esquema oficial,
`framework: "nextjs"` y `outputDirectory: ".next"`. Es compatible con
`next.config.ts`, que activa `cacheComponents` y no configura `output: "export"`
ni una carpeta estática `dist`. Mantén **Framework Preset: Next.js** en Vercel;
no selecciones `dist` ni un preset de sitio estático. La dependencia
`firebase-admin` permanece en la versión mayor 13 (`^13.10.0`); no cambies a la
14. Selecciona el runtime Node.js compatible ofrecido por Vercel (Node 22.x es
la opción conservadora); Next.js 16 requiere Node >=20.9 y Firebase Admin 13
es compatible con Node.js del runtime server-side. No configures rutas de API
como Edge Runtime.

### Variables de producción

La aplicación requiere exactamente estas cuatro variables de entorno:

- `FIREBASE_PROJECT_ID`
- `FIREBASE_WEB_API_KEY`
- `FIREBASE_CLIENT_EMAIL`
- `FIREBASE_PRIVATE_KEY`

En **Vercel → Project → Settings → Environment Variables**, añade cada nombre
con su valor real para **Production**. Los valores no deben ir en el código,
GitHub, `vercel.json` ni `.env.example`. La API key web es una configuración
Firebase de cliente (no una clave Admin); la clave privada y el correo de
servicio son secretos sensibles. Concede a la cuenta de servicio solo los
permisos requeridos para Firebase Auth y Firestore.

Para `FIREBASE_PRIVATE_KEY`, copia el campo `private_key` del JSON de la cuenta
de servicio y pega **solo el valor**, sin las comillas externas del JSON ni el
objeto completo. Conserva los `\n` literales del JSON (barra invertida seguida
de `n`) o pega el PEM como saltos de línea reales. El servidor normaliza la
forma escapada. Nunca pegues ni registres el JSON completo de la cuenta de
servicio.

### Publicar el código y conectar Vercel manualmente

1. Antes de añadir archivos, comprueba `git status` y `git ls-files`; no hagas
   `git add -f` de `.env`, `.env.local`, archivos JSON de cuentas de servicio,
   `.pem` o `.key`. `.gitignore` los excluye. Revisa el diff antes de cada
   commit y verifica que los secretos no aparecen en su contenido.
2. Cuando decidas publicar, crea un repositorio privado en GitHub o usa el
   repositorio autorizado, confirma solo código revisado y sin archivos
   secretos y ejecuta manualmente `git push` a la rama elegida. Este proyecto
   no ha sido enviado ni publicado por este procedimiento.
3. En Vercel, elige **Add New → Project**, importa ese repositorio, deja
   **Framework Preset: Next.js** y revisa que el directorio raíz sea el del
   proyecto. No configures `dist` ni exportación estática.
4. Añade las cuatro variables anteriores únicamente al entorno **Production**
   (añade Preview por separado solo si apuntas a un Firebase de pruebas).
5. Revisa el proyecto Firebase y las reglas antes de desplegar. Pulsa
   **Deploy** manualmente. No se ha creado un proyecto Vercel ni se ha iniciado
   un despliegue.
6. Si cambias variables en Vercel, guarda los cambios y ejecuta **Redeploy**
   del deployment deseado: las variables se incorporan al crear un nuevo
   deployment, no actualizan uno ya construido.

Cuando autorices la publicación, un flujo manual de revisión desde PowerShell
puede ser:

```powershell
git status --short
git ls-files
git diff --check
git add .gitignore .env.example README.md vercel.json app components lib scripts tests `
  package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.json next.config.ts `
  next-env.d.ts postcss.config.mjs eslint.config.mjs vitest.config.ts firestore.rules
git diff --cached --name-only
git diff --cached --check
git diff --cached
# Solo después de revisar el diff y confirmar que no hay secretos:
git commit -m "Prepare Library for Vercel"
git push origin <RAMA_AUTORIZADA>
```

No incluyas `.env`, `.env.local`, archivos de cuenta de servicio ni el PDF de
la guía salvo que tengas autorización para redistribuirlo. En el estado actual
del workspace muchos archivos de la aplicación aparecen como no rastreados;
`git ls-files` muestra qué contiene el commit existente, así que revisa
explícitamente la lista preparada antes de publicar. No se han añadido archivos
al índice, creado commits ni ejecutado `git push`.

### Comprobaciones posteriores al despliegue

Cuando exista un dominio de producción, sustituye `<DOMINIO_DE_PRODUCCION>` por
el dominio real de Vercel (no está asignado aquí) y verifica:

```powershell
$base = "https://<DOMINIO_DE_PRODUCCION>"
Invoke-RestMethod "$base/api/health"

# Credenciales deliberadamente incorrectas: debe responder HTTP 401
# con error.code INVALID_CREDENTIALS. No uses una cuenta real en este paso.
try {
    $response = Invoke-WebRequest "$base/api/auth/login" -Method Post `
      -ContentType "application/json" `
      -Body '{"email":"invalid-smoke@example.invalid","password":"not-a-real-password"}'
    throw "Se esperaba 401 INVALID_CREDENTIALS; se recibió HTTP $($response.StatusCode)."
} catch {
    $httpResponse = $_.Exception.Response
    if (-not $httpResponse) { throw }
    $status = [int]$httpResponse.StatusCode
    $reader = [IO.StreamReader]::new($httpResponse.GetResponseStream())
    try { $errorBody = $reader.ReadToEnd() | ConvertFrom-Json } finally { $reader.Dispose() }
    if ($status -ne 401 -or $errorBody.error.code -ne "INVALID_CREDENTIALS") {
        throw "Login de prueba incorrecto: HTTP $status, código $($errorBody.error.code)."
    }
    "Credenciales deliberadamente incorrectas: HTTP 401 INVALID_CREDENTIALS."
}

# OpenAPI debe estar disponible y docs debe devolver HTML.
Invoke-WebRequest "$base/api/openapi.json" -Method Get
Invoke-WebRequest "$base/api/docs" -Method Get
```

Para verificar el login correcto sin imprimir el token, introduce una cuenta
de prueba real del proyecto Firebase configurado:

```powershell
$email = Read-Host "Correo de prueba Firebase"
$securePassword = Read-Host "Contraseña" -AsSecureString
$passwordPointer = [IntPtr]::Zero
$password = $null
$idToken = $null
try {
    $passwordPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
    $password = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($passwordPointer)
    $login = Invoke-RestMethod "$base/api/auth/login" -Method Post `
      -ContentType "application/json" `
      -Body (@{ email = $email; password = $password } | ConvertTo-Json)
    $idToken = $login.tokens.idToken
    $headers = @{ Authorization = "Bearer $idToken" }
    $me = Invoke-RestMethod "$base/api/auth/me" -Headers $headers
    if ($me.user.email -ne $email) { throw "La identidad autenticada no coincide." }
    "Login verificado; rol: $($me.user.role). No se imprimió el token."
} finally {
    $password = $null
    $idToken = $null
    Remove-Variable login, headers, me -ErrorAction SilentlyContinue
    if ($passwordPointer -ne [IntPtr]::Zero) {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($passwordPointer)
    }
    $securePassword.Dispose()
}
```

Nunca incluyas una contraseña o un token en una captura, log, issue ni comando
guardado en el historial. No hay dominio de producción ni cuenta remota
verificados en esta sesión.

### Diagnóstico y recuperación

- **Firebase Authentication devuelve `CONFIGURATION_NOT_FOUND` o `OPERATION_NOT_ALLOWED`:**
  en Firebase Console selecciona el mismo proyecto que `FIREBASE_PROJECT_ID`,
  abre **Authentication → Get started** si aún no se inicializó, y en
  **Authentication → Sign-in method** habilita **Email/Password** (correo y
  contraseña). La aplicación no puede habilitar este proveedor por sí misma;
  verifica también que `FIREBASE_WEB_API_KEY` sea de ese proyecto. No confundas
  este problema de configuración con `INVALID_CREDENTIALS` (401), que indica
  credenciales de usuario no válidas.
- **`SERVICE_DISABLED`:** habilita en Google Cloud el servicio/API que indica
  el error para el proyecto correcto (Firebase Authentication/Identity
  Toolkit para el acceso REST o Cloud Firestore API para Firestore) y espera a
  que se propague. No es un error de reglas de Firestore.
- **`PERMISSION_DENIED`:** para Firebase Admin, comprueba que
  `FIREBASE_CLIENT_EMAIL` pertenece al proyecto seleccionado y que su cuenta de
  servicio tiene los permisos IAM necesarios para Auth/Firestore. Las reglas
  de `firestore.rules` deniegan intencionalmente el acceso de SDKs cliente;
  Admin SDK usa IAM y esas reglas no deben abrirse para solucionar permisos
  de servidor. Un error de reglas de cliente se corrige revisando la operación
  cliente prevista, no haciendo públicos todos los documentos.
- **`CONFIG_ERROR`:** el servidor enumera solo los nombres de configuración
  requeridos y nunca debe mostrar sus valores. Comprueba exactamente
  `FIREBASE_PROJECT_ID`, `FIREBASE_WEB_API_KEY`, `FIREBASE_CLIENT_EMAIL` y
  `FIREBASE_PRIVATE_KEY` en el entorno del deployment, sin copiar valores a
  logs o issues.
- **Build falla o se intenta servir `dist`:** confirma **Framework Preset:
  Next.js**, `outputDirectory: .next`, que el comando de build siga siendo
  `next build --turbopack` y que no se haya añadido `output: "export"` a
  `next.config.ts`. Corrige la configuración y crea un deployment nuevo.
- **`DEPLOYMENT_NOT_FOUND` o dominio que no llega al deployment:** en Vercel
  confirma el equipo/proyecto, abre **Deployments** y comprueba que el
  deployment esperado terminó en **Ready** y corresponde a la rama/commit de
  producción. En **Settings → Domains**, confirma que el dominio está añadido
  a ese proyecto y asignado al entorno Production; sigue la verificación DNS
  que Vercel muestra. Prueba primero el dominio `.vercel.app` del deployment
  Ready. No inventes ni supongas un dominio asignado.
- **`CONFIG_ERROR` / faltan variables:** compara solo los nombres de las cuatro
  variables en Vercel con esta lista; selecciona Production y haz **Redeploy**.
  No publiques sus valores para diagnosticar.
- **`invalid_grant`, PEM inválido o credenciales Admin rechazadas:** vuelve a
  introducir `FIREBASE_PRIVATE_KEY` sin comillas JSON externas, conservando
  `\n` literal o saltos de línea reales; confirma proyecto, correo de servicio
  y vigencia de la cuenta. Si la clave fue expuesta, revócala en Google Cloud,
  crea una nueva y actualiza Vercel antes de redeploy.
- **Permiso denegado en Firestore/Auth:** comprueba que las APIs estén
  habilitadas y que la cuenta de servicio tenga IAM suficiente en el mismo
  proyecto; Firebase Admin no se desbloquea haciendo públicas las reglas de
  Firestore.
- **`FUNCTION_INVOCATION_FAILED` o 500:** inspecciona logs de Functions en
  Vercel sin copiar valores de entorno. Verifica variables, runtime Node.js
  (no Edge), y vuelve a desplegar tras corregir configuración o código.
- **`/api/health` funciona pero login devuelve 502:** revisa que
  `FIREBASE_WEB_API_KEY` corresponda al proyecto y que Email/Password esté
  habilitado en Firebase Authentication. Un 401 `INVALID_CREDENTIALS`
  representa credenciales de usuario incorrectas y no un fallo de despliegue.
- **Cambios de entorno no tienen efecto:** comprueba el entorno (Production vs
  Preview) y realiza **Redeploy**; no repitas una operación destructiva como
  `reset-demo` para diagnosticar.
- **`ERR_PNPM_IGNORED_BUILDS`:** revisa que la versión de pnpm sea la fijada por
  `packageManager`, inspecciona `pnpm-workspace.yaml` (`allowBuilds`) y ejecuta
  `pnpm ignored-builds` para identificar el paquete cuyo script fue bloqueado.
  Aprueba scripts solo después de revisar el paquete; configura explícitamente
  el permiso de ese paquete con la sintaxis admitida por esa versión de pnpm y
  repite la instalación/build. No habilites todos los scripts de dependencias
  indiscriminadamente.
- **Firebase Admin o ESM falla al iniciar:** conserva Firebase Admin 13 y el
  runtime Node.js, no Edge. Revisa los logs del deployment y compatibilidad de
  Node antes de cambiar dependencias; el build local no acredita que Firebase
  remoto esté configurado o que una credencial tenga permisos.
- **Swagger UI en blanco:** abre `/api/openapi.json` por separado. Si entrega
  JSON válido y HTTP 200, pero Swagger UI no carga, comprueba en el navegador
  la conectividad/política de red del CDN jsDelivr. El HTML de `/api/docs` carga
  los recursos desde ese CDN; el endpoint JSON de la API es independiente y
  sigue siendo la fuente de la especificación.
- **OpenAPI no incluye una ruta/método nuevo:** ejecuta `pnpm test`. El test
  `tests/openapi.test.ts` descubre exports HTTP de cada `app/api/**/route.ts`,
  normaliza `[id]` a `{id}` y compara el inventario en ambos sentidos; añade
  la operación al documento en `lib/openapi.ts` y corrige el contrato hasta
  que pase, sin excluir rutas del test.
- **Tipos `RouteContext` / `PageProps` desactualizados:** ejecuta
  `pnpm typecheck`; el script ejecuta `next typegen` antes de `tsc --noEmit`.
  No omitas la generación de tipos ni reemplaces los tipos con `any`.
- **`ALREADY_ACTIVE` al solicitar un libro:** es un conflicto de negocio HTTP
  409, no un fallo de configuración: el usuario ya tiene un préstamo
  `requested` o `approved` para ese mismo libro. Consulta sus préstamos y
  espera a que el anterior sea `rejected` o `returned` antes de solicitarlo de
  nuevo.
- **Rol antiguo o `UNAUTHENTICATED` tras cambiar permisos:** `set-role` fija
  el custom claim y revoca refresh tokens. El usuario debe cerrar sesión y
  volver a iniciar sesión para obtener credenciales nuevas; las cookies de
  sesión existentes también se invalidan al verificarse con revocación. Una
  app móvil debe renovar/autenticar de nuevo, no confiar en el rol cacheado.

### App móvil futura

Configura en el proyecto Expo `EXPO_PUBLIC_API_URL` con la URL HTTPS real de la
API (por ejemplo `https://<DOMINIO_DE_PRODUCCION>`); nunca apuntes la app móvil
directamente a Firestore ni coloques credenciales Admin en variables
`EXPO_PUBLIC_*`. Tras cambiarla, reinicia Expo limpiando caché:

```powershell
npx expo start -c
```

## Comandos de trabajo y comprobación

`pnpm test` ejecuta Vitest. La suite cubre esquemas y errores HTTP,
autenticación/guards, sesión y acciones web, reglas puras de préstamos,
adaptadores de datos aislados, rutas de API, validación/almacenamiento de
portadas y contrato OpenAPI. La cobertura automatizada no reemplaza la prueba
smoke con Firebase real; la ejecución de esta documentación fue local y no
incluyó ese smoke.

Ejecutados desde la raíz, con pnpm `10.34.8`:

| Objetivo | Comando |
|---|---|
| Desarrollo local | `pnpm dev` |
| Desarrollo accesible por LAN | `pnpm dev:lan` |
| Generar datos de catálogo | `pnpm seed` |
| Crear usuario administrativo | `pnpm create-user -- <correo> "<nombre>" <student\|librarian>` |
| Cambiar rol | `pnpm set-role -- <correo> <student\|librarian>` |
| Smoke contra Firebase y API disponibles | `pnpm smoke` |
| Reset destructivo de demo | `pnpm reset-demo` |
| Typecheck (incluye `next typegen`) | `pnpm typecheck` |
| Suite de pruebas | `pnpm test` |
| Lint | `pnpm lint` |
| Build de producción | `pnpm build` |

No se deben pasar contraseñas en los argumentos de `create-user`; usa el
procedimiento PowerShell interactivo de la sección de primer bibliotecario.
`pnpm smoke` requiere un Firebase dedicado y la API en ejecución. `pnpm
reset-demo` es destructivo y exige doble confirmación interactiva; **nunca lo
ejecutes contra producción**.

## Rotación si se filtran credenciales

1. Revoca o deshabilita de inmediato la clave de cuenta de servicio filtrada en
   Google Cloud IAM, y genera una clave nueva si el servicio todavía la necesita.
2. Cambia la contraseña de las cuentas potencialmente afectadas y revoca sus
   refresh tokens. Actualiza custom claims/roles mediante la herramienta
   administrativa y fuerza una nueva sesión.
3. Actualiza `FIREBASE_PRIVATE_KEY` y, si procede, otras variables en Vercel y
   entornos locales seguros; haz Redeploy. No publiques los valores nuevos.
4. Revisa los logs/auditoría de Google Cloud y Firebase, limita permisos IAM,
   y busca el secreto en GitHub, artefactos y logs. Si estuvo en Git, no borres
   evidencia ni reescribas historia sin autorización: revoca primero y acuerda
   la respuesta al incidente.
5. Comprueba `git status`, `git ls-files` y el diff antes de publicar cambios.
   `.env`, `.env.local` y archivos de servicio no deben entrar al repositorio.

## Referencias técnicas y bibliográficas

- Documentación local de la versión instalada de Next.js:
  `node_modules/next/dist/docs/` (incluye App Router, Route Handlers,
  autenticación y Cache Components).
- Firebase Admin SDK: [configuración del Admin SDK](https://firebase.google.com/docs/admin/setup)
  y [gestión de Firebase Authentication en servidor](https://firebase.google.com/docs/auth/admin).
- [Firebase Authentication](https://firebase.google.com/docs/auth) y
  [Firebase Auth REST API](https://firebase.google.com/docs/reference/rest/auth).
- [Transacciones y escrituras atómicas de Cloud Firestore](https://firebase.google.com/docs/firestore/manage-data/transactions).
- [Zod](https://zod.dev/).
- [OWASP Application Security Verification Standard (ASVS)](https://asvs.owasp.org/)
  y [OWASP Mobile Application Security Verification Standard (MASVS)](https://mas.owasp.org/MASVS/).
- UNESCO, *Guidance for generative AI in education and research* (2023):
  [registro oficial UNESCO](https://unesdoc.unesco.org/ark:/48223/pf0000386693).

Los enlaces oficiales anteriores se proporcionan para trazabilidad y consulta;
no se afirma que cada referencia haya sido usada para producir o validar cada
componente del proyecto. La [bitácora de IA](./docs/bitacora-ia.md) registra
solo interacciones visibles en el historial y resultados que se pudieron
comprobar.

## Estado de la entrega académica

Esta documentación describe el código y las comprobaciones locales; no es un
acta institucional de entrega. No se ha desplegado ni publicado el proyecto.
La publicación de reglas de Firestore, la configuración de Email/Password y
credenciales en Firebase/Vercel, smoke contra un proyecto real y la verificación
del dominio de producción siguen siendo pasos manuales.
