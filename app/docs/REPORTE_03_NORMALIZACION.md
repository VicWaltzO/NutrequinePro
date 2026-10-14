# Tarea 03 — Normalización del código fuente

Fecha: 14/10/2026, America/Bogota. Rama: `codex/reestructuracion-arquitectonica`.
Base: `d717a2204836a38e41bb6eeb8b64d0ce6fdf667d`.

## Resultado y alcance

Se revisaron estructuralmente 127 archivos TS, TSX, JS, MJS y MTS propios de
`app/`, `features/`, `shared/`, `lib/`, `db/` y `scripts/`, con lectura priorizada
de los módulos más difíciles de seguir. No hay archivos JSX independientes en
ese conjunto; el JSX operativo reside en TSX. Se modificaron 68 fuentes y se
añadieron tres reglas acotadas a la configuración ESLint existente.

Se consultaron previamente la [auditoría](AUDITORIA_01_ARQUITECTONICA.md), el
[plan local](PLAN_MIGRACION_LOCAL.md), la [matriz de regresión](MATRIZ_REGRESION.md),
las instrucciones del proyecto y la skill `programacion-clara`. Se inspeccionaron
`.prettierrc.json`, `.prettierignore`, `eslint.config.mjs` y `tsconfig.json`.

La intervención mantiene rutas, reglas comerciales, datos, permisos, orden de
hooks, métodos y resultados públicos. No hay dependencias nuevas, migraciones,
cambio de autenticación/framework, nuevos componentes ni reorganización de
directorios. No se cambian pruebas, expectativas ni fixtures. La eliminación
previa del vídeo de showcase permanece fuera del commit.

## Problemas encontrados y decisiones

| Zona priorizada                                             | Problema de lectura                                                            | Mejora aplicada                                                                                                       |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| `app/ui/ModalHost.tsx`                                      | Selección de tabla con una cadena extensa de ternarios dentro de props JSX     | Selección ordenada mediante ramas y variable local tipada `TableName`; mismos fallback y prioridades                  |
| `app/ui/hooks/useAdminOperations.ts`                        | Respuesta HTTP y estado como `r`, `j`, `s`; fetch y parsing en una declaración | `response`, `responseBody`, `state`, `operationPayload`, `toastTimeout`; pasos separados y ramas de modal con bloques |
| `app/ui/hooks/useAdminNavigation.ts`                        | Ternarios encadenados para alias, vista válida y pestaña                       | Ramas explícitas; se conservan `#sites`, `#products`, rutas desconocidas y pestaña default                            |
| `app/ui/selectors.ts`                                       | Fecha genérica `d` y dos ternarios repetidos para acción de producción         | `recordDate` y una tupla local `productionAction`                                                                     |
| `features/*/domain/`                                        | `s`, `p`, `pr`, `prod`, `pay` y declaraciones agrupadas                        | Nombres de estado, payload, producción, producto y pago; una declaración por sentencia                                |
| `features/produccion/domain/operations.mjs`                 | Abreviaturas para fórmula, cantidad, peso e insumo                             | `formulaIngredients`, `nucleiCount`, `formulaWeight`, `ingredient`, `adjustment`                                      |
| `features/ventas/domain/summary.mjs`                        | Estado financiero calculado en ternario de cuatro resultados                   | Variable local y prioridades explícitas: cancelada, pagada, parcial, pendiente                                        |
| `lib/application-store.mjs`                                 | Binding getter, resultados SQL y filas con nombres ambiguos                    | `getDatabase`, `results`, `settings`, `table`, `statement`, `user`, `entry`                                           |
| `lib/persistence.mjs`                                       | SQL interpolado con varias cadenas de map/join anidadas                        | `columnNames`, `placeholders`, `updates`, `columns`, `guardId`; mismo SQL y argumentos                                |
| `shared/domain/core.mjs`                                    | Partes decimales como `a`/`b`, resultado `n`                                   | `integerPart`, `decimalPart`, `scaledValue`, `quantity`; mismas validaciones y aritmética                             |
| Formularios, vistas y tipos compartidos                     | Imports repetidos desde los mismos módulos y declaraciones múltiples           | Imports agrupados conservando separación de tipos y valores; declaraciones independientes                             |
| `SaleTable`, `SaleForm`, `RecordFilters`, `AuthenticatedId` | Elección de estado, etiqueta, opciones o mensaje incrustada en JSX             | Variables locales con ramas claras, sin cambiar texto ni markup                                                       |

