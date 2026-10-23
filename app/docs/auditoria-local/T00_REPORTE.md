# T00 — Línea base y runtime

Fecha: 22 de octubre de 2026, America/Bogota.

## Resultado y alcance

T00 completada: línea base reproducible de la revisión actual, sin cambios funcionales. Todas las comprobaciones ejecutadas pasaron. Esto no cierra T01–T20 ni acredita aptitud para publicación en Internet. No se repitieron los probes H01/H06 ni se aprobó una política comercial en esta tarea.

## Revisión y aislamiento

- Commit inicial y código probado: `1a2410708e82bf6493bfa0b1d62a05945cd12806`.
- Rama de origen: `codex/presentaciones-cascoplus`, cuyo seguimiento remoto coincidía con ese SHA. Contiene cambios posteriores a `origin/main`; no se auditó main ni se presupone equivalencia con el ZIP histórico.
- Rama de trabajo: `codex/t00-linea-base`, creada en worktree independiente desde ese SHA.
- Copia aislada: `C:/Users/vicve/.codex/worktrees/t00-linea-base/Nutrequine Pro`.
- La carpeta original tenía borrados previos en `app/demo-linkedin/`. No se copiaron, restauraron ni incluyeron en T00. El worktree empezó limpio.
- Las fuentes versionadas permanecieron sin modificaciones durante todos los ensayos, comprobado con `git status --short` y `git diff --exit-code`.
- El commit de cierre incorpora únicamente este informe. Su SHA se obtiene con `git log -1 --format=%H -- app/docs/auditoria-local/T00_REPORTE.md`; no se incrusta su propio hash en el archivo.

Los adjuntos son planes y auditoría en Markdown; no contienen el ZIP de fuentes original citado por la auditoría. La referencia reproducible de código es el commit anterior.

SHA-256 de adjuntos disponibles:

| Archivo                                         | SHA-256                                                          |
| ----------------------------------------------- | ---------------------------------------------------------------- |
| NUTREQUINEPRO_AUDITORIA_INTEGRAL_2026-10-22.zip | 229F8DB3CC180D8A1BC88A908266965B49152A74A7407820CBB953AD5ABEB221 |
| NUTREQUINEPRO_TAREAS_CODEX_SOLO_LOCAL.zip       | 5958F10BA545FFE4C7C0B869958A8F6978C9758793734932F101040334880ACA |
| app/package.json                                | B1D655952FE8826815214BFA09BC2DDDC995D8D4849169D11568319F158417B1 |
| app/package-lock.json                           | 6BD13D66BFA0C27EF767F70BAC0444B38776C4FFE031C023E465816B853EE2F5 |

## Entorno

- Windows, win32 x64, versión del sistema `10.0.26200` mediante `os.release()`.
- Node `v24.18.0`; npm `11.16.0`. Satisface `engines.node >=24.18.0`.
- E2E: Playwright del lockfile con Chrome instalado en `C:/Program Files/Google/Chrome/Application/chrome.exe`; `REGRESSION_BROWSER_CHANNEL=chrome`.
- Se vaciaron `NODE_OPTIONS` y `NODE_PATH` y se retiraron `UI_REVIEW_DEV` y `NUTREQUINE_TEST_PRODUCT_PHOTO` del entorno de la ejecución. No se usó fotografía externa opcional.
- La consulta CIM del SO no estaba disponible en el sandbox; se usó Node. No afecta las pruebas.

## Revisión previa de scripts y datos

Se revisaron los scripts declarados en `app/package.json:8`, el orquestador `app/scripts/verify.mjs:6`, los scripts de build, administración SQLite, catálogo, desarrollo, ejemplos documentales y empaquetado, `.npmrc`, lockfile y `.github/workflows/quality.yml:1` antes de instalar o ejecutar.

No hay hooks preinstall/postinstall propios en package.json. El lockfile marca hooks de tres versiones de esbuild (0.18.20, 0.25.12, 0.28.0) y dos fsevents opcionales para macOS. Se inspeccionaron los manifiestos y el instalador de esbuild disponible: prepara/verifica el binario de plataforma y contempla descarga alternativa. npm ci terminó con aviso de hooks esbuild sin aprobación bajo la política local de npm; no se alteró esa política ni el lockfile. Build y verify funcionaron con esa instalación. Se observaron avisos de obsolescencia de `@esbuild-kit/esm-loader` y `@esbuild-kit/core-utils`; su evaluación corresponde a T14. No se ejecutó npm audit ni se afirma ausencia de vulnerabilidades.

Los comandos administrativos exigen destinos explícitos. No se ejecutaron manualmente auth:prepare, db:admin ni catálogo sobre bases existentes. Su invocación por los tests utiliza fixtures.

Referencias del aislamiento revisado:

