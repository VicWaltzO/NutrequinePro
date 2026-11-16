# NQP26-37 — Revisión independiente

Fecha: 2026-11-15. Revisor separado del agente implementador, por encargo explícito del usuario. Revisó el diff disponible contra `origin/main`, las instrucciones del repositorio y las rutas relevantes de autorización, ejecución y auditoría. No modificó la implementación ni ejecutó commit/push.

## Resultado

No se identificaron hallazgos P0–P2 en el diff revisado. El cambio de producción se limita a `shared/domain/permissions.mjs`: sustituye permisos por omisión por un catálogo explícito de 55 comandos, congela catálogo y listas, y rechaza comandos desconocidos. Los permisos ADMIN anteriores se preservan. `PRODUCTION_RECONCILE` se hace explícitamente ADMIN, coherente con la guarda preexistente en `features/produccion/domain/commands.mjs`. `CUSTOMER_DELETE` conserva ADMIN/OPERATOR.

Se comprobó por lectura que HTTP valida la sesión y CSRF antes del permiso, que el store vuelve a resolver actor activo antes de permiso/replay, y que el dispatcher vuelve a comprobar permiso antes del handler. Las guardas de confirmación por `PRODUCTION_SAVE`, conciliación, autorización técnica y modo de reservas permanecen. La auditoría común conserva autor, rol, fecha, acción, entidad y payload; el store incorpora request_id y contrato de replay. No se modificaron estos contratos en el diff.

## Prueba adversarial propia

Se ejecutó un script independiente mediante `node --input-type=module` desde app, con estado sintético de `substitutionFixture`, sin abrir SQLite ni usar datos reales. Resultado: salida 0; 421 comprobaciones sobre los 55 comandos.

- Extracción independiente de handlers y comparación exacta con el catálogo.
- Comparación de permisos efectivos con la lista ADMIN obtenida directamente de `git show origin/main:app/shared/domain/permissions.mjs`, incluyendo la guarda ADMIN preexistente de conciliación.
- ADMIN, OPERATOR, VIEWER y roles inválidos (OWNER, minúsculas, vacío y null).
- Rechazos del dispatcher sin mutación del estado original sintético.
- Tipos desconocidos, claves heredadas (`__proto__`, constructor, hasOwnProperty, toString), espacios, minúsculas, null, undefined, objeto, array y símbolo.
- Catálogo y listas congelados; intento de añadir VIEWER rechazado.

También se revisó la nueva matriz de pruebas HTTP, que cubre denegaciones por rol, sesión/CSRF, auditoría, replay, integridad SQLite y sustituciones. Esta revisión no ejecutó esa matriz ni atribuye sus resultados al revisor independiente.

## Límites

No se ejecutó verify ni E2E global para evitar concurrencia con las verificaciones del agente principal. Esta revisión no certifica todos los controles externos de la ficha ni el comportamiento positivo completo de cada uno de los 55 handlers. El alcance independiente fue el diff y las rutas necesarias para detectar regresiones de permisos/auditoría; los flujos de negocio existentes mantienen sus propias validaciones. No se consultaron credenciales, bases reales ni servicios externos.

SHA256 del archivo permissions.mjs revisado: 81E1325B7D010393E034E4CC70EB49F988E8DB26B0281673B3B431BD1AC9BBA7.

La copia reproducible de la prueba se conserva fuera del glob de tests, en C:\Users\vicve\AppData\Local\Temp\nqp37-independent-review\permissions-independent.test.mjs. Para repetirla, copiar temporalmente a app/tests/permissions-independent.test.mjs y ejecutar node --test tests/permissions-independent.test.mjs desde app; retirar esa copia antes de las comprobaciones globales si estas ya estaban en ejecución. Requiere que origin/main conserve la línea base de esta revisión (ba3a675227e96c1669add42d996d8971053f8ab3).

## Revalidación final — 2026-11-16

Se revisó la corrección de lint del ciclo 2/2 en la prueba HTTP: la expresión `/^  ([A-Z_]+):/gm` pasa a `/^ {2}([A-Z_]+):/gm`. Ambas exigen exactamente dos espacios literales antes del nombre y conservan captura y flags. Una comprobación independiente mediante Node comparó sus resultados sobre el dispatcher real y nueve casos adversariales de espacios/nombres; pasó sin diferencias. No cambia la implementación ni el alcance de la prueba.

Se volvió a calcular SHA256 de permissions.mjs y coincide con el valor anterior. Se mantiene el cierre sin hallazgos P0–P2 en el alcance revisado. El agente principal comunicó 773 pruebas (767 PASS, 0 FAIL, 6 TODO) y tres comprobaciones TypeScript PASS en el intento previo; esos resultados son evidencia reportada por el agente principal, no una ejecución independiente. El nuevo verify global queda a cargo del agente principal y esta acta no anticipa su resultado.
