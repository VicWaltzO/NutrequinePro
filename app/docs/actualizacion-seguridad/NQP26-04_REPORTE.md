# NQP26-04 · Reservas parciales protegidas

Fecha: 28 de octubre de 2026, America/Bogota. Estado: en revisión; prototipo aislado verificado, uso empresarial deshabilitado. Sin fusión en main ni despliegue empresarial.

## Qué se abordó

El sistema podía aceptar pedidos pendientes sin proteger las unidades que ya existían. Otro pedido podía volver a ofrecer esas mismas unidades. Además, un reintento con el mismo identificador podía devolver un éxito anterior aunque hubieran cambiado sus datos o los permisos del usuario.

Se eligió el modelo A: descontar el saldo comercial solamente por las unidades cubiertas y vincular cada cargo a su venta y línea. La entrega sigue siendo una acción distinta. Con 35 sacos y un pedido de 40, se protegen 35 y quedan 5 pendientes; otro pedido de 35 obtiene cobertura cero. No se crean unidades ni gramos negativos.

## Qué funciona en el entorno aislado

- Registro de cobertura parcial, completa o cero, por producto y línea; borradores sin reserva. Los precios editados y los pesos de las variantes permanecen separados.
- Cobros parciales, totales y aplicación de crédito sin cambiar cobertura ni entrega.
- Entrega explícita de un pedido cubierto sin otra salida comercial. Abrir o rectificar sin cambiar la venta conserva los datos comerciales; una rectificación nueva registra su auditoría e identificador para proteger el reintento.
- Protección entre conexiones SQLite y servidores HTTP. Una revisión obsoleta se rechaza y puede reintentarse; un fallo de persistencia revierte cobertura, cobro, auditoría y revisión juntos.
- Bloque T03: permiso vigente antes de replay, comparación canónica de operación y datos, conflicto HTTP 409 ante diferencias. La auditoría antigua se compara con su cuerpo real; si falta información para comprobarlo, se bloquea el replay sin inventar una huella.
- Lectura de históricos sin adopción retroactiva. La entrega de pedidos legados exige un procedimiento explícito todavía pendiente.

## Qué permanece bloqueado

La reposición y prioridad por fecha de entrega corresponden a 05/06. Por eso una entrada o liberación con pedidos anteriores sin cobertura se rechaza completa. La creación automática de producción desde una venta reservada también se bloquea: su cálculo anterior volvería a planificar unidades ya cubiertas. Los pedidos pueden registrarse sin esa opción. También se bloquean la anulación y los cambios comerciales de ventas del prototipo: todavía no existe redistribución segura de lo liberado. No se presenta esta restricción como la funcionalidad final de cancelación.

El motor solo se habilita por una dependencia interna de composición usada en pruebas. No tiene interruptor HTTP, de configuración o de entorno. El arranque normal rechaza bases que contienen ventas del prototipo; la composición experimental rechaza servir la interfaz operativa. Se exponen «Pendiente por stock» y «Listo por stock» en el resumen de dominio para observación de API, sin habilitar una pantalla de reservas ni presentar C como inventario físico observado.

El ledger existente no reconoce costo de venta por movimiento; 04 conserva ese comportamiento y los snapshots de producción. No implementa el promedio ponderado ni afirma que la valoración futura completa esté resuelta. No añade tablas ni migración SQL. La prueba histórica de respaldo/restauración se conserva dentro de la verificación general; no se ensaya ninguna base empresarial.

## Verificación y evidencias

La primera ejecución general de verify terminó con 272 aprobadas, 2 fallidas y 10 todo. Los fallos fueron una expectativa histórica que permitía replay a un VIEWER y el tipo del nuevo estado de cobertura durante la compilación aislada. Se corrigieron ambos: la prueba ahora exige HTTP 403 y el resumen declara su contrato de retorno. La comprobación TypeScript de Node pasó después de la corrección. La segunda ejecución completa de verify pasó: 274 aprobadas, 10 todo y cero fallidas, canceladas u omitidas; los tres TypeScript, lint, formato, build y distribución pasaron. Distribución: 2074 archivos, 69 paquetes de runtime, cero privados y cero paquetes retirados. La revisión final añadió la protección de planificación automática descrita arriba. Sus 15 pruebas de reservas pasaron en NQP26-04_planificacion-protegida.log. Verify-03 pasó completo sobre el código final: 274 aprobadas, 10 todo, cero fallidas, canceladas u omitidas; tipos, lint, formato, build y distribución correctos. E2E-01 terminó con 30/30 aprobadas, cero fallos, canceladas, omitidas o todo, en una sola ejecución sobre el build de verify-02. La última guarda afecta exclusivamente a la composición experimental, que esos E2E no habilitan; su rechazo sin escrituras se verifica con las 15 pruebas dirigidas y verify-03. Los E2E acreditan regresión ordinaria, no UX de reservas. No se suman ejecuciones distintas ni las 21 dirigidas al total general.

Se escribieron primero la decisión y las pruebas del contrato. `NQP26-04_contrato-rojo.log` conserva 13 fallos esperados antes de implementar. `NQP26-04_dirigidas-01.log` registra 12 aprobadas y un fallo de limpieza de la carpeta temporal por una conexión abierta. Se corrigió el cierre de esa conexión antes de borrar el directorio. `NQP26-04_dirigidas-02.log` conserva 19 aprobadas, cero fallos, cero todo. Posteriormente se amplió la prueba de gramos, adopción legacy y bloqueo de arranque. NQP26-04_dirigidas-final.log registra 21 aprobadas, cero fallos y cero todo con esas ampliaciones.

Los siete contratos I01/I02/I07/I09/I10/I12/I13 pasan a pruebas ejecutables identificadas en los archivos de reservas y replay. Los otros diez contratos futuros se conservan como todo, separados de las aprobaciones. I06 sigue pendiente: bloquear cancelación no prueba redistribución. I03/I04/I11 siguen pendientes de 05/06.

La matriz de 22 casos adjunta distingue comprobación del prototipo, bloqueos seguros y UX pendiente. No equivale a aceptación final de LOG-03. Logs y datos sintéticos quedan en `Actualizacion_2026-10-24_Codex/04_EVIDENCIAS/`, fuera del commit. No se inspeccionaron las capturas originales de revisiones externas. Se inspeccionó y conservó NQP26-04_regresion_inventario_legacy.png, generada por E2E con datos sintéticos: muestra la interfaz ordinaria, no una pantalla de reservas. Sus etiquetas históricas de «stock físico» siguen derivándose del ledger; no acreditan un conteo observado y son deuda de UX para la integración posterior. Este es otro motivo para mantener inaccesible la interfaz al prototipo y dejar R04-21 parcial.

## Trazabilidad y siguientes pasos

Base `59d33bb9f1bcdd59106ceebce500a90e76cb1182`. PR #14 comprobado fusionado a las 18:04:19 UTC del 28/10/2026; no había PR abiertos en la consulta. Rama `codex/nqp26-04-reservas-parciales`, worktree separado. Los cambios y borrados locales del checkout original se conservaron.

Controles completos. Commit y PR borrador se registrarán al publicar esta entrega para revisión. Revisar en 05/06 redistribución de ingresos y liberaciones, prioridad explícita por fecha, adopción legacy, devolución/rectificación completa y UX integrada. No fusionar ni habilitar uso empresarial antes de ejecutar la aceptación conjunta 04+05+06 y cerrar la política de valoración aplicable.
