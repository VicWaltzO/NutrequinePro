# NQP26-01 · Reporte de diseño y pruebas de invariantes

Fecha: 24 de octubre de 2026. Zona operativa: America/Lima. Estado: En revisión; diseño y controles locales cerrados, pendiente de aceptación técnica externa y de las implementaciones futuras identificadas.

## Necesidad y resultado

El diagnóstico identificó que committed suma demanda, sin reserva firme, y que producción mezcla preparación e ingreso de sacos. Se necesitaba fijar conservación, transiciones y evidencia antes de cambiar pantallas o lógica de negocio.

Se elaboraron el [contrato de invariantes](NQP26-01_CONTRATO_INVARIANTES.md) y la [matriz I01–I20](NQP26-01_MATRIZ_PRUEBAS.md). Cubren unidades, físico/comercial/cobertura/faltante, cobro separado, asignación por prioridad, corte histórico, compra/gasto único, consumo real, costo congelado y permisos. Se propone cargo comercial por unidad cubierta vinculado a asignación, sin restarlo dos veces ni descontarlo otra vez al entregar. Es una propuesta de diseño explícita para revisión, no motor nuevo implementado.

El operador conserva el comportamiento actual: no hay cambios en interfaz, ventas, producción, compras, permisos ni bases. Las reservas parciales, recepción real del molino y micros siguen pendientes en sus tareas. Las dosis, existencias iniciales y recetas reales no se inventaron ni se cargaron.

## Base y aislamiento

Git fetch comprobó main `43206560277b704b5c16da5c01702f0cffb97e3f`. Rama nueva `codex/nqp26-01-invariantes`, copia Git aislada `C:\Users\vicve\.codex\worktrees\nqp26-01-invariantes\Nutrequine Pro`. Node v24.18.0; npm 11.16.0. La carpeta original conserva AGENTS.md modificado, eliminaciones de demo y carpetas locales sin seguimiento. No se incorporan. El PR #11 sigue en borrador, sin fusionar.

NQP26-00 se corrigió exclusivamente en su rama: commit `fb3f9ce`, revisión documental, zona operativa y SHA/enlace de entrega original. No se cherry-pickea ese documento ni su commit en 01. La revisión externa habilita diseñar 01, pero 00 permanece En revisión.

Se leyeron instrucciones raíz y app/AGENTS.md, ficha 01, plan maestro, fuentes A/B, informe 00 y revisión/orden de trabajo del ZIP. Las referencias del kit sirven como requisitos; las afirmaciones de implementación se contrastan con código y ejecuciones.

## Archivos de la tarea y evidencia

- app/docs/actualizacion-seguridad/NQP26-01_CONTRATO_INVARIANTES.md: glosario, alternativas, propuesta, transiciones, permisos, conservación y compatibilidad.
- app/docs/actualizacion-seguridad/NQP26-01_MATRIZ_PRUEBAS.md: veinte casos, deuda, pruebas históricas y condiciones para activar cada todo.
- app/docs/actualizacion-seguridad/NQP26-01_REPORTE.md: este reporte.
- app/tests/nqp26-invariants.test.mjs: I05/I08/I20/DC01 en memoria y disco; 17 todo explícitos.

No hay cambios en app/lib, features, server, client, SQL o dependencias. El fixture de memoria utiliza SQLite; los casos de disco usan el adaptador real con archivos temporales externos a la instalación y limpieza segura existente. La inyección SQL solo añade una FK inválida a un batch real para comprobar rollback, sin simular resultados del dominio.

## Ejecuciones reales de 01

| Comando / procedimiento                                             | Resultado actual                                                                                                                                            | Evidencia local                      |
| ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| npm.cmd ci --prefix app --ignore-scripts                            | Aprobado; 400 paquetes, sin cambiar lockfile                                                                                                                | Salida real de herramienta           |
| node --test app/tests/nqp26-invariants.test.mjs (desde raíz)        | 25 registrados: 8 aprobados, 0 fallidos/cancelados/omitidos, 17 todo; código 0                                                                              | 04_EVIDENCIAS/NQP26-01_dirigidas.log |
| Probe Node runCommand con cuerpo distinto y replay tras degradación | Defectos reproducidos, sin escribir datos empresariales; código 0 de reproducción, no corrección                                                            | 04_EVIDENCIAS/NQP26-01_probes.log    |
| npm.cmd run verify (desde app)                                      | Aprobado, código 0: 258 registrados, 241 aprobados, 17 todo, 0 fallidos/cancelados/omitidos; tres TypeScript, lint, formato, build y distribución correctos | 04_EVIDENCIAS/NQP26-01_verify.log    |
| REGRESSION_BROWSER_CHANNEL=chrome; npm.cmd run test:e2e             | Primera suite: 29 registrados, 28 aprobados, 1 fallo por timeout de arranque en B; 0 cancelados/omitidos/todo. Código 1; duración 763293,9508 ms            | 04_EVIDENCIAS/NQP26-01_e2e.log       |
| Prettier de archivos nuevos, revisión de diff y exclusiones         | Aprobados para los cuatro archivos nuevos; diff preparado revisado y exclusiones comprobadas                                                                | Git y salida de herramientas         |

