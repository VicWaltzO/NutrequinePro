# NQP26-11 · Conciliación de fuentes

Base e66f4deefd75ad938ba6b6acabe3de46ed0ddc3e. Una familia parametrizada por entidad (fórmula, producto, devolución, rectificación) representa N tablas materializadas sin inventar IDs empresariales. Cada contexto distinto tiene ID propio. No se suman pruebas, SQL ni documentación histórica como tablas UI.

## Declaración → instancia y contexto

| Fuente y línea                                                       | ID inventariado                | Contexto                                                              |
| -------------------------------------------------------------------- | ------------------------------ | --------------------------------------------------------------------- |
| `app/features/balance/components/BalanceView.tsx:88`                 | BALANCE-MESES                  | #balance                                                              |
| `app/features/clientes/components/CustomerDetail.tsx:246`            | PERFIL-COBROS                  | modal customer-detail / payments                                      |
| `app/features/clientes/components/CustomerDirectory.tsx:55`          | SEDES-DIRECTORIO               | #customers/sites (alias #sites)                                       |
| `app/features/clientes/components/CustomerDirectory.tsx:76`          | CLIENTES-DIRECTORIO            | #customers/all                                                        |
| `app/features/cobranza/components/CollectionsView.tsx:49`            | COBRANZA-HISTORIAL             | #collections/payments                                                 |
| `app/features/cobranza/components/PaymentDetail.tsx:48`              | COBRO-APLICACIONES             | modal payment-detail                                                  |
| `app/features/cobranza/components/PaymentForm.tsx:103`               | PAGO-NUEVO-APLICACIONES        | modal payment                                                         |
| `app/features/cobranza/components/PaymentForm.tsx:103`               | CREDITO-APLICACIONES           | modal credit                                                          |
| `app/features/configuracion/components/Configuration.tsx:27`         | CONFIG-PRODUCTOS               | #config/products (alias #products)                                    |
| `app/features/configuracion/components/Configuration.tsx:81`         | CONFIG-USUARIOS                | #config/users                                                         |
| `app/features/configuracion/components/Configuration.tsx:100`        | CONFIG-AUDITORIA               | #config/audit                                                         |
| `app/features/gastos/components/ExpensesView.tsx:22`                 | GASTOS-REGISTRO                | #expenses                                                             |
| `app/features/inventario/components/InventoryView.tsx:37`            | INVENTARIO-STOCK               | #inventory/all                                                        |
| `app/features/inventario/components/InventoryView.tsx:59`            | INVENTARIO-MOVIMIENTOS         | #inventory/movements                                                  |
| `app/features/produccion/components/FormulaForm.tsx:45`              | FORMULA-EDITOR                 | modal formula                                                         |
| `app/features/produccion/components/ProductionCorrectionForm.tsx:31` | LOTE-RECTIFICAR-CANTIDADES     | modal production-quantities                                           |
| `app/features/produccion/components/ProductionDetail.tsx:70`         | LOTE-PRODUCTOS                 | modal production-detail / productos                                   |
| `app/features/produccion/components/ProductionDetail.tsx:87`         | LOTE-SNAPSHOT-INGREDIENTES     | modal production-detail / details por producto                        |
| `app/features/produccion/components/ProductionDetail.tsx:100`        | LOTE-COSTOS-INSUMOS            | modal production-detail / costos insumos                              |
| `app/features/produccion/components/ProductionDetail.tsx:130`        | LOTE-COSTOS-ADICIONALES        | modal production-detail / costos adicionales                          |
| `app/features/produccion/components/ProductionIngredients.tsx:15`    | LOTE-FORMULARIO-INSUMOS        | modal production / crear o editar borrador                            |
| `app/features/produccion/components/ProductionList.tsx:18`           | PRODUCCION-HISTORIAL           | #productions/all                                                      |
| `app/features/produccion/components/ProductionList.tsx:18`           | PRODUCCION-BORRADORES          | #productions/draft                                                    |
| `app/features/produccion/components/ProductionList.tsx:18`           | BALANCE-LOTES                  | #balance                                                              |
| `app/features/produccion/components/ProductionsView.tsx:39`          | PRODUCCION-INSUMOS             | #productions/ingredients                                              |
| `app/features/produccion/components/ProductionsView.tsx:62`          | FORMULAS-CATALOGO-INGREDIENTES | #productions/formulas / details por formula.id                        |
| `app/features/produccion/components/ReconcileForm.tsx:34`            | LOTE-CONCILIAR-INSUMOS         | modal reconcile                                                       |
| `app/features/ventas/components/ReturnForm.tsx:43`                   | VENTA-DEVOLVER-LINEAS          | modal return                                                          |
| `app/features/ventas/components/SaleDetail.tsx:107`                  | VENTA-DISPONIBILIDAD-LEGACY    | modal sale-detail / coverage_version !=1, PENDING, no DRAFT/CANCELLED |
| `app/features/ventas/components/SaleDetail.tsx:137`                  | VENTA-DETALLE-COMERCIAL        | modal sale-detail / detalle comercial                                 |
| `app/features/ventas/components/SaleDetail.tsx:173`                  | VENTA-PAGOS-APLICADOS          | modal sale-detail / pagos aplicados                                   |
| `app/features/ventas/components/SaleDetail.tsx:220`                  | VENTA-DEVOLUCION-DETALLE       | modal sale-detail / sección por return.id                             |
| `app/features/ventas/components/SalesView.tsx:41`                    | VENTAS-RECTIFICACIONES         | #sales/corrections                                                    |
| `app/features/ventas/components/SalesView.tsx:61`                    | VENTAS-DEVOLUCIONES            | #sales/returns                                                        |
| `app/features/ventas/components/SaleTable.tsx:17`                    | VENTAS-HISTORIAL               | #sales/all                                                            |
| `app/features/ventas/components/SaleTable.tsx:17`                    | VENTAS-FUTURAS                 | #sales/future                                                         |
| `app/features/ventas/components/SaleTable.tsx:17`                    | VENTAS-BORRADORES              | #sales/draft                                                          |
| `app/features/ventas/components/SaleTable.tsx:17`                    | VENTAS-ANULACIONES             | #sales/cancelled                                                      |
| `app/features/ventas/components/SaleTable.tsx:17`                    | RESUMEN-VENTAS                 | #dashboard                                                            |
| `app/features/ventas/components/SaleTable.tsx:17`                    | COBRANZA-PENDIENTES            | #collections/all                                                      |
| `app/features/ventas/components/SaleTable.tsx:17`                    | PERFIL-VENTAS                  | modal customer-detail / sales                                         |
| `app/shared/ui/History.tsx:16`                                       | VENTA-HISTORIA-CAMPOS          | modal sale-detail / History SALE                                      |
| `app/shared/ui/History.tsx:16`                                       | PRODUCCION-HISTORIA-CAMPOS     | modal production-detail / History PRODUCTION                          |
| `app/server/reports.mts:58`                                          | PDF-LOTE-PRODUCTOS             | /api/documents/production/:id.pdf                                     |
| `app/server/reports.mts:75`                                          | PDF-LOTE-INSUMOS               | /api/documents/production/:id.pdf                                     |
| `app/server/reports.mts:102`                                         | PDF-VENTA-LINEAS               | /api/documents/sale/:id.pdf                                           |
| `app/server/reports.mts:160`                                         | PDF-CLIENTE-VENTAS             | /api/documents/customer/:id.pdf                                       |
| `app/server/reports.mts:172`                                         | PDF-CLIENTE-COBROS             | /api/documents/customer/:id.pdf                                       |
| `app/server/reports.mts:184`                                         | PDF-CLIENTE-APLICACIONES       | /api/documents/customer/:id.pdf                                       |
| `app/server/reports.mts:195`                                         | PDF-CLIENTE-MOVIMIENTOS        | /api/documents/customer/:id.pdf                                       |
| `app/server/reports.mts:231`                                         | PDF-BALANCE-COMPARACION        | /api/documents/balance/:id.pdf                                        |

## Resultado contable

33 declaraciones JSX + 8 llamadas PDF → 51 superficies contextuales; 268 columnas. 208 columnas propuestas SI y 60 NO. Ver exclusiones para wrapper y listas sin semántica de tabla. Ninguna declaración tabular runtime queda sin ID.

El descubrimiento AST complementa siete búsquedas rg registradas en NQP26-11_BUSQUEDAS.md. No se afirma que una regex demuestre exhaustividad: navegación, ModalContent, callbacks saleTable/productionList y History se siguieron por separado.
