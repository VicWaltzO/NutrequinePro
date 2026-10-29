# NQP26-06 · Fecha prevista de entrega independiente

Estado: en revisión; validación local aprobada. Fecha de trabajo: 28 de octubre de 2026, America/Lima.

## Problema y resultado

La venta solo guardaba su fecha comercial. Ahora guarda también la fecha prevista de entrega y si el usuario decidió mantenerla independiente. Comienza con el mismo día de venta; sigue sus cambios hasta una edición manual. La casilla «Mantener esta fecha de entrega al cambiar la fecha de venta» permite expresar esa decisión incluso cuando los dos días visibles coinciden. Desmarcarla restablece expresamente la sincronización.

Un administrador puede abrir el detalle de un pedido confirmado pendiente y elegir «Cambiar fecha de entrega». El formulario envía únicamente la venta, la nueva fecha y el motivo. Conserva líneas, reservas firmes, faltantes, movimientos, cobros y costos. La modificación queda en auditoría e historial con valores anterior y nuevo. No cambia el estado comercial del pedido ni registra su entrega física.

Se aceptan regularizaciones con entrega anterior a venta. La interfaz avisa; al crear o confirmar se guardan ambas fechas en el comando auditado, y al reprogramar se exige además motivo. No se añade una prohibición de entrega mayor o igual a venta.

## Jerarquía y base real

Se aplicó revisión técnica → matriz de aceptación → orden de ejecución, contrastadas con LOG-01, R24/R25/R27, contrato 01, decisión 04 y código efectivo.

La consulta GitHub encontró los PR #11–#15 ya fusionados. En particular, #15 dejó de ser borrador y fue fusionado el 29/10/2026 a las 03:08:41 UTC, equivalente al 28/10 en Lima. La base verificada es origin/main `ead53fa19fe5af6ed4e1cef31f518eef90ceefcd`; cabeza de #15 `35eebab9d10029873e2c8609083a092add29f251`. Esta ejecución no fusionó esos PR ni modificó main.

Se creó un worktree limpio y la rama `codex/nqp26-06-fecha-entrega`. Los cambios ajenos del checkout original se conservaron. La recomendación de mantener #15 abierto ya no era ejecutable; se documenta el estado encontrado, sin revertir una integración ajena. El PR nuevo debe permanecer en borrador.

## Contrato y rutas

Inspección previa: `features/ventas/components/SaleForm.tsx`, `hooks/useSaleFormState.ts`, `shared/types/forms.ts`, `shared/types/domain.ts`, `features/ventas/domain/commands.mjs` (saleSave/saleCorrect), `summary.mjs`, `coverage.mjs`, `shared/domain/permissions.mjs`, `lib/application-store.mjs`, `lib/execute-command.mjs`, `server/application.mts`, formularios de reapertura y suites locales.

- Campos JSON aditivos en Sale: `delivery_date` y `delivery_date_manual_override`. Ambos se guardan dentro del documento existente; no cambian SQL, tablas, migraciones ni dependencias.
- `SALE_SAVE` conserva el valor manual al guardar un borrador desde clientes que omiten los campos nuevos. Un día enviado expresamente sin booleano se trata como manual. Un booleano falso con fecha distinta de venta se rechaza por ambigüedad.
- `SALE_DELIVERY_DATE_UPDATE`: solo ADMIN, pedido CONFIRMED/RECTIFIED y PENDING, campos permitidos `id/delivery_date/reason`. Reutiliza autenticación, request_id, comparación canónica, auditoría, guarda de revisión y transacción. OPERATOR conserva su permiso de captura y edición de borradores; no se amplía su permiso sobre pedidos confirmados.
- `SALE_CORRECT` no acepta cambiar la fecha: exige la operación específica. Mantiene el bloqueo de rectificación comercial de reservas de 04.
- `deliveryDay` valida calendario gregoriano real y formato YYYY-MM-DD sin convertirlo en instante UTC. La captura del día actual ya usa America/Lima.
- `compareDeliveryPriority`: entrega ascendente, created_at convertido a instante UTC ascendente, ID estable ascendente mediante comparación de código, sin localeCompare. `pendingCoveragePriority` devuelve solo ventas de cobertura versión 1, pendientes, con faltante y fecha propia. No asigna inventario ni se conecta a entradas.

## Históricos y compatibilidad con 04

Lectura conservadora: si falta fecha, la interfaz muestra el día de venta indicando «sin fecha propia». No lo persiste al leer, al arrancar ni al guardar otros documentos. La reprogramación expresa de un pedido legacy puede guardar su fecha con historial; no crea coverage_version ni lo incorpora a reservas. La adopción legacy sigue pendiente y bloqueada en el prototipo.

