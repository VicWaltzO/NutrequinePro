# Verificación del MVP

Suite automatizada: `node --test tests/*.test.mjs`. Contiene los seis escenarios normativos y pruebas de integridad adicionales.

| Escenario | Evidencia |
|---|---|
| A — Producción | 8/4/3 núcleos = 320/160/120 sacos; 15,000 kg comerciales frente a 14,817 kg de fórmula; insumos consolidados; descuento, costo extraordinario, cobro real y entradas de inventario |
| B — Contado | Precio de lista y precio especial separados; pago, aplicación y entrega en una sola operación; falta de método revierte la operación completa |
| C — Crédito | Primer pago parcial; segundo pago; saldo cero y estado PAID; ambos pagos permanecen |
| D — Pago múltiple | Una transferencia S/ 1,866 y tres aplicaciones S/ 1,460, 268 y 138 |
| E — Venta futura | Stock 80, venta 120; pendiente no descuenta; lote DRAFT vinculado; confirmación genera stock; entrega descuenta; doble entrega rechazada |
| F — Rectificación | Venta entregada 100 → 10; registro original preservado; motivo y snapshots; movimientos compensatorios; saldo recalculado |

Pruebas adicionales cubren BASE; fórmulas versionadas; precios congelados; excedentes y reversiones; validaciones de pagos; devoluciones; gastos vinculados sin doble suma; cierre de producción; precisión; búsqueda normalizada; roles; borradores; egresos de producciones anuladas; gastos anticipados de producción; cantidades extremas; rectificación de producción; restricciones por stock consumido.

Persistencia: se aplica la migración real sobre SQLite con claves foráneas habilitadas. Se verifica la lectura posterior de maestros y operaciones. Un fallo de relación revierte todas las escrituras. Una revisión obsoleta no puede sobrescribir una operación concurrente. La venta al contado persiste conjuntamente sus detalles, pago, aplicación y salida de inventario.

Prueba manual del navegador: creación de producción 8/4/3; descuento y cobro de soya; confirmación; entrada de 600 sacos; creación de cliente desde venta; precio S/70 contra referencia S/73; selección de transferencia; venta entregada; pago PG-000001; saldo cero. La recarga usa la base local, no almacenamiento del navegador.

La publicación usa una base nueva con los maestros iniciales, sin ventas ni producciones de prueba.