- `app/tests/helpers/memory-persistence.mjs:6`: SQLite `:memory:`.
- `app/tests/helpers/persistence-fixtures.mjs:16`: directorio temporal exclusivo y limpieza con comprobación de pertenencia.
- `app/tests/helpers/local-app-server.mjs:22`: carpeta temporal nueva, business.sqlite y auth.sqlite sintéticas; configuración privada generada y puerto loopback.
- `app/tests/node-backend.test.mjs:26` y `app/tests/sqlite-administration.test.mjs:29`: fixtures privadas temporales, contraseñas de ensayo y bases explícitas.
- `app/tests/helpers/deny-external-network.mjs:1`: guardia de red para procesos de distribución; el fixture exige su activación. No equivale a aislamiento global de todos los procesos: npm usa el registro y el modo desarrollo tiene su propio recorrido local.
- `app/scripts/build-paths.mjs:10`: solo reemplaza dist-client/dist-node, verifica destino y rechaza enlaces.

No se copiaron configuración privada ni bases empresariales al worktree. Las pruebas generan datos sintéticos en TEMP y evidencias en app/outputs, excluido de Git.

## Comandos y resultados observados

Ejecutados secuencialmente desde `app/`. Se hizo build antes de E2E según AGENTS.md, ya que los fixtures copian dist-node. No se corrieron suites en paralelo contra el mismo build.

| Comando                          | Código de salida | Segundos | Resultado |
| -------------------------------- | ---------------- | -------- | --------- |
| `npm.cmd ci`                     | 0                | 114.65   | PASA      |
| `npm.cmd run check`              | 0                | 5.2      | PASA      |
| `npm.cmd run lint`               | 0                | 14.74    | PASA      |
| `npm.cmd run test`               | 0                | 229.93   | PASA      |
| `npm.cmd run build`              | 0                | 17.02    | PASA      |
| `npm.cmd run test:e2e`           | 0                | 589.24   | PASA      |
| `npm.cmd run verify`             | 0                | 308.25   | PASA      |
| `npm.cmd run check:distribution` | 0                | 1.09     | PASA      |

- `test`: 207 pruebas aprobadas; 0 fallidas, canceladas, omitidas o pendientes.
- `test:e2e`: 29 pruebas aprobadas, incluidos subtests; 0 fallidas, canceladas, omitidas o pendientes.
- `verify`: volvió a ejecutar las 207 pruebas y ejecutó check, check:node, check:client, lint, format:check, build y check:distribution; todo terminó con salida 0.
- Distribución: 2.069 archivos, 69 paquetes de runtime; el script informó privateFiles=0 y retiredPackages=0. Es el alcance de ese chequeo, no una certificación exhaustiva de secretos.
- Sin defectos nuevos reproducidos por estas suites. Los avisos de instalación quedan registrados; no se hicieron correcciones ni actualizaciones.

## Evidencia y reproducción

Logs completos y JSON de comando/salida/duración: `C:/Users/vicve/AppData/Local/Temp/nutrequine-t00-1a24107/`. Archivos: 01-ci, check, lint, test, build, test-e2e, verify y check-distribution, con extensiones .log y .json. `source-hashes.json` registra los hashes de manifiesto y lockfile; `log-hashes.json` registra SHA-256 de los logs. Son evidencias locales, no se publican en Git.

Capturas y resultados E2E: `app/outputs/frontend-08/` del worktree. Las bases quedan en directorios temporales creados por los fixtures; no todos los helpers eliminan sus temporales automáticamente. No se incluyen en la distribución ni en el commit.

Para repetir: checkout aislado del SHA indicado, Node/npm anteriores, Chrome instalado, inspección previa de scripts y fixtures, entorno indicado y comandos de la tabla en ese orden. Los tiempos dependen de la máquina; no constituyen benchmark ni SLA. La reproducción en Linux/Chromium de CI no se ejecutó desde esta estación.

## Cierre, límites y reversión

- T00 aporta evidencia del estado inicial. No modifica reglas, migraciones, permisos, devoluciones ni contratos API.
- Las decisiones T04/T07, los criterios específicos de las demás tareas y la comprobación de H01/H06 sobre el código actual continúan pendientes. Una suite existente verde no demuestra que cubra todos los hallazgos.
- No se añadieron pruebas: T00 es diagnóstico y ejecuta las existentes; cualquier nueva corrección/regresión corresponde a la tarea específica.
- No hubo despliegue, cambio de dominio ni conexión con ERP o datos reales.
- Reversión: revertir el commit documental; no hay migraciones ni cambios funcionales que revertir. No borrar directorios temporales ajenos.
- Este informe se entrega en rama propia, con PR contra la rama de origen para que el diff contenga solo T00; sin fusionar automáticamente.
