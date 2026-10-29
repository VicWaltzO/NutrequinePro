# NQP26-04 · Decisión de arquitectura

Base: `59d33bb9f1bcdd59106ceebce500a90e76cb1182`, origin/main consultado el 28/10/2026. PR #14 fusionado; consulta GitHub sin PR abiertos. Checkout original con cambios ajenos, conservado. Trabajo aislado en `codex/nqp26-04-reservas-parciales`.

## Decisión previa a implementación

Adoptar A para el prototipo aislado: C es saldo comercial ya neto de cobertura. B requeriría reinterpretar las salidas históricas como retiros físicos y reconstruir reservas, sin evidencia suficiente. No existe esa evidencia en el ledger actual. A conserva SALE_OUT y permite enlaces aditivos en JSON, sin tablas ni migraciones. No se adopta ningún pedido legado automáticamente.

Cada venta nueva usa coverage_version=1. Su línea almacena cobertura entera K, gramos y vínculo a un único movimiento SALE_OUT con sale_item_id y snapshot de presentación/peso. N=q-K se deriva. Los movimientos siguen inmutables. No se mezcla un peso unitario diferente, ni saco/frasco, ni políticas de peso distintas. Movimientos legados ambiguos o fracciones no prueban unidades compatibles: no se convierten restos en sacos.

## Conservación y transiciones

| Operación                    | Saldo / cobertura                                   | Enlace y auditoría                                            | Permiso             |
| ---------------------------- | --------------------------------------------------- | ------------------------------------------------------------- | ------------------- |
| Confirmar                    | d=min(q,C compatible,gramos/peso); C-=d; K=d; N=q-d | SALE_OUT por línea cubierta, auditoría y cobro en mismo batch | ADMIN/OPERATOR      |
| Borrador                     | Sin cargo ni cobertura                              | Documentos y auditoría existentes                             | ADMIN/OPERATOR      |
| Cobrar/aplicar crédito       | C/K/N/entrega intactos                              | Cobranza existente                                            | Permisos vigentes   |
| Entregar                     | Solo con K=q; cero nuevo cargo/costo                | Evidencia explícita de entrega y auditoría                    | ADMIN/OPERATOR      |
| Rectificar sin cambios       | Cero deltas comerciales                             | Solo auditoría/revisión una vez para proteger request_id      | ADMIN               |
| Cambiar o cancelar cobertura | Bloqueo explícito hasta redistribución segura de 05 | Sin escritura                                                 | ADMIN               |
| Entrada con obligaciones     | Bloqueo explícito hasta 05/06                       | Sin escritura ni entrada parcial                              | Permisos existentes |
| Legado pendiente             | No adoptar ni entregar desde el prototipo           | Exige procedimiento futuro explícito                          | Sin ampliaciones    |

35 sacos de 25 kg: A pide 40 => K=35,N=5,C=0 y -875000 g. B pide 35 => K=0,N=35,C=0. No marca entrega. Una entrada posterior queda bloqueada si existe faltante anterior; no se define prioridad con sale_date. Operaciones de inventario deben conservar unidades y gramos compatibles, incluso ajustes negativos y compensaciones de producción.

## Activación y compatibilidad

La composición ordinaria no habilita el motor. Solo una dependencia de composición en pruebas puede activarlo; no existe bandera HTTP, variable de entorno, cambio de configuración privada ni migración onLoad. Si una base ya contiene ventas del prototipo, las mutaciones de inventario sin esa dependencia se rechazan para impedir que un arranque normal eluda las protecciones. La UI operativa conserva su contrato previo: no presenta el prototipo como funcionalidad disponible. No se afirma stock físico observado; la cobertura y el saldo comercial se inspeccionan en las pruebas.

Los snapshots históricos no se reescriben. Se preservan precios, pagos, costos de producción y variantes; el motor actual no registra costo de venta por salida. Por ello 04 no inventa costo de adquisición ni promedio: usa el cargo comercial existente y no reconoce costo otra vez en entrega. Valoración futura completa queda pendiente. Anulación administrativa tras entrega y rectificaciones del prototipo permanecen bloqueadas; una devolución explícita usa el camino existente, sujeto al bloqueo de ingresos cuando hay faltantes.

## T03 como bloque separado

Revalidar permiso antes de replay en store y HTTP; comparar representación canónica de type/payload, independiente del orden de claves, conservando orden de arrays y tipos. Diferencia => conflicto 409 sin escritura. Auditoría nueva guarda versión de contrato; auditoría antigua conserva action/payload y se compara sin fabricar huellas. Si no hay cuerpo auditable fiable, bloquear replay. El guard SQL sigue siendo autoridad entre instancias; fallo de auditoría revierte todo el batch.

## Límites de ratificación

A queda elegida para la prueba de arquitectura. La aceptación operativa queda bloqueada por 05/06, adopción legacy, liberación/redistribución y valoración completa. No fusionar ni desplegar. La matriz final registrará solo pruebas realmente ejecutadas; los contratos futuros no son aprobaciones.

Los saldos agregados legados sin una presentación y peso unitario compatibles no acreditan unidades completas para esta asignación: pueden quedar comercialmente libres y sin cobertura nueva. Se requiere conciliación o adopción explícita; no se inventan conversiones ni un conteo físico a partir de C+K con evidencia histórica incompleta.

Planificación enlazada: create_production se rechaza en la composición de reservas, incluso antes de guardar un borrador. El cálculo heredado resta stock desde q después del cargo y sobreplanificaría unidades ya cubiertas; se conserva únicamente para la composición ordinaria. 05 debe integrar planificación por N y sus presentaciones antes de habilitar ese enlace. La prueba R04-05/17 exige rechazo sin ningún cambio de estado.
