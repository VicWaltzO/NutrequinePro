# NQP26-05 · Decisión previa de asignación

29 de octubre de 2026, America/Bogota. Base exacta: c094a2e2959d65247099d07e1d2f3d3b4974f84d.
PR #16 abierto en borrador; CI success. #15 fusionado. Rama dependiente de #16, sin fusionarlo.

Se conserva coverage_version=1 y el movement_id inicial. Se añade coverage.events:
enlaces inmutables a cargos y compensaciones del ledger. Una cobertura anterior sin
events se lee como un cargo inicial; solo se materializa la lista cuando cambia.
Cada evento guarda movement_id, quantity y weight_grams con signo comercial
(positivo reserva, negativo liberación). K es la suma de eventos, contrastada con
los movimientos y su presentación. Las liberaciones referencian el cargo original.
No se requiere migración SQL: los documentos JSON admiten estos campos aditivos.

La cola se ejecutará al terminar el handler, antes de auditoría/revisión/persistencia,
en la copia transaccional del estado. Nunca entre miembros de un movementBatch.
Solo participan pedidos modernos pendientes con fecha propia. Prioridad: día de
entrega, instante UTC de creación, ID ordinal y por último ID ordinal de línea.
La venta nueva ofrece primero el saldo a los pedidos anteriores, sin quitar K.
El mínimo considera N, unidades y gramos compatibles y saldo agregado.

Cancelar antes de entrega libera K con compensaciones nuevas; reducir libera solo
el excedente. Rectificar conserva filas y snapshots anteriores, transfiere enlaces
activos a la nueva versión compatible y libera presentaciones reemplazadas.
Pagos excedentes y cancelación con pago aplicado se rechazan antes de liberar.
Una venta entregada no admite cancelación ni rectificación comercial en el prototipo:
se requiere devolución física explícita. Ese bloqueo es un límite, no redistribución.

Adopción legacy: operación administrativa expresa, motivo y fecha propia. Solo
historial sin cargos, devoluciones, cobertura ni entrega previa demostrable; cualquier
ambigüedad exige conciliación externa y rechazo íntegro. Nunca adopción al arrancar.
Planificación enlazada permanece bloqueada: replanificación y valoración dependen
de 28–33. Por ello la entrega es PARCIAL PROTEGIDA, sin activación empresarial.

Inspeccionados: coverage.mjs, delivery-date.mjs, commands.mjs y operations.mjs de
ventas; inventario commands/stock; producción commands/operations; command-context,
execute-command, application-store, persistence, permisos y servidor. El batch SQL
existente protege revisión, documentos, ledger y auditoría con rollback integral.
No se cambia recepción vigente PRODUCTION_IN ni se atribuyen costos desconocidos.
