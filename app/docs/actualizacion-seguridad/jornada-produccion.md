# Orden de jornada (NQP26-29)

La orden de jornada organiza la planificación de Potripregnant, Hi-Performance y Nutrelin Adulto mediante una cabecera y líneas independientes. No modifica las producciones históricas ni genera entradas comerciales, gastos o consumos nuevos. Los productos se seleccionan por su identificador del catálogo; los nombres siguen la compatibilidad de familias ya definida en MICRO_FAMILIES, sin alias persistidos.

Cada línea conserva cantidades centesimales de núcleos, macrofórmula, microfórmula publicada, receta y estimaciones de macros. Se omiten los productos no fabricados. La fecha es una fecha local explícita con la zona configurada; pueden registrarse varias jornadas independientes en una fecha, decisión autorizada por el usuario.

JOURNEY_CREATE requiere revisión vigente y política privada exacta de microfórmula. JOURNEY_LINK relaciona cantidades explícitas con preparaciones confirmadas; admite enlaces incrementales y reparto entre productos de una misma familia sin superar lo confirmado globalmente ni lo planificado en cada línea. Se preservan las referencias de grupo y variantes históricas NQP26-25. Los costos y consumos atribuidos se consultan como fracciones exactas del evento original, sin nuevas salidas ISSUE ni redondeo monetario acumulado.

Los estados pendiente, parcial y núcleos vinculados se derivan de las referencias. Núcleos vinculados no significa cierre del molino. Sacos reales, merma y costo final permanecen pendientes; se reservan para NQP26-30/31/32. No se activan reservas comerciales. Las producciones antiguas mantienen sus contratos y circuitos actuales.

La migración aditiva 0009 incorpora cabeceras, líneas y vínculos inmutables, restricciones referenciales, revisión transaccional, límites cuantitativos, validación de snapshots y auditoría. No modifica 0000–0008. Una reversión requiere detener la aplicación y restaurar un respaldo anterior íntegro; no se ofrece borrado de historia ni anulación de consumos cerrados.

Pruebas automatizadas: tests/production-journeys.test.mjs y tests/local-e2e/production-journeys.test.mjs; datos exclusivamente sintéticos. Los cuatro entregables detallados permanecen en las carpetas oficiales locales 03_REPORTES, 04_EVIDENCIAS y 05_BITACORA. La entrega requiere revisión técnica posterior y aprobación expresa; no incluye fusión ni despliegue.

## Estado de esta entrega

Trabajo local incompleto: BLOQUEADO_CICLOS_AUTO. Se agotaron los dos ciclos automáticos de corrección autorizados. La ejecución completa de verify terminó con 624 casos: 611 aprobados, siete fallidos y seis TODO históricos. Permanecen incompatibilidades del arnés de interfaz con la importación local de CSS y expectativas de tablas/selectores en pruebas históricas. La suite E2E completa y las CI del SHA final no están aprobadas. El E2E específico y las pruebas independientes aprobadas corresponden a revisiones intermedias, no certifican el árbol final. No publicar ni integrar este estado sin resolver los hallazgos y repetir las verificaciones autorizadas.
