# Resultados de la refactorización integral

Fecha: 09/10/2026. Base original: `87c6c5e`. Rama independiente:
`codex/refactorizacion-integral`. Este informe describe lo implementado y las
verificaciones ejecutadas; la [auditoría inicial](AUDITORIA_INICIAL.md) conserva
el diagnóstico previo.

## Estado y preservación funcional

Se ejecutó la refactorización sobre la aplicación existente. Se mantienen React,
TypeScript estricto, Vinext, Workers, D1, rutas, navegación, CSS, marca y recursos
reales. La rama no modifica `main` ni despliega cambios sobre la web alojada.
La especificación y los cambios comerciales aprobados anteriormente permanecen
vigentes, incluidos contado parcial/excedente, aplicación de crédito y edición de
fórmulas por operador.

No se cambiaron reglas, importes, cantidades, estados comerciales ni criterios de
permisos para hacer pasar pruebas. Las migraciones históricas no tienen cambios.
Se conservan pagos, auditoría, snapshots, rectificaciones y compensaciones de
inventario. La huella de datos de las 27 tablas de la base local habitual coincide
antes/después de preparar el entorno y de ejecutar la validación final.

## Problemas encontrados y corregidos

| Hallazgo                                                                   | Implementación                                                                                |
| -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Archivos con líneas de miles de caracteres                                 | Prettier 3.6.2 exacto y formateo independiente de la extracción                               |
| AdminApp concentra vistas, modales, estado y navegación                    | Composición central de 200 líneas, vistas por funcionalidad y hooks de operaciones/navegación |
| Formularios y utilidades mezclados; producción importa Footer desde ventas | Formularios individuales, hooks de estado y contratos/elementos compartidos                   |
| Dominio concentra semillas, cálculos y comandos                            | Núcleo común y reglas por funcionalidad; fachada pública compatible                           |
| Store depende directamente del entorno Cloudflare para probar casos de uso | `createStore(bindingGetter)` con el mismo código real, adaptador `store.ts` y tests SQLite    |
| `/api/state` 503 en D1 local sin migrar                                    | Preparación automática previa a dev, identidad/ruta compartidas e inspección conservadora     |
| Instalación requiere migración manual en README                            | Guías y comandos actualizados; `db:prepare` reutiliza el mecanismo de dev                     |
| Falta de controles repetibles de formato/estructura/colaboración           | `verify`, regresión de interfaz/store/arquitectura, GitHub Actions y CONTRIBUTING             |

TypeScript y ESLint no tenían errores de aplicación en la base inicial. Los
fallos de binarios durante una instalación todavía en curso y EPERM/EACCES del
aislamiento se distinguieron de defectos de código y se repitieron con permisos.
La auditoría registra esas diferencias.

## Estructura y archivos principales

Ver [ARQUITECTURA.md](ARQUITECTURA.md) para dependencias y flujo de información.

- `app/ui/AdminApp.tsx`: orquestación; `Sidebar`, `Topbar`, `PageHeading`,
  `RecordFilters`, `ModalHost`, `OperationDetails` y `SimpleForm` son piezas separadas.
- `app/ui/hooks`: carga y comandos en `useAdminOperations`, rutas y filtros en
  `useAdminNavigation`. Las selecciones de vista permanecen en `selectors.ts`.
- `features/ventas`, `cobranza`, `produccion`, `inventario`, `clientes`, `gastos`,
  `balance` y `configuracion`: presentación y reglas de su funcionalidad.
- `shared/ui`, `shared/lib`, `shared/types` y `shared/domain`: elementos comunes,
  contratos canónicos, unidades, validaciones y permisos.
- `lib/domain.mjs`: fachada compatible; `execute-command.mjs` coordina los 26
  comandos; `command-context.mjs` proporciona auditoría, códigos y movimientos.
- `lib/seed-state.mjs`, `state-schema.mjs`, `persistence.mjs`: maestros originales,
  tablas/relaciones y plan de escritura parametrizado.
- `lib/application-store.mjs` y `store.ts`: casos de uso idempotentes y binding D1.
- `scripts/local-database.mjs`, `prepare-local-db.mjs`, `wrangler.local.json`,
  `vite.config.ts`: preparación y persistencia local compartidas.
- `tests/application-store.test.mjs`, `architecture.test.mjs`,
  `local-database.test.mjs`, `ui-regression.test.mjs` y helpers: nueva regresión.
- `scripts/verify.mjs` y `.github/workflows/quality.yml`: controles reproducibles.

## Comparación antes/después

Las líneas máximas se midieron sobre los archivos de código, sin contar CR/LF.
Los archivos extraídos se reparten por responsabilidad; reducir una fachada no
significa eliminar el código que reexporta.

