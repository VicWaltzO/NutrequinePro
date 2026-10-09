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
| Cambio 09/10 — Monto contado | S/100.10 de S/730 deja S/629.90 pendiente; cero no crea pago; S/800 deja S/70 a favor |
| Cambio 09/10 — Aplicación del excedente | S/70 se aplica a otra venta del cliente sin nuevo ingreso; no supera el crédito ni la deuda; reversión libera todas las aplicaciones sin borrar historial |
| Cambio 09/10 — Entrega futura | Lote confirmado genera stock físico y permite entrega; compromisos no se descuentan dos veces; faltante de Hi-Performance 20 sacos / 500 kg se identifica antes de entregar |

Pruebas adicionales cubren BASE; fórmulas versionadas; precios congelados; excedentes y reversiones; validaciones de pagos; devoluciones; gastos vinculados sin doble suma; cierre de producción; precisión; búsqueda normalizada; roles; borradores; egresos de producciones anuladas; gastos anticipados de producción; cantidades extremas; rectificación de producción; restricciones por stock consumido.

Persistencia: se aplica la migración real sobre SQLite con claves foráneas habilitadas. Se verifica la lectura posterior de maestros y operaciones. Un fallo de relación revierte todas las escrituras. Una revisión obsoleta no puede sobrescribir una operación concurrente. La venta al contado persiste conjuntamente sus detalles, pago, aplicación y salida de inventario.

El excedente, su aplicación posterior y la reversión también se prueban leyendo nuevamente desde SQLite tras cada operación. Dos aplicaciones concurrentes del mismo crédito no pueden consumirlo dos veces. Se verifica que la caja registre el monto recibido una sola vez.

Prueba manual del navegador: creación de producción 8/4/3; descuento y cobro de soya; confirmación; entrada de 600 sacos; creación de cliente desde venta; precio S/70 contra referencia S/73; selección de transferencia; venta entregada; pago PG-000001; saldo cero. La recarga usa la base local, no almacenamiento del navegador.

Verificación manual del cambio 09/10 en la base local: contado S/730 con pago S/100.10 deja S/629.90 y aparece en Cobranza; lote vinculado confirmado agrega 40 sacos y la venta se entrega; segunda venta S/730 con pago S/750 conserva S/20 a favor. Aplicar ese excedente a la primera venta mantiene el pago original, deja S/609.90 por cobrar y conserva los valores después de recargar. No se modifican operaciones alojadas durante estas pruebas.

Las actualizaciones mantienen la base alojada y el historial existente. Los registros de las pruebas locales no se publican.