Los renombrados mecánicos se hicieron por símbolos y ámbito mediante el parser
TypeScript, no con sustituciones globales de texto. Se preservaron claves de
desestructuración y objetos abreviados. El diff se revisó y los cambios manuales
se concentraron en decisiones que Prettier no puede simplificar.

## Ejemplos representativos

Antes, la petición y su resultado compartían una declaración y nombres mínimos:

```ts
const r = await fetch("/api/command", options),
  j = (await r.json()) as CommandResponse;
if (!r.ok) throw Error(j.error);
setS(j.state);
```

Después, los pasos tienen nombres explícitos (el tipo permanece inline en el
archivo real; el ejemplo usa `CommandResponse` solo para abreviar la muestra):

```ts
const response = await fetch("/api/command", options);
const responseBody = (await response.json()) as CommandResponse;
if (!response.ok) throw Error(responseBody.error);
setState(responseBody.state);
```

Antes, el cálculo decimal no explicaba sus partes:

```js
const [a, b = ""] = s.split(".");
const n = Number(a) * 10 ** digits + Number(b.padEnd(digits, "0"));
```

Después, la misma operación expresa qué transforma:

```js
const [integerPart, decimalPart = ""] = input.split(".");
const scaledValue = Number(integerPart) * 10 ** digits + Number(decimalPart.padEnd(digits, "0"));
```

Los contratos abreviados existentes no se renombraron. Por ejemplo:

```js
const { s: state, p: payload, add } = context;
```

El contexto conserva las propiedades `s` y `p`, mientras el cuerpo de la función
usa nombres comprensibles. De igual forma, hooks y componentes conservan props
como `s` y `v` mediante aliases locales; no se requiere cambiar a sus consumidores.

## Formato y reglas automáticas

Prettier sigue siendo la fuente de formato: ancho orientativo 110, dos espacios,
punto y coma, comillas dobles, trailing commas y finales LF. No se sustituyen
su configuración ni sus exclusiones. TypeScript conserva `strict`, aliases,
tipos, resolución y soporte de la arquitectura actual. ESLint conserva sus
presets Next/TypeScript y las excepciones del código vendorizado.

Se añaden reglas solo a fuentes propias de `app`, `features`, `shared`, `lib` y
`db`, sin aplicarlas a herramientas multimedia, tests, scripts del starter ni
archivos externos:

- `one-var: ["error", "never"]`: evita agrupar declaraciones que ocultan pasos,
  especialmente hooks, cálculos y operaciones async.
- `no-duplicate-imports` con `allowSeparateTypeImports: true`: agrupa imports
  compatibles y permite separar deliberadamente tipos de valores.
- `no-nested-ternary` para TS/JS/MTS/MJS sin JSX: previene cadenas de decisiones
  difíciles de depurar. No se impone sobre TSX/JSX, donde seleccionar dos o tres
  ramas visuales completas puede ser más legible que añadir funciones auxiliares.

Se comprobó con el ESLint instalado que las tres reglas detectan muestras
representativas y que la prohibición de ternarios anidados no se impone a TSX.
No se añade `max-len`, límite de tamaño de función, longitud mínima de nombres,
ordenamiento arbitrario de imports ni dependencia para coordinar formateadores.
Las lambdas sencillas y los ternarios simples se conservan cuando expresan mejor
una operación. Las cadenas SQL y tipos legítimamente largos no se fragmentan
solo para cumplir una métrica.

## Verificaciones por conjunto

| Conjunto                              | Pruebas      | TypeScript | ESLint   | Prettier                | Compilación |
| ------------------------------------- | ------------ | ---------- | -------- | ----------------------- | ----------- |
| Dominio, persistencia y unidades      | 89 aprobadas | Aprobado   | Aprobado | Aprobado                | Aprobada    |
| Presentación, hooks, imports y reglas | 89 aprobadas | Aprobado   | Aprobado | Aprobado tras reintento | Aprobada    |

