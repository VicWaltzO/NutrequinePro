# NQP26-13 · Conciliación de fuentes

Base fa6a7eadb95aca1d7fc6cd434c24854a76821ec0.

31 declaraciones consumidoras (28 Select compartidos + 3 select directos); 1 renderizador Select.tsx no se cuenta como contexto. Además Check filtrable CustomerSiteFields:113, input month:18 y radios SaleForm:187/200. 64 filas, 23 campos, IDs únicos, cero campos vacíos, cero declaraciones consumidoras sin fila. Repetición por entidades/fila editable no genera IDs adicionales.

Las pestañas de un mismo filtro se agrupan cuando proveedor/opciones/condición no cambian. Se separan alta, edición/reapertura y consumidores indirectos; dashboard no duplica el mismo modal sale. Alias #sites y #products son rutas al mismo componente.

| Declaración                                                         | Contextos CSV                              |
| ------------------------------------------------------------------- | ------------------------------------------ |
| app/client/admin/RecordFilters.tsx:64                               | SEL13-001, SEL13-003                       |
| app/client/admin/RecordFilters.tsx:71                               | SEL13-002, SEL13-004                       |
| app/client/admin/RecordFilters.tsx:75                               | SEL13-005, SEL13-006, SEL13-007            |
| app/features/clientes/components/CustomerDetail.tsx:183             | SEL13-031                                  |
| app/features/clientes/components/CustomerSiteFields.tsx:82          | SEL13-025, SEL13-027, SEL13-029            |
| app/features/cobranza/components/PaymentForm.tsx:49                 | SEL13-023                                  |
| app/features/configuracion/components/CompanyFields.tsx:22          | SEL13-059                                  |
| app/features/configuracion/components/CompanyFields.tsx:33          | SEL13-060                                  |
| app/features/configuracion/components/CompanyFields.tsx:46          | SEL13-061                                  |
| app/features/configuracion/components/ProductFields.tsx:12          | SEL13-053, SEL13-056                       |
| app/features/configuracion/components/ProductFields.tsx:39          | SEL13-054, SEL13-057                       |
| app/features/configuracion/components/ProductFields.tsx:49          | SEL13-055, SEL13-058                       |
| app/features/configuracion/components/UserFields.tsx:7              | SEL13-051, SEL13-052                       |
| app/features/gastos/components/ExpenseFields.tsx:16                 | SEL13-044                                  |
| app/features/gastos/components/ExpenseFields.tsx:29                 | SEL13-045                                  |
| app/features/gastos/components/ExpenseFields.tsx:37                 | SEL13-046                                  |
| app/features/gastos/components/ExpenseFields.tsx:43                 | SEL13-047                                  |
| app/features/gastos/components/ExpenseFields.tsx:49                 | SEL13-048                                  |
| app/features/inventario/components/InventoryAdjustmentFields.tsx:20 | SEL13-049                                  |
| app/features/inventario/components/InventoryAdjustmentFields.tsx:37 | SEL13-050                                  |
| app/features/produccion/components/CostRows.tsx:23                  | SEL13-038, SEL13-040, SEL13-042            |
| app/features/produccion/components/CostRows.tsx:46                  | SEL13-039, SEL13-041, SEL13-043            |
| app/features/produccion/components/FormulaForm.tsx:27               | SEL13-032, SEL13-034                       |
| app/features/produccion/components/FormulaForm.tsx:49               | SEL13-033, SEL13-035                       |
| app/features/produccion/components/ProductionForm.tsx:161           | SEL13-036, SEL13-037                       |
| app/features/ventas/components/SaleForm.tsx:139                     | SEL13-008, SEL13-009, SEL13-014, SEL13-015 |
| app/features/ventas/components/SaleForm.tsx:317                     | SEL13-010, SEL13-016                       |
| app/features/ventas/components/SaleForm.tsx:337                     | SEL13-011, SEL13-017                       |
| app/features/ventas/components/SaleForm.tsx:365                     | SEL13-012, SEL13-018                       |
| app/features/ventas/components/SaleLineEditor.tsx:187               | SEL13-020, SEL13-021, SEL13-022            |
| app/shared/ui/PaymentFields.tsx:12                                  | SEL13-013, SEL13-019, SEL13-024            |

## Cadena de opciones

`server/application.mts GET /api/state → application-store.loadState (colecciones sin ORDER BY garantizado) → client/admin/admin-api.ts → useAdminOperations.state → AdminWorkspace/ModalContent → consumidor → shared/ui/Select` (strings con label() u objetos id/name) o select directo. No asumir orden SQLite como contrato. Alta rápida: submit CUSTOMER_SAVE/SITE_SAVE → result ID + nuevo state → set customer_id/site_id; recarga mantiene valores por ID, sin garantía A–Z general actual.

Las fuentes locales inline, categorías editadas en SimpleForm y snapshots de producción se detallan por fila. saleSiteContext ya ordena copia filtrada de sedes con Intl.Collator. FormulaForm mantiene default de primer producto/ingrediente fuente: el futuro orden de opciones no cambia esos arrays.

## Reproducción

Ejecutar desde raíz: `rg -n "<[sS]elect\b|<option\b|<optgroup\b|datalist|combobox|listbox|aria-haspopup" app/client app/features app/shared`. Luego `rg -n "PaymentFields|CostRows|CustomerSiteFields|RecordFilters" app/client app/features app/shared`. El script externo NQP26-13_ast.mjs recorre AST TS/TSX/JSX y registra atributos, línea y tag en NQP26-13_AST.json; no cuenta coincidencias textuales de tests como componentes. Se contrastaron manualmente rutas, condicionales y consumidores; la regex sola no demuestra exhaustividad.

## Evidencia sintética y límites

NQP26-13_RECORRIDO_SSR.json registra rutas por tres roles, modales y variantes con/sin catálogos. SSR con hooks inertes y sustitución en memoria solo para abrir mode=link; no acredita interacción ni permiso de un modal abierto directamente. E2E completo y contratos de permisos aportan regresión por navegador/HTTP; no son comprobación visual de cada producto cartesiano ni ensayo físico móvil/lector de pantalla. Casos sin datos o condicionales no montados no se presentan como aprobación visual.

## Semántica

{'NOMINAL_AZ': 41, 'SECUENCIA_NEGOCIO': 20, 'AGRUPADO_AZ_INTERNO': 2, 'CRONOLOGICO': 1}. Los controles fijos se consignan en Placeholder_fijo; OTHER queda fijo final tras segmento nominal cuando corresponde. No hay proveedores, microinsumos futuros, horas, prioridades ni combobox/listbox/datalist runtime propios adicionales en la base inspeccionada. No inventar módulos futuros.
