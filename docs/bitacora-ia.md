# Bitácora de uso de IA

Registro limitado a solicitudes visibles en el historial de esta conversación.
El historial resumido no conserva la fecha de cada intercambio anterior; por
eso se indica **No disponible** en lugar de inferir fechas. Los resultados
describen cambios o límites comprobables y no atribuyen pruebas no ejecutadas.

| Fecha | Herramienta | Prompt resumido | Resultado obtenido | Método de validación | Decisión |
|---|---|---|---|---|---|
| No disponible (historial previo resumido) | Copilot SDK en VS Code | Implementar Semana 10: autenticación, roles, guards, API, scripts y pruebas. | La implementación de auth/roles y rutas está presente; no se conserva en este resumen la salida de validación específica de esa semana. | Revisión posterior de archivos/rutas; no se atribuye conexión a Firebase real. | Mantener la autorización basada en custom claims verificados. |
| No disponible (historial previo resumido) | Copilot SDK en VS Code | Implementar Semana 11: reglas, transacciones de préstamos, API y pruebas. | Se encuentran reglas de dominio, acceso transaccional, estados e idempotencia. | Revisión posterior de `loan-rules.ts`, `data/loans.ts` y tests; mocks no demuestran concurrencia remota real. | Mantener reglas centrales y señalar el límite de las pruebas aisladas. |
| No disponible (historial previo resumido) | Copilot SDK en VS Code | Implementar Semana 12: subida/descarga de portadas y validación real de imágenes. | Hay rutas de portada, almacenamiento Firestore y validación local con Sharp. | Revisión del código y contrato; no se afirma una prueba de imagen real salvo la indicada por una ejecución registrada. | No enviar imágenes a servicios externos. |
| No disponible (historial previo resumido) | Copilot SDK en VS Code | Construir el sitio web completo integrado con las semanas 9–12. | El proyecto contiene páginas, sesión de servidor, formularios y vistas de catálogo/préstamos. | Inspección del árbol y documentación existente; no se atribuye un recorrido manual de navegador. | Mantener Server Components y autorización en acciones del servidor. |
| No disponible (historial previo resumido) | Copilot SDK en VS Code | Implementar OpenAPI 3.1, JSON, Swagger UI y detección de rutas sin documentar. | `lib/openapi.ts`, `/api/openapi.json`, `/api/docs` y test de inventario; se verificó el alcance de 12 rutas y 15 operaciones. | Inspección de especificación y prueba que compara métodos/rutas exportados; CDN puede depender de conectividad externa. | Derivar cuerpos desde Zod y no excluir rutas del test. |
| No disponible (historial previo resumido) | Copilot SDK en VS Code | Crear reset y smoke de Firebase y cubrir 41 comprobaciones reales. | Los scripts existen y contienen limpieza; el smoke contra Firebase real no se ejecutó por falta de `.env`; reset no se ejecutó. | Inspección de preflight/limpieza del script; sin credenciales reales no hay resultado E2E. | No ejecutar reset ni afirmar que las 41 comprobaciones pasaron. |
| No disponible (historial previo resumido) | Copilot SDK en VS Code | Preparar el capítulo 9 para Vercel sin publicar ni desplegar. | Configuración e instrucciones preparadas; no hubo `git push`, creación externa ni despliegue. | Revisión de `vercel.json`, configuración Next y controles Git; el dominio de producción no existe/verifica en este contexto. | Requerir autorización explícita para publicación o despliegue. |
| No disponible (historial previo resumido) | Copilot SDK en VS Code | Auditar problemas frecuentes de la guía y corregir defectos reales. | Se añadieron diagnósticos al README; el resumen de esa auditoría registra typecheck, lint, build y 94 tests como aprobados en esa ejecución. | Comandos reportados en el historial de la auditoría; login real no se probó y localmente faltaba configuración Firebase. | Distinguir configuración/credenciales reales de tests simulados. |
| No disponible (registro documental actual) | Copilot SDK en VS Code | Completar capítulos 11 y 12: README académico, endpoints, datos, bitácora, referencias y validación. | README ampliado con arquitectura, 15 operaciones, Firestore, reglas, comandos, rotación y referencias; esta bitácora creada con límites de evidencia explícitos. | En esta revisión: `pnpm typecheck` correcto; `pnpm test` correcto (17 archivos, 94 tests); `pnpm lint` correcto; `pnpm build` correcto. Vitest mostró una advertencia de configuración futura de Vite, sin fallar. Sin smoke remoto ni despliegue. | Documentar solo los resultados ejecutados y dejar Firebase/publicación para acción manual autorizada. |
| Pendiente (solo si corresponde) | Completar por el estudiante | Añadir interacciones de IA externas a este historial, si las hubo. | Sin datos verificables disponibles para este registro. | Pendiente de completar por el estudiante; no cuenta como resultado probado. | No inventar prompts, fechas, resultados ni validaciones. |

## Alcance de la evidencia

- Los resultados anteriores forman parte de un historial resumido, no de un
  expediente fechado por intercambio. Se conservaron las fechas como no
  disponibles.
- No se registran contraseñas, tokens, claves, datos personales reales ni
  credenciales de Firebase.
- La prueba smoke necesita un Firebase de pruebas y la API en ejecución. No
  debe confundirse con Vitest, y el reset de demo es destructivo y no se ejecutó.
- No se ha confirmado un despliegue, publicación en GitHub, CDN disponible ni
  configuración de Firebase remota.