Se ejecutó `npm.cmd run verify` sobre cada conjunto, incluyendo test, check,
lint, format:check y build. En el segundo conjunto, el primer formateo tuvo un
error de escritura del sistema en tres archivos; la comprobación señaló esos
archivos y se detuvo antes de compilar. Se repitió el formato y la verificación
completa sin cambiar reglas ni silenciar controles. Ambos conjuntos finales
terminaron con salida 0. La compilación emitió avisos de tiempo de plugins.

Las 89 pruebas incluyen las 55 originales y las 34 de Tarea 02. La regresión de
los 66 fingerprints HTML pasó sin actualizar su fixture. Se comprobó además que
los exports declarados de las 68 fuentes modificadas se conservan. Esa inspección
estática complementa las pruebas; no demuestra equivalencia para toda entrada
posible. `git diff --check` verifica también el diff de esta entrega.

La suite final `npm.cmd run test:e2e` pasó sobre persistencia sintética nueva y
registros de runtime propios: 4 pasos HTTP y 8 flujos de navegador aprobados,
sin fallos, omisiones ni excepciones JavaScript. Node cuenta 13 tests incluyendo
el contenedor de los 12 pasos. Duración aproximada: 108 segundos.

Evidencia nueva: `app/outputs/regression-02/2026-10-14T19-52-19-237Z-16696/`.
El nombre del directorio pertenece al runner reutilizado de Tarea 02; esta
ejecución corresponde al código normalizado. Incluye `results.json`, nueve
capturas, `trace.zip` y `server.log`, con datos exclusivamente sintéticos.
Los artefactos y la persistencia permanecen ignorados por Git. No se alteran
los resultados históricos ni se publica esta evidencia local en el repositorio.

## Formato frente a arquitectura: pendientes para Tarea 04

El formato y los nombres ya facilitan seguir operaciones y decisiones. Continúan
existiendo responsabilidades que necesitan una tarea estructural explícita:

- `ModalHost` concentra resolución de registros y selección de muchos formularios;
  se aclaró la decisión, pero no se crearon nuevos renderers o capas.
- El contexto de comandos y algunos contratos de formularios conservan claves
  abreviadas (`s`, `p`, `v`, entre otras). Una modificación pública debe coordinar
  contratos y consumidores; esta tarea solo introduce aliases locales.
- Producción concentra cálculos, snapshots, costos y movimientos en funciones
  extensas. Se aclaran sus pasos sin dividir casos de uso ni alterar transacciones.
- El store sigue cargando estado completo y depende del contrato D1; no se añade
  un adaptador, repositorio por entidad ni servidor nuevo.
- La autenticación, Vinext, Workers, tipos D1 y helpers del starter mantienen
  sus acoplamientos documentados. Cambiarlos no es una decisión de estilo.
- Se mantienen las limitaciones de cobertura de la matriz: futura autenticación
  local, disco independiente, reinicio completo, offline y otros navegadores.

No se formatearon dependencias, migraciones, recursos multimedia, `build/`,
`vendor/`, `examples/`, `components/ui/` ni artefactos generados. Los scripts
operacionales se inspeccionaron, pero no se reescribieron helpers administrados
para lograr uniformidad superficial. No se inicia Tarea 04 ni se publica el sitio.

## Inventario de inspección y modificaciones

Las rutas siguientes son relativas a `app/`. “Sí” identifica archivos fuente
modificados; “No” identifica inspección estructural sin cambios. No se presenta
el barrido automático como lectura manual exhaustiva de cada línea.