No se reutilizan las 233/29 aprobaciones de 00 como pruebas nuevas. La suite de 01 debe contar los todo aparte. Los 17 contratos no se ejecutaron y no son aprobaciones. La suite E2E existente prueba respaldo/restauración y transacciones actuales con datos sintéticos; no prueba la futura migración de reservas o micros.

## Hallazgos, riesgos y decisiones abiertas

- La reserva efectiva no existe: el total committed no es K y no protege existencias; I01–I04/I06/I07 siguen pendientes.
- request_id deduplica por actor/ID sin comparar tipo/cuerpo; probe devuelve resultado anterior ante otro contenido. Además replay de una acción anterior no revalida permiso de un actor degradado activo; no escribe nada nuevo, pero debe corregirse en T03/04.
- Confirmar producción ingresa sacos calculados antes del cierre real. DC01 prueba que reconfirmar falla sin cambios, no que la recepción esté bien separada. I15–I17 siguen pendientes.
- Snapshot existente y rollback probado no acreditan costo histórico inmutable bajo futuras rectificaciones de cerrados. I13/I18 necesitan fixtures y compensaciones propias.
- Propuesta A requiere enlaces de cobertura a cargos con identificadores estables y versión/adopción; el detalle de persistencia se revisa en 04. No llamar físico al ledger comercial ni inventar retiros observados.
- El reparto de costos comunes por producto se decide en 31; recetas/dosis y saldo inicial requieren datos aprobados en 20/24. Los permisos nuevos se concretan en 37, sin ampliar ADMIN indiscriminadamente.

## Criterios y continuidad

Tabla de transiciones, reintentos/concurrencia/atomicidad, unidades 25/50/2,2 kg y plan de no reescritura están especificados. Pruebas acotadas de duplicación, pago y rollback se ejecutaron. Los controles globales de verify pasaron en esta ejecución; E2E comprobó respaldo/restauración en copia. La suite E2E inicial tuvo 28 aprobadas y un timeout previo al inicio del escenario B; B pasó por separado sin modificaciones. No se afirma una suite completa E2E verde en la primera ejecución. La aceptación de migraciones futuras permanece pendiente; no afirmar que se conservarán datos reales sin ensayarlas.

Siguientes tareas: 02/03 para carrito, 06 para fecha, y 04/05 después de la revisión del contrato. Micros 20/21 antes de compra/consumo/costo. No se inicia implementación cruzada ni se crean PR/Issues anticipados.

Commit, PR y cierre de resultados se incorporan al terminar. La copia local se guarda en Actualizacion_2026-10-24_Codex/03_REPORTES; el estado se actualiza a En revisión solamente cuando termine la verificación y se presente el PR independiente. No fusionar ni desplegar.

## Cierre de verificación y límites

verify terminó con código 0: 258 pruebas registradas, 241 aprobadas, 17 todo y cero fallidas/canceladas/omitidas; suite general 338543,5824 ms. Las 17 todo no son aprobaciones. Tipos global/cliente/servidor, lint, formato, build y auditoría de distribución correctos: 2071 archivos, 69 paquetes de runtime, cero archivos privados y cero paquetes retirados.

E2E inicial cerró con código 1 por `No inició: TEST_NETWORK_GUARD_ACTIVE`, en tests/helpers/local-app-server.mjs:109: el proceso de la integración B no emitió LISTENING dentro de 60 segundos, antes de comenzar su escenario. Las otras 28 pruebas pasaron. Se conservó el fallo íntegro y no se aumentó el timeout ni se cambió código/aserciones. No quedó determinada la causa del retraso inicial.

Repetición dirigida real desde app: `$env:REGRESSION_BROWSER_CHANNEL='chrome'; node --test --test-name-pattern='Integración 12 B' tests/local-e2e/integration.test.mjs`. Resultado: 1 registrada/aprobada, 0 fallidas/canceladas/omitidas/todo, código 0, duración 21730,8819 ms. Evidencia: 04_EVIDENCIAS/NQP26-01_e2e_integracionB_repeticion.log. En total se comprobaron los 29 escenarios por primera ejecución y repetición, pero no se presenta eso como una única suite completa sin fallos. Queda registrado el riesgo de arranque intermitente del entorno de pruebas, sin atribuirlo a una causa no demostrada.

Solo cambiaron tres documentos y un archivo de pruebas. Permanece sin tocar todo el código de aplicación, esquema, dependencias, configuración y datos empresariales. La propuesta de representación A y el reparto específico de costos comunes requieren revisión técnica en sus tareas; este PR no los habilita operativamente. Las copias locales de los tres documentos se sincronizan manualmente al publicar, y los logs permanecen fuera de Git.
