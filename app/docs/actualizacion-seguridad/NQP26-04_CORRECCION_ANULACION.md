# Corrección de anulación de producciones rectificadas — PR #15

La validación individual de cada reversión impedía anular una producción reducida:
el movimiento original intentaba retirar más unidades que el saldo neto antes de
compensar la rectificación. El caso se reprodujo en memoria y en SQLite en disco.

La anulación valida ahora el lote de compensaciones por producto, presentación,
política de peso, peso nominal y peso real por unidad. Un estado proyectado permite
comprobar también el saldo agregado entre grupos. Solo después de validar se
registran todas las reversiones individuales, conservando su orden e historial.
La validación conjunta de cobertura se usa únicamente en la composición experimental.

Las regresiones cubren reducción con saldo libre, demanda incompatible pendiente,
rectificaciones sucesivas de varios productos, reservas ya asignadas, reposición
con peso incompatible, rollback, reintento idempotente y recarga persistida.
Los 23 casos de la suite de reservas pasan; ocho corresponden a las nuevas
regresiones ejecutadas en memoria y en SQLite.

La verificación completa pasó: 282 pruebas aprobadas, cero fallos y diez casos
pendientes preexistentes; tres comprobaciones TypeScript, lint, formato,
compilación y auditoría de distribución correctos (cero archivos privados).
Las 30 pruebas E2E pasaron con Chrome sobre ese build. Comprueban el flujo
ordinario; las regresiones de reservas ejercitan la composición experimental.
Los datos sintéticos y los registros de ejecución quedan excluidos del commit.