| Archivo inspeccionado                                              | Modificado |
| ------------------------------------------------------------------ | ---------- |
| `app/api/command/route.ts`                                         | No         |
| `app/api/state/route.ts`                                           | No         |
| `app/chatgpt-auth.ts`                                              | No         |
| `app/layout.tsx`                                                   | No         |
| `app/page.tsx`                                                     | No         |
| `app/ui/AdminApp.tsx`                                              | Sí         |
| `app/ui/ModalHost.tsx`                                             | Sí         |
| `app/ui/OperationDetails.tsx`                                      | No         |
| `app/ui/PageHeading.tsx`                                           | No         |
| `app/ui/RecordFilters.tsx`                                         | Sí         |
| `app/ui/Sidebar.tsx`                                               | No         |
| `app/ui/SimpleForm.tsx`                                            | Sí         |
| `app/ui/Topbar.tsx`                                                | Sí         |
| `app/ui/hooks/useAdminNavigation.ts`                               | Sí         |
| `app/ui/hooks/useAdminOperations.ts`                               | Sí         |
| `app/ui/modal-configuration.ts`                                    | No         |
| `app/ui/navigation.ts`                                             | Sí         |
| `app/ui/selectors.ts`                                              | Sí         |
| `db/index.ts`                                                      | No         |
| `db/schema.ts`                                                     | No         |
| `features/balance/components/BalanceView.tsx`                      | Sí         |
| `features/balance/components/DashboardView.tsx`                    | Sí         |
| `features/balance/domain/summary.mjs`                              | Sí         |
| `features/clientes/components/CustomerDirectory.tsx`               | Sí         |
| `features/clientes/components/CustomerFields.tsx`                  | Sí         |
| `features/clientes/components/CustomersView.tsx`                   | Sí         |
| `features/clientes/domain/commands.mjs`                            | Sí         |
| `features/clientes/domain/summary.mjs`                             | Sí         |
| `features/cobranza/components/CollectionsView.tsx`                 | Sí         |
| `features/cobranza/components/PaymentDetail.tsx`                   | Sí         |
| `features/cobranza/components/PaymentForm.tsx`                     | Sí         |
| `features/cobranza/domain/commands.mjs`                            | Sí         |
| `features/cobranza/domain/operations.mjs`                          | Sí         |
| `features/cobranza/domain/summary.mjs`                             | Sí         |
| `features/configuracion/components/AdministrativeReasonFields.tsx` | No         |
| `features/configuracion/components/CompanyFields.tsx`              | No         |
| `features/configuracion/components/Configuration.tsx`              | Sí         |
| `features/configuracion/components/ConfigurationView.tsx`          | Sí         |
| `features/configuracion/components/ProductFields.tsx`              | No         |
| `features/configuracion/components/UserFields.tsx`                 | No         |
| `features/configuracion/domain/commands.mjs`                       | Sí         |
| `features/gastos/components/ExpenseFields.tsx`                     | Sí         |
| `features/gastos/components/ExpensesView.tsx`                      | Sí         |
| `features/gastos/domain/commands.mjs`                              | Sí         |
| `features/inventario/components/InventoryAdjustmentFields.tsx`     | Sí         |
| `features/inventario/components/InventoryView.tsx`                 | Sí         |
| `features/inventario/components/ProductCards.tsx`                  | Sí         |
| `features/inventario/domain/commands.mjs`                          | Sí         |
| `features/inventario/domain/stock.mjs`                             | Sí         |
| `features/produccion/components/CostRows.tsx`                      | Sí         |
| `features/produccion/components/FormulaForm.tsx`                   | Sí         |
| `features/produccion/components/IngredientFields.tsx`              | No         |
| `features/produccion/components/ProductionCorrectionForm.tsx`      | Sí         |
| `features/produccion/components/ProductionDetail.tsx`              | Sí         |
| `features/produccion/components/ProductionForm.tsx`                | Sí         |
| `features/produccion/components/ProductionList.tsx`                | Sí         |
| `features/produccion/components/ProductionsView.tsx`               | Sí         |
| `features/produccion/components/ReconcileForm.tsx`                 | Sí         |
| `features/produccion/domain/commands.mjs`                          | Sí         |
| `features/produccion/domain/operations.mjs`                        | Sí         |
| `features/produccion/domain/summary.mjs`                           | Sí         |
| `features/produccion/hooks/useProductionFormState.ts`              | Sí         |
| `features/ventas/components/ReturnForm.tsx`                        | Sí         |
| `features/ventas/components/SaleDetail.tsx`                        | Sí         |
| `features/ventas/components/SaleForm.tsx`                          | Sí         |
| `features/ventas/components/SaleTable.tsx`                         | Sí         |
| `features/ventas/components/SalesView.tsx`                         | Sí         |
| `features/ventas/domain/commands.mjs`                              | Sí         |
| `features/ventas/domain/operations.mjs`                            | Sí         |
| `features/ventas/domain/summary.mjs`                               | Sí         |
| `features/ventas/hooks/useSaleFormState.ts`                        | Sí         |
| `lib/application-store.mjs`                                        | Sí         |
| `lib/browser-preferences.mjs`                                      | No         |
| `lib/command-context.mjs`                                          | Sí         |
| `lib/command-request.mjs`                                          | No         |
| `lib/connector-context.ts`                                         | No         |
| `lib/connector-contract.mts`                                       | No         |
| `lib/connector-errors.mts`                                         | No         |
| `lib/connectors.ts`                                                | No         |
| `lib/domain-types.ts`                                              | No         |
| `lib/domain.mjs`                                                   | No         |
| `lib/execute-command.mjs`                                          | Sí         |
| `lib/persistence.mjs`                                              | Sí         |
| `lib/seed-state.mjs`                                               | Sí         |
| `lib/state-schema.mjs`                                             | No         |
| `lib/store.ts`                                                     | No         |
| `lib/utils.ts`                                                     | No         |
| `scripts/connector-preview/connector-preview-session.mjs`          | No         |
| `scripts/connector-preview/host-binding.mjs`                       | No         |
| `scripts/connector-preview/protocol.mjs`                           | No         |
| `scripts/execution-profile.mjs`                                    | No         |
| `scripts/install-ci.mjs`                                           | No         |
| `scripts/local-bindings.mjs`                                       | No         |
| `scripts/local-database.mjs`                                       | No         |
| `scripts/local-migration-plan.mjs`                                 | No         |
| `scripts/npm-install.mjs`                                          | No         |
| `scripts/pnpm-install.mjs`                                         | No         |
| `scripts/prepare-local-db.mjs`                                     | No         |
| `scripts/run-framework.mjs`                                        | No         |
| `scripts/sites-env.mjs`                                            | No         |
| `scripts/verify.mjs`                                               | No         |
| `shared/domain/core.mjs`                                           | Sí         |
| `shared/domain/permissions.mjs`                                    | No         |
| `shared/lib/find.ts`                                               | Sí         |
| `shared/lib/format.ts`                                             | No         |
| `shared/lib/simple-form-initial.ts`                                | Sí         |
| `shared/types/admin.ts`                                            | No         |
| `shared/types/details.ts`                                          | Sí         |
| `shared/types/domain.ts`                                           | No         |
| `shared/types/forms.ts`                                            | Sí         |
| `shared/types/simple-fields.ts`                                    | Sí         |
| `shared/ui/AuthenticatedId.tsx`                                    | Sí         |
| `shared/ui/Badge.tsx`                                              | No         |
| `shared/ui/Check.tsx`                                              | No         |
| `shared/ui/Empty.tsx`                                              | No         |
| `shared/ui/Field.tsx`                                              | No         |
| `shared/ui/FormFooter.tsx`                                         | No         |
| `shared/ui/History.tsx`                                            | Sí         |
| `shared/ui/Input.tsx`                                              | No         |
| `shared/ui/LoadingScreen.tsx`                                      | No         |
| `shared/ui/Metrics.tsx`                                            | No         |
| `shared/ui/PaymentFields.tsx`                                      | No         |
| `shared/ui/ProductImage.tsx`                                       | No         |
| `shared/ui/Select.tsx`                                             | No         |
| `shared/ui/Table.tsx`                                              | No         |
| `shared/ui/Tabs.tsx`                                               | No         |
| `shared/ui/index.ts`                                               | No         |

Adicionalmente se modifica `eslint.config.mjs` y se crea este reporte. `.prettierrc.json`, `.prettierignore`, `tsconfig.json`, dependencias y lockfile se conservan.
