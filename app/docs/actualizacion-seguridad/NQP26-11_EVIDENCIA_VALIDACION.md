# NQP26-11 · Evidencia de validación y límites

2026-10-30 America/Bogota. Base runtime `e66f4deefd75ad938ba6b6acabe3de46ed0ddc3e`; los commits NQP26-11 son exclusivamente documentales. Datos sintéticos externos; servidor de fixture en loopback con bloqueo de red externa en proceso distribuido. No se usan datos, servidores o credenciales empresariales.

## Comandos ejecutados

| Comando / comprobación                                                                    | Resultado                                                                                                                                                   |
| ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `git fetch origin`; `git ls-remote origin refs/heads/main`; GitHub fetch PR #22           | Base e66f4de confirmada; #22 fusionado. Workflow runs para SHA merge base: lista vacía, sin atribuir éxito.                                                 |
| `git worktree add -b codex/nqp26-11-inventario-tablas ../NQP26-11-inventario origin/main` | Worktree independiente; original no modificado por esta tarea.                                                                                              |
| `npm.cmd ci --ignore-scripts` desde app                                                   | Salida 0, 400 paquetes; lockfile sin cambios.                                                                                                               |
| `npm.cmd run verify` intento 01                                                           | Salida 1 en test: 378 aprobadas, dos errores Windows Get/SetAccessControl, seis TODO, 386 totales. No continuó otros pasos.                                 |
| `npm.cmd run verify` intento 02 con TEMP/TMP externos exclusivos                          | Salida 0: 380 aprobadas, cero fallos, seis TODO de 386 totales; check/check:node/check:client, lint, formato, build, check:distribution aprobados.          |
| Auditoría de distribución incluida en verify-02                                           | 2080 archivos, 69 paquetes runtime, privateFiles 0, retiredPackages 0.                                                                                      |
| Siete consultas `rg` de BUSQUEDAS + extracción AST temporal                               | 33 declaraciones JSX, ocho PDF; 51 contextos inventariados, cero sin conciliación.                                                                          |
| Python CSV autor y revisor                                                                | 268 filas, 24 campos, 51 IDs, índices contiguos, fuentes existentes, motivos NO completos. Revisor cotejó 33/33 cabeceras exactas.                          |
| Recorrido Chrome complementario externo                                                   | Salida 0, 94 estados; ADMIN 32, OPERATOR 31, VIEWER 31. 24 rutas hash por rol + cinco pestañas perfil + detalles venta/producción; ADMIN incluye reconcile. |

TEMP/TMP exclusivos: `C:/Users/vicve/AppData/Local/Temp/NQP26-11-runtime`. Se repitió la suite completa sin cambiar código o pruebas; la segunda ejecución pasó. No se declara demostrado el origen exacto de los fallos temporales iniciales ni se debilitan los controles ACL. Las repeticiones no se suman como casos nuevos.

## Recorrido complementario

Helper temporal de inspección, sin incorporación al runtime ni al repositorio. Usa `tests/helpers/local-app-server.mjs`, escenarios sintéticos existentes y Playwright con Chrome. Crea únicamente negocio/credenciales sintéticos en su fixture aislado; no activa reservas empresariales. Una primera invocación del helper falló por formato de importación ESM de ruta Windows; se corrigió a `file:///` y la ejecución 02 finalizó sin errores. No es fallo ni prueba de aplicación, y no se cuenta entre los casos de npm.

Rutas recorridas por cada rol: dashboard; sales/all, future, draft, cancelled, corrections, returns; collections/all, payments; customers/all, sites; productions/all, draft, ingredients, formulas; inventory/all, movements; expenses; balance; config/all, products, users, audit, appearance.

También perfil de cliente Resumen/Ventas/Cobros y aplicaciones/Sedes/Actividad, detalle de venta, detalle de producción y conciliación como ADMIN. `visual.json` conserva rol/contexto/cabeceras DOM/conteo visible de cada estado. Los snapshots de modales pueden contener tablas de fondo: 94 estados no significa 94 tablas nuevas ni cobertura visual universal. La rama sales/cancelled estaba vacía; config/all y appearance no tienen tablas, coherente con exclusiones. Las cabeceras de productos, usuarios y auditoría se observaron para los tres roles.

Capturas `NQP26-11-admin-detalle.png`, `NQP26-11-admin-conciliar.png`, `NQP26-11-admin.png`, `NQP26-11-operator.png`, `NQP26-11-viewer.png` permanecen externas. Se inspeccionaron visualmente conciliación ADMIN y detalle producción VIEWER: encabezados y contenido observados, controles coherentes con rol. Son capturas del viewport del modal, sin afirmar lectura de todas las filas fuera de scroll ni auditoría de diseño.

## Huecos explícitos de evidencia visual

No se montó cada snapshot histórico ni cada tabla de History con valores anteriores/nuevos para los tres roles en el recorrido complementario. No se generaron todas las anulaciones/rectificaciones/devoluciones para llenar cada estado vacío. No se abrió cada editor/formulario de la matriz en cada rol ni se inspeccionó visualmente cada página PDF en esta tarea. Esas superficies conservan evidencia estática, conciliación de cabeceras y revisión independiente; las suites existentes aportan regresión de los flujos que efectivamente ejercitan, sin equipararla a cobertura visual exhaustiva. Por ello **D11-25 PARCIAL**; no se elimina ninguna tabla del inventario.

La captura no verifica orden asc/desc porque no se implementa en 11. Las pruebas sugeridas en el CSV pertenecen a 12; no se presentan como ya ejecutadas. No hay aceptación empresarial, prueba de hardware físico ni aprobación formal GitHub del revisor.

## Registros y entrega

Logs completos `verify.log`, `verify-02.log`, `e2e.log`, `visual.log`, `visual-02.log` y `visual.json`, matriz inicial y capturas sintéticas se conservan en `C:/Users/vicve/Documents/ChatGPT/NQP26-11-entrega/04_EVIDENCIAS/`. Solo este resumen seguro se versiona. El resultado E2E completo, estado del PR y CI final se incorporan al cierre documental y se cotejan en bitácora externa, sin sumar verificaciones estáticas a los totales de pruebas.

## Regresión E2E final local

`REGRESSION_BROWSER_CHANNEL=chrome; npm.cmd run test:e2e`, después del build y con TEMP/TMP exclusivos: salida 0; 35 pruebas, 35 aprobadas, cero fallos/canceladas/omitidas/TODO; duración 652917.8214 ms. Incluye flujos de negocio, roles, navegación/perfil, exportación, producción, fecha/entrega legacy, destinos, formularios e integración A/B existentes. No se suma el recorrido complementario de 94 estados a estas 35 pruebas.
