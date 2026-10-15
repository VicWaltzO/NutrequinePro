# Auditoría inicial de la refactorización

> Documento histórico: describe el estado de su tarea y commit de origen. Para operar la aplicación actual, consultar [instalación local](INSTALACION_LOCAL.md) y [arquitectura consolidada](ARQUITECTURA.md).

Fecha: 09/10/2026. Base: `87c6c5e`. Rama: `codex/refactorizacion-integral`.

## Alcance y estado previo

Se revisaron ambos AGENTS.md, los README, la especificación maestra de
`docs/ESPECIFICACION_MAESTRA_MVP.md`, la matriz de aceptación, las rutas, formularios,
dominio, persistencia, scripts, configuración estricta de TypeScript y migración.
Los cambios comerciales posteriores aprobados (contado parcial y excedentes,
aplicación de crédito, fórmulas editables por operador) se conservan.

La eliminación local de la especificación antigua de la raíz y el nuevo archivo
`NutrequinePro_especificaciones.md` pertenecen al usuario y quedan fuera de esta tarea.
No se despliega esta rama ni se modifica la base alojada.

## Comprobaciones antes de modificar código

| Comando desde app/  | Resultado inicial                                                                                                                                                      |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm.cmd ci`        | 682 paquetes instalados, salida 0; advertencias de dependencias heredadas y scripts de instalación. El primer intento aislado se interrumpió; se repitió con permisos. |
| `npm.cmd test`      | 39 pruebas aprobadas, 0 fallidas.                                                                                                                                      |
| `npm.cmd run check` | Aprobado; no errores de TypeScript.                                                                                                                                    |
| `npm.cmd run lint`  | Aprobado; no errores de ESLint.                                                                                                                                        |
| `npm.cmd run build` | Aprobado con permisos; el aislamiento produjo inicialmente EPERM al leer dependencias.                                                                                 |
| `npm.cmd run dev`   | Arranca en 127.0.0.1:5173; `/api/state` autenticado devuelve 200 con la base local existente.                                                                          |

Las comprobaciones lanzadas mientras `ci` aún terminaba no encontraron sus binarios;
se repitieron después de completar la instalación. No son defectos de la aplicación.

## Diagnóstico reproducido de D1

Un Worker compilado con el mismo binding `DB` y la misma identidad de base,
pero persistencia separada en `.wrangler/refactor-baseline`, devuelve 503 desde
`/api/state`. El servidor informa `D1_ERROR: no such table: settings: SQLITE_ERROR`
en `loadState()` → `ensureState()` → GET. La base local existente funciona.

El script `dev` no prepara la base. Los README requieren compilar y ejecutar
manualmente la migración inicial: es fácil omitirla o aplicarla en otra ruta.
El plugin de Cloudflare usa `.wrangler/state/v3`; el comando documentado usa
`--persist-to .wrangler/state`, que resuelve a ese mismo directorio. No hay evidencia
de un binding ausente ni de una corrupción de la base existente.

La corrección debe inspeccionar y preparar el esquema antes del arranque, compartir
la identidad y ruta de persistencia con Vite/Wrangler, reconocer bases ya migradas,
aplicar solamente migraciones pendientes y rechazar estados parciales desconocidos.
No borrar bases, repetir ciegamente la migración inicial ni cambiar la migración histórica.

## Arquitectura y dependencias

React/Vinext usa `/`, `/api/state` y `/api/command`. `AdminApp` agrupa navegación,
filtros, carga remota, solicitudes idempotentes, vistas y modales. Los formularios
dependen de `shared.tsx`, `domain-types` y selectores del dominio. Producción y los
formularios simples importan el Footer y FormProps desde ventas, una dependencia
accidental que debe llevarse a shared.

`domain.mjs` contiene semillas, cálculos puros y comandos sobre un clon. `store.ts`
carga D1, verifica identidad y reintentos y persiste un batch. `persistence.mjs`
genera upserts y un guard de revisión; un fallo revierte toda la transacción.
La única migración contiene 27 tablas, claves foráneas y el guard; es inmutable.

| Archivo             |  Bytes | Líneas | Línea máxima (caracteres) |
| ------------------- | -----: | -----: | ------------------------: |
| AdminApp.tsx        | 28.590 |     67 |                     3.039 |
| ProductionForms.tsx | 13.084 |     21 |                     2.227 |
| SaleForms.tsx       | 13.503 |     40 |                     1.886 |
| shared.tsx          |  5.541 |     24 |                       837 |
| domain.mjs          | 41.212 |    209 |                     1.532 |

## Invariantes y plan verificable

Se conservan enteros en céntimos/gramos, redondeo BigInt, snapshots de fórmula y
precios, permisos de servidor, roles, auditoría, devoluciones y compensaciones,
crédito explícito, caja basada en pagos, entrega contra stock físico, idempotencia
y transacciones protegidas frente a revisiones obsoletas. Las pruebas cubren A–F,
pagos excedentes y parciales, versiones, devoluciones, restricciones y persistencia.

Commits separados: auditoría; formato; entorno local; interfaz por funcionalidades;
dominio por funcionalidades; regresión; documentación y colaboración. Después de
cada cambio se ejecutan las verificaciones afectadas. No se cambia el diseño,
framework, esquema ni reglas comerciales para facilitar la extracción.