La base ya incluye 04, por lo que el ensayo local utiliza su composición experimental real sobre bases sintéticas, junto con 06. No hace falta copiar código ni fusionar otra rama. El ensayo HTTP crea K=1/N=1, con un pago, y reprograma conservando líneas, enlaces, cobros, costos y movimientos completos. Los ensayos de 04 siguen verificando las protecciones y el rechazo del arranque ordinario sobre bases experimentales.

Se incluyó la operación nueva en el cerrojo de composición. No se añadió bandera pública ni se habilitó partialReservations en el servidor ordinario. La composición experimental sigue sin servir interfaz operativa.

La corrección documental O7 sustituye America/Bogota por America/Lima en el informe 04; no cambia horas, resultados ni evidencias históricas.

## Verificación

Verify-03 completo terminó con código 0: 297 aprobadas, diez todo intactos, cero fallidas/canceladas/omitidas; los tres TypeScript, lint, formato, build completo y auditoría de distribución correctos. Distribución: 2076 archivos, 69 paquetes de runtime, cero privados y cero paquetes retirados. Evidencia local: NQP26-06_verify-03.log.

Dirigidas-03: 40 aprobadas, cero fallidas/omitidas/todo. Incluyen fechas y compatibilidad con el motor 04 real, rollback y dos conexiones independientes. No se suman al total general como pruebas distintas. UI de desarrollo-03: una prueba aprobada con guardado, reinicio de proceso, confirmación, reprogramación autorizada y rechazo de petición anónima. Capturas revisadas en 1440 y 390 píxeles, claro/oscuro, sin desbordamiento; se inspeccionó también el formulario de reprogramación en ambos tamaños. El detector Impeccable devolvió [].

E2E-01 completo terminó con 30 aprobadas y un fallo de la prueba nueva. La aserción de teclado asumía que un solo Tab sale de un input de fecha; Chrome tiene segmentos internos de día, mes y año. Se reprodujo aisladamente (e2e-fechas-01), se corrigió el recorrido de Tab manteniendo una cota de ocho pasos y sin ampliar ningún timeout, y e2e-fechas-02 aprobó el flujo completo sobre el compilado. No hubo cambio de código de aplicación después de verify-03. Lint se repitió para el ensayo corregido. La corrida completa E2E-02 aprobó 31/31, con cero fallidas, canceladas, omitidas o todo, código de salida 0. Se ejecutó completa en una sola corrida después del build de verify-03. La repetición aislada no se suma a las 30 anteriores.

Las pruebas rojas iniciales están en NQP26-06_rojo.log. Las incidencias de preparación quedan en dirigidas-01/02 y ui-dev-01: el sistema impedía degradar al último administrador con credenciales, una conexión de prueba seguía abierta al limpiar y el ensayo UI esperaba cierre donde la aplicación abre el detalle. Se corrigieron los fixtures y las expectativas de navegación; no se debilitaron las protecciones ni se aumentaron timeouts.

Verify-01 ejecutó 304 pruebas: 293 aprobadas, un fallo y diez todo. Falló la referencia HTML, antes de ejecutar tipos/lint/build. Se contrastó el renderizado de la base exacta ead53fa con el nuevo. Se conservó la tabla de ventas sin añadir información fuera del formulario y detalle; así solo cambian los tres modales de venta, rectificación y detalle. Tras revisar las capturas se actualizaron únicamente esas tres huellas de comparación HTML en ui-corporate.json. Las demás huellas son idénticas a la base. No se modificó ui-baseline.json ni snapshots históricos de negocio. Evidencia: NQP26-06_html-review.log.

Verify-02 aprobó 297 pruebas ejecutables, conservó diez todo y aprobó los tres TypeScript. Lint detectó tres condicionales anidados en el módulo nuevo. Se sustituyeron por condiciones simples, sin cambiar el contrato ni las expectativas. La ejecución final se registra por separado. Una comprobación separada de formato detectó finales CRLF en archivos editados; se normalizaron con Prettier. NQP26-06_estilo.log acredita lint y formato aprobados.

## Pendiente y no comprobado

05 debe consumir la prioridad dentro de la misma escritura que repone/libera, respetar producto y presentación, conservar K, atender únicamente N, resolver cancelación/devolución y adopción explícita legacy y planificar desde el faltante. Las fechas listas no prueban asignación automática: I03/I04/I06/I11 no se convierten a verde por ordenar una lista. Los diez test.todo de 04 se conservan.

R04-21 sigue parcial. No se certifica inventario físico observado ni aceptación operativa del motor. La valoración y consistencia de costos de 31/33 siguen pendientes para habilitación empresarial. No se probó con base empresarial, teléfono físico o lector de pantalla real. Sin despliegue.

## Entrega

Rama independiente `codex/nqp26-06-fecha-entrega`. Commit y enlace del PR se registrarán tras la publicación. La matriz conserva sin alteración los 18 escenarios, resultados esperados, métodos y prioridades originales. Evidencias y capturas quedan en la carpeta local del responsable, fuera de Git. La bitácora registra por separado la revisión humana pendiente.