| Archivo/responsabilidad                              |        Antes: líneas / máxima |                                    Después: líneas / máxima |
| ---------------------------------------------------- | ----------------------------: | ----------------------------------------------------------: |
| AdminApp                                             |                    67 / 3.039 |                                                   200 / 109 |
| Formularios de ventas → SaleForm principal           |      40 / 1.886, todos juntos |                   325 / 111, con pagos/devolución separados |
| Formularios de producción → ProductionForm principal |      21 / 2.227, todos juntos | 168 / 109, con conciliación/fórmula/rectificación separados |
| domain.mjs → fachada                                 |                   209 / 1.532 |                                11 / 90, reglas distribuidas |
| Orquestador execute-command                          | Dentro del dominio monolítico |                                                    91 / 109 |
| Casos de uso application-store                       |            Dentro de store.ts |                                                    85 / 110 |

`shared.tsx` agrupaba 24 líneas con una máxima de 837; ahora sus componentes,
formato y búsqueda viven en módulos compartidos individuales. La distribución
visual y el markup de las muestras comprobadas se conservan.

## Resultado de verificaciones

| Comprobación               | Inicial                                                  | Final local                                                                    |
| -------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `npm.cmd ci`               | Aprobado, 682 paquetes                                   | Lockfile conserva instalación reproducible y fija Prettier                     |
| `npm.cmd test`             | 39 aprobadas                                             | 50 aprobadas, 0 fallidas                                                       |
| `npm.cmd run check`        | Aprobado                                                 | Aprobado, TypeScript estricto                                                  |
| `npm.cmd run lint`         | Aprobado                                                 | Aprobado, cero advertencias permitidas                                         |
| `npm.cmd run build`        | Aprobado con permisos                                    | Aprobado con las tres rutas originales                                         |
| `npm.cmd run format:check` | No existía                                               | Aprobado                                                                       |
| `npm.cmd run dev`          | Funcionaba con base ya migrada; 503 con esquema faltante | Migra una base aislada vacía y arranca; segundo arranque no repite migraciones |

La suite conserva las 39 pruebas originales y agrega 11: tres de preparación D1,
cinco de casos de uso del store, dos de arquitectura y una que compara 66 escenarios
de interfaz. El fixture de HTML se capturó del commit de formato `2f7c03b`, antes
de modularizar, con reloj, IDs y estado sintético deterministas. Comprueba 44
vistas/roles y 22 formularios/modales sin diferencias. Es regresión de SSR; no es
una afirmación de igualdad de píxeles ni cobertura de todas las interacciones.

Los tests del store ejercitan inicialización concurrente, reintentos sin duplicar
auditoría, identidad sin acceso, escritura simultánea obsoleta, retry válido,
venta/cobro/crédito/entrega persistidos, integridad referencial y rollback completo.
El análisis arquitectónico cubre imports estáticos del código propio, excluyendo
imports solo de tipos, módulos externos y declaraciones generadas.

## D1: diagnóstico y comprobación real

Se reprodujo `/api/state` 503 en un Worker compilado con `DB` y una ruta aislada
sin tablas. La excepción fue `D1_ERROR: no such table: settings: SQLITE_ERROR`
en `loadState` → `ensureState`. La base habitual funcionaba: no se encontró
evidencia de corrupción ni de un binding ausente. La causa fue iniciar una base
local sin preparar su esquema, con documentación que exigía un paso manual.

Se centralizó la configuración y la ruta en `wrangler.local.json` y
`localPersistPath`. La preparación inspecciona antes de escribir, aplica solo
pendientes y reconoce el esquema inicial histórico completo sin repetir su SQL.
Una base parcial o desconocida sin ledger se bloquea. No se borraron bases ni se
alteraron migraciones. En la base habitual solo se agregó el ledger de migración;
las huellas de sus 27 tablas de aplicación permanecen idénticas.

Se ejecutó un flujo HTTP real en `.wrangler/refactor-final`, separado de la base
habitual y de producción:

1. Inicio de sesión local: redirect 302 y cookie de prueba; panel y estado 200.
   Consulta/escritura sin sesión 401; origen ajeno 403.
2. Venta futura de 10 sacos a S/ 73: total S/ 730, pago S/ 100,10, deuda
   S/ 629,90, lote DRAFT y stock físico cero.
3. Intento de entrega sin producir: 422 y revisión intacta. Confirmación del lote:
   40 sacos. Entrega y repetición de su mismo request_id: 30 sacos, una sola salida.
4. Cobro de S/ 700: saldo a favor S/ 70,10. Aplicación a una segunda venta a crédito
   de S/ 73: deuda S/ 2,90. Caja sigue en S/ 800,10, sin nuevo ingreso.
