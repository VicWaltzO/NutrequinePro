# Estado base para la reestructuración arquitectónica

Registro del 14/10/2026, zona America/Bogota. Esta entrega prepara una rama y
documentación; no cambia funcionalidades, esquema, migraciones ni despliegue.

## Punto de partida

| Elemento                | Estado registrado                                         |
| ----------------------- | --------------------------------------------------------- |
| Rama de origen          | `codex/refactorizacion-integral`                          |
| Rama independiente      | `codex/reestructuracion-arquitectonica`                   |
| Commit base             | `c06cf57b6fdbf850751380ae320fd3c03b47d793`                |
| Remoto                  | `https://github.com/VicWaltzO/NutrequinePro.git`          |
| Entorno de verificación | Windows, Node 24.18.0, npm 11.16.0                        |
| Aplicación              | `app/`, paquete privado `nutrequine-pro` 0.1.0            |
| Migración versionada    | `drizzle/0000_nervous_silver_fox.sql` y metadatos Drizzle |
| Persistencia            | Cloudflare D1 / SQLite, 27 tablas de aplicación           |

Al comenzar existía una eliminación local de
`showcase/dist/nutrequine-pro-showcase-45s-1080p.mp4`. Se conserva como cambio
previo ajeno a esta tarea y se excluye del commit. El código versionado de `app/`
no tenía cambios pendientes. La rama parte del HEAD actual, incluidos los commits
anteriores de showcase y demo; no se reescribe su historia. Este commit base
permite comparar los futuros cambios con `git diff c06cf57 -- app/` desde la raíz.

## Arquitectura y contratos vigentes

React 19.2.6, TypeScript 5.9.3 estricto, Vinext 1.0.0-beta.5, Vite 8.0.13,
Cloudflare Workers, Wrangler 4.92.0 y Drizzle ORM 0.45.2, según el paquete y
lockfile existentes. Las rutas son `/`, `/api/state` y `/api/command`; la
navegación usa hash. Los módulos de negocio están en `features/`, el dominio
común y componentes en `shared/`, y la composición en `app/app/`.

`lib/domain.mjs` conserva la fachada pública; `application-store.mjs` coordina
casos de uso; `execute-command.mjs` aplica comandos y permisos;
`persistence.mjs` planifica escrituras; `store.ts` adapta el binding D1 `DB`.
Se conservan lotes atómicos, revisión optimista, idempotencia, auditoría y
snapshots históricos, céntimos y gramos enteros. No hay borrado de operaciones.
Consultar [ARQUITECTURA.md](ARQUITECTURA.md),
[ESPECIFICACION_MAESTRA_MVP.md](ESPECIFICACION_MAESTRA_MVP.md) y
[ACEPTACION.md](ACEPTACION.md) para responsabilidades y reglas actuales.

La base local usa `.wrangler/state`, salvo `NUTREQUINE_LOCAL_STATE_DIR`.
`dev` inspecciona y prepara el esquema antes del arranque. Una base histórica
completa sin ledger se adopta sin repetir la migración; un esquema desconocido
se rechaza. Las migraciones aplicadas son inmutables. La base alojada y sus
credenciales no se inspeccionaron ni se modificaron.

## Verificaciones ejecutadas sobre el estado actual

Comandos desde `app/`, con las dependencias ya instaladas:

| Verificación        | Resultado                                               |
| ------------------- | ------------------------------------------------------- |
| `npm.cmd test`      | 55 pruebas aprobadas; 0 fallidas, omitidas o canceladas |
| `npm.cmd run check` | TypeScript aprobado, salida 0                           |
| `npm.cmd run lint`  | ESLint aprobado, salida 0                               |
| `npm.cmd run build` | Compilación completa de las tres rutas, salida 0        |

`npm.cmd run format:check` terminó con salida 1 por 36 archivos locales de
herramientas en `demo-linkedin/.tools/` (metadatos y documentación de FFmpeg),
ignorados por Git y ajenos al código versionado. Se conservaron sin cambios.
La comprobación Prettier de los tres documentos de esta tarea pasó con salida 0.
`git diff --check` también pasó. Esta limitación local no es un error de código
introducido por la preparación; no se modificaron exclusiones para ocultarla.

Hay 11 archivos `tests/*.test.mjs`. Cubren aceptación comercial, store real,
límites y ciclos arquitectónicos, estado del navegador, configuración,
preparación de D1, migraciones, cobros/crédito/entrega y persistencia atómica.
Una prueba de interfaz compara los 66 escenarios HTML de la fixture existente.
Estos fingerprints verifican SSR; no sustituyen interacción ni QA visual.
No se actualizaron fixtures para conseguir resultados positivos.

La compilación emitió avisos de tiempos de plugins de Vite/Rolldown; no hubo
errores. No se ensayaron nuevos flujos en navegador porque no cambió la aplicación.

## Preparación de recuperación

El [procedimiento de respaldo y restauración](RESPALDO_RESTAURACION.md)
identifica entornos, preserva la persistencia completa, comprueba SHA256 y
restaura en una ruta nueva antes de seleccionar la copia. Incluye verificación
de integridad, claves foráneas, esquema, ledger, recuentos y persistencia, y los
pasos de recuperación alojada para cuando exista acceso administrativo.

Se realizó un ensayo físico aislado con SQLite: migración actual de 27 tablas,
un cliente sintético y un ledger de migración. Se cerró la conexión, se copió el
directorio a un respaldo y después a una restauración independiente. Coincidieron
SHA256, `PRAGMA quick_check`, `PRAGMA foreign_key_check`, registro y ledger.
Los artefactos sintéticos permanecen en `app/backups/`, ignorado por Git.
También se ejecutaron los bloques PowerShell de respaldo y copia de restauración
sobre esa fixture: hashes y cantidad de archivos coincidieron. La copia adicional
permanece bajo `app/.wrangler/`, ignorada; los cuatro bloques PowerShell se
comprobaron sintácticamente. La consulta Wrangler y el arranque del servidor del
procedimiento no se ejecutaron en este ensayo.
Este ensayo valida la copia SQLite; no acredita una recuperación completa del
servidor D1 ni de producción. Antes de modificar una base real se debe ensayar
su recuperación con configuración, código y datos compatibles.

La reestructuración futura debe preservar comportamiento, migraciones e historia
y repetir las verificaciones. Esta preparación no inicia cambios de arquitectura
ni implica publicación del sitio.