5. Gasto de flete vinculado de S/ 10: egreso contado una sola vez.
6. Rectificación de la primera venta a 12 sacos: stock 28, deuda S/ 146 y línea
   anterior conservada. Devolución física de un saco con efecto económico cero:
   stock 29, historial intacto.
7. Conciliación completa de cobros reales y cierre de producción: CLOSED.
   Dos pagos; cobros S/ 800,10; caja neta S/ 790,10; dos correcciones históricas.
8. Recarga HTTP y reinicio de `dev` sobre esa misma ruta: coinciden revisión,
   cantidades de registros, resúmenes, snapshots, balance y stock.

La comprobación de reinicio inicialmente terminó con un error de Node/Windows al
cerrar abruptamente el script auxiliar mediante `process.exit`, después de pasar
las aserciones. Se retiró ese cierre y se repitió con salida 0. Fue un defecto del
auxiliar de verificación, no del código de la aplicación.

## Navegador

Se abrió el panel local, comprobando las ocho secciones administrativas, datos D1
y el formulario Nueva venta. Seleccionar producto conserva precio S/ 73 y peso
25 kg; un pago S/ 20,10 muestra deuda S/ 52,90 y S/ 100 muestra excedente S/ 27.
El formulario se cerró sin agregar operaciones. Se inspeccionó el modal en
1024 × 768: se mantiene centrado y permite desplazamiento; se restauró el viewport.
También se recargó el panel tras reiniciar el servidor.

La sesión local usa el starter: salir de la ruta protegida redirige nuevamente al
inicio de sesión de prueba y vuelve a la identidad local. No se verificó OAuth
real ni cambios de acceso en producción. No se declara una comparación visual
automatizada de píxeles ni una prueba manual exhaustiva de todos los formularios.

## Cambios de comportamiento expresos

- `dev` ahora prepara D1 local; corrige el arranque sin esquema. La preparación
  automática agrega metadata de migraciones a bases históricas verificadas y
  rechaza estados desconocidos en lugar de iniciar con el error posterior.
- `lint` falla también con advertencias y `verify` agrupa los controles.
- El dispatcher modular usa `Object.hasOwn` para aceptar solo nombres de comandos
  registrados. Nombres heredados como `constructor` se rechazan, conservando el
  rechazo anterior de operaciones desconocidas.
- No hay cambios comerciales intencionados, rediseño, nuevas rutas ni modificación
  de datos existentes. `start` conserva su persistencia default documentada.

## Git, colaboración y pendientes

La secuencia de commits separa auditoría, formato, entorno, interfaz, lógica,
regresión y documentación:

| Commit                            | Propósito                                            |
| --------------------------------- | ---------------------------------------------------- |
| `cd4cc94`                         | Auditoría inicial y reproducción de D1               |
| `2f7c03b`                         | Formato consistente sin cambios comerciales          |
| `9bdfeba`                         | Preparación D1 local conservando esquemas existentes |
| `5b99ab1`                         | Modularización de vistas y formularios               |
| `e684310`                         | Reglas por funcionalidad y casos de uso del store    |
| `a29d22d`                         | Regresión de interfaz/store/arquitectura y CI        |
| Commit de documentación posterior | Arquitectura, desarrollo, resultados y colaboración  |

La eliminación previa del documento maestro en la raíz y el archivo local
`NutrequinePro_especificaciones.md` pertenecen al usuario y quedan fuera de estos
commits. Los auxiliares, bases y resultados de pruebas locales están ignorados;
solo se versionan fixtures sintéticos y fingerprints sin datos reales.

El workflow verifica PRs y ramas `codex/**` con el mismo comando `verify`.
CONTRIBUTING prepara el trabajo de dos desarrolladores y revisión por módulos.
La protección obligatoria de `main` requiere configuración administrativa del
repositorio; esta tarea no cambia sus permisos. La ejecución remota de CI y la
sincronización se comprueban después del último commit y se informan en la entrega.

No quedan errores de código conocidos de la refactorización. Permanecen los
límites comerciales ya documentados: venta con devoluciones anteriores bloquea
rectificación, no hay pagos parciales a proveedores ni valoración FIFO. No se
inventaron políticas para resolverlos. La revisión y eventual integración a
`main`, protección de rama y despliegue quedan como acciones posteriores.

## Instalación local

Desde la raíz, seleccionar la rama y entrar en `app/`:

```powershell
git switch codex/refactorizacion-integral
cd app
npm.cmd ci
npm.cmd run dev
```

Abrir `http://127.0.0.1:5173`. Para verificar:
`npm.cmd run verify`. La [guía](GUIA_DESARROLLO.md) describe entornos aislados,
migraciones, comandos y diagnóstico sin pérdida de datos.
