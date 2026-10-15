# Matriz de regresión — Tarea 02

Base anterior: `36d8cb3`, 55 pruebas. Fecha: 14/10/2026, America/Bogota.
Esta matriz compara comportamientos, no porcentajes de cobertura de líneas. Los IDs R/H/B/N son referencias estables para repetir escenarios en el destino.
La columna de migración permanece pendiente: no hay autenticación local, adaptador de disco o servidor Node nuevos en esta tarea.

## Suite anterior conservada

Las 55 pruebas anteriores vuelven a ejecutarse en la suite de 89 pruebas. Los nombres siguientes proceden del commit base; ninguna fixture se reemplaza.

| ID      | Comportamiento anterior protegido                                                            | Archivo en app/tests               | Actual   | Tras migración |
| ------- | -------------------------------------------------------------------------------------------- | ---------------------------------- | -------- | -------------- |
| BASE-01 | A: 8/4/3 núcleos, 600 sacos, fórmula separada, descuentos, costos reales e inventario        | `acceptance.test.mjs`              | Aprobado | Pendiente      |
| BASE-02 | B: contado atómico, varios productos, precio especial y salida física                        | `acceptance.test.mjs`              | Aprobado | Pendiente      |
| BASE-03 | C: crédito, parcial, pagada, saldo cero e historial                                          | `acceptance.test.mjs`              | Aprobado | Pendiente      |
| BASE-04 | D: una transferencia y tres aplicaciones                                                     | `acceptance.test.mjs`              | Aprobado | Pendiente      |
| BASE-05 | E: stock 80, venta 120, lote DRAFT, confirmación y entrega posterior                         | `acceptance.test.mjs`              | Aprobado | Pendiente      |
| BASE-06 | F: rectificación de cantidad entregada, snapshot y compensación                              | `acceptance.test.mjs`              | Aprobado | Pendiente      |
| BASE-07 | BASE utiliza parámetros: 30 sacos de 50kg y fórmula de 1501kg                                | `acceptance.test.mjs`              | Aprobado | Pendiente      |
| BASE-08 | snapshots no cambian con precios o fórmula posteriores                                       | `acceptance.test.mjs`              | Aprobado | Pendiente      |
| BASE-09 | pago excedente bloquea rectificación y anulación hasta reversión explícita                   | `acceptance.test.mjs`              | Aprobado | Pendiente      |
| BASE-10 | validaciones de pago: cliente, saldo, suma, aplicación duplicada y anulada                   | `acceptance.test.mjs`              | Aprobado | Pendiente      |
| BASE-11 | devolución física sin descuento automático y anulación sin doble entrada                     | `acceptance.test.mjs`              | Aprobado | Pendiente      |
| BASE-12 | un gasto vinculado entra una sola vez al costo y al balance                                  | `acceptance.test.mjs`              | Aprobado | Pendiente      |
| BASE-13 | cierre requiere cobros reales y confirmado, anulaciones preservan consumo                    | `acceptance.test.mjs`              | Aprobado | Pendiente      |
| BASE-14 | precisión monetaria y búsqueda normalizada                                                   | `acceptance.test.mjs`              | Aprobado | Pendiente      |
| BASE-15 | roles y último administrador                                                                 | `acceptance.test.mjs`              | Aprobado | Pendiente      |
| BASE-16 | borradores no generan cuenta por cobrar ni stock                                             | `acceptance.test.mjs`              | Aprobado | Pendiente      |
| BASE-17 | gasto pagado de lote borrador se conserva al editar y confirmar                              | `acceptance.test.mjs`              | Aprobado | Pendiente      |
| BASE-18 | anular producción no hace desaparecer egresos ya registrados                                 | `acceptance.test.mjs`              | Aprobado | Pendiente      |
| BASE-19 | cantidades e importes extremos no pierden precisión silenciosamente                          | `acceptance.test.mjs`              | Aprobado | Pendiente      |
| BASE-20 | rectificación de producción usa snapshots y compensa stock y consumo                         | `acceptance.test.mjs`              | Aprobado | Pendiente      |
| BASE-21 | rectificación no reduce producción por debajo de stock consumido                             | `acceptance.test.mjs`              | Aprobado | Pendiente      |
| BASE-22 | operador edita fórmula mediante versión; lector rechazado; snapshots intactos                | `acceptance.test.mjs`              | Aprobado | Pendiente      |
| BASE-23 | eliminar cliente conserva deuda, pagos, vínculos e historial                                 | `acceptance.test.mjs`              | Aprobado | Pendiente      |
| BASE-24 | inicialización concurrente conserva un solo administrador y no reinicia la base              | `application-store.test.mjs`       | Aprobado | Pendiente      |
| BASE-25 | un reintento idempotente no duplica registros ni auditoría; otra identidad no puede escribir | `application-store.test.mjs`       | Aprobado | Pendiente      |
| BASE-26 | comandos simultáneos con revisión obsoleta no sobrescriben cambios y pueden reintentarse     | `application-store.test.mjs`       | Aprobado | Pendiente      |
| BASE-27 | casos de uso reales guardan venta, entrega, cobro y crédito juntos y sobreviven a la recarga | `application-store.test.mjs`       | Aprobado | Pendiente      |
| BASE-28 | el store revierte un batch inválido completo y el dispatcher rechaza propiedades heredadas   | `application-store.test.mjs`       | Aprobado | Pendiente      |
| BASE-29 | los módulos de aplicación no contienen ciclos de dependencias en ejecución                   | `architecture.test.mjs`            | Aprobado | Pendiente      |
| BASE-30 | dominio puro y componentes compartidos conservan sus límites de dependencia                  | `architecture.test.mjs`            | Aprobado | Pendiente      |
| BASE-31 | overlapping commands are blocked and a failed operation retains its retry ID                 | `browser-state.test.mjs`           | Aprobado | Pendiente      |
| BASE-32 | browser snapshots respect saved theme, system preference, hash navigation and cleanup        | `browser-state.test.mjs`           | Aprobado | Pendiente      |
| BASE-33 | company settings retain historical operations, validate defaults and record an audit         | `configuration.test.mjs`           | Aprobado | Pendiente      |
| BASE-34 | invalid company defaults and non-admin writes leave the original state intact                | `configuration.test.mjs`           | Aprobado | Pendiente      |
| BASE-35 | D1 vacío aplica migración y una base histórica completa se reconoce sin repetirla            | `local-database.test.mjs`          | Aprobado | Pendiente      |
| BASE-36 | D1 bloquea esquema parcial o distinto sin planificar escrituras destructivas                 | `local-database.test.mjs`          | Aprobado | Pendiente      |
| BASE-37 | D1 solo aplica migraciones pendientes y rechaza historiales ajenos o sin esquema             | `local-database.test.mjs`          | Aprobado | Pendiente      |
| BASE-38 | base vacía deja que Wrangler aplique la migración inicial                                    | `local-migrations.test.mjs`        | Aprobado | Pendiente      |
| BASE-39 | reconoce la importación manual completa sin cambiar sus datos                                | `local-migrations.test.mjs`        | Aprobado | Pendiente      |
| BASE-40 | rechaza una importación parcial o columnas distintas sin adoptar la migración                | `local-migrations.test.mjs`        | Aprobado | Pendiente      |
| BASE-41 | una base con historial continúa con las migraciones posteriores                              | `local-migrations.test.mjs`        | Aprobado | Pendiente      |
| BASE-42 | la adopción rechaza índices faltantes y no modifica los registros                            | `local-migrations.test.mjs`        | Aprobado | Pendiente      |
| BASE-43 | contado parcial conserva deuda y cobro real exacto, sin exigir pago total                    | `payment-credit-delivery.test.mjs` | Aprobado | Pendiente      |
| BASE-44 | contado sin pago no crea cobro ficticio ni exige método                                      | `payment-credit-delivery.test.mjs` | Aprobado | Pendiente      |
| BASE-45 | pago excedente mantiene saldo a favor y su aplicación no duplica caja                        | `payment-credit-delivery.test.mjs` | Aprobado | Pendiente      |
| BASE-46 | un pago distribuido conserva el resto; crédito no cruza clientes ni supera deuda             | `payment-credit-delivery.test.mjs` | Aprobado | Pendiente      |
| BASE-47 | venta futura con lote producido entrega sin descontar compromisos dos veces                  | `payment-credit-delivery.test.mjs` | Aprobado | Pendiente      |
| BASE-48 | reproduce faltante 20 Hi-Performance, entrega atómica y éxito tras completar lote            | `payment-credit-delivery.test.mjs` | Aprobado | Pendiente      |
| BASE-49 | stock exige también peso y agrupa líneas del mismo producto                                  | `payment-credit-delivery.test.mjs` | Aprobado | Pendiente      |
| BASE-50 | migración, datos iniciales y round-trip persistente                                          | `persistence.test.mjs`             | Aprobado | Pendiente      |
| BASE-51 | venta contado, pago, aplicación e inventario se guardan juntos                               | `persistence.test.mjs`             | Aprobado | Pendiente      |
| BASE-52 | fallo de integridad revierte todas las escrituras del batch                                  | `persistence.test.mjs`             | Aprobado | Pendiente      |
| BASE-53 | revision guard bloquea escrituras simultáneas desde datos obsoletos                          | `persistence.test.mjs`             | Aprobado | Pendiente      |
| BASE-54 | saldo a favor persiste, se aplica una sola vez y conserva caja e historial                   | `persistence.test.mjs`             | Aprobado | Pendiente      |
| BASE-55 | vistas por rol, rutas antiguas y formularios conservan el HTML anterior a la extracción      | `ui-regression.test.mjs`           | Aprobado | Pendiente      |

## Nuevos escenarios de negocio y contratos HTTP

R usa store real y SQLite en memoria. H ejecuta el código real de las rutas con Request/Response, identidad y conexión suministradas por el harness; no es una prueba de red.

| ID  | Comportamiento y resultado esperado                                                         | Archivo en app/tests              | Actual   | Tras migración |
| --- | ------------------------------------------------------------------------------------------- | --------------------------------- | -------- | -------------- |
| R01 | céntimos y gramos extraordinarios sobreviven al store sin redondeos monetarios dobles       | `regression-business.test.mjs`    | Aprobado | Pendiente      |
| R02 | costo por gramos redondea medio céntimo una vez y congela el precio de insumo               | `regression-business.test.mjs`    | Aprobado | Pendiente      |
| R03 | fechas imposibles, fracciones de saco y exceso de decimales rechazan sin efectos            | `regression-business.test.mjs`    | Aprobado | Pendiente      |
| R04 | duplicados normalizados requieren confirmación y sedes se reasocian sin borrar historia     | `regression-business.test.mjs`    | Aprobado | Pendiente      |
| R05 | retirar cliente bloquea ventas nuevas y permite cobrar deuda conservando vínculos           | `regression-business.test.mjs`    | Aprobado | Pendiente      |
| R06 | producto no vendible y sede inactiva no crean venta, pago o auditoría                       | `regression-business.test.mjs`    | Aprobado | Pendiente      |
| R07 | borrador editado confirma una sola vez y conserva sus líneas anteriores                     | `regression-business.test.mjs`    | Aprobado | Pendiente      |
| R08 | ajustes validan sacos y gramos por separado y no permiten stock negativo                    | `regression-business.test.mjs`    | Aprobado | Pendiente      |
| R09 | devolución acumulada, reducción económica y anulación restituyen solo el remanente          | `regression-business.test.mjs`    | Aprobado | Pendiente      |
| R10 | devolución inválida tras una línea válida y rebaja excesiva no dejan movimientos            | `regression-business.test.mjs`    | Aprobado | Pendiente      |
| R11 | rectificación conserva referencia, líneas anteriores y snapshots y compensa gramos exactos  | `regression-business.test.mjs`    | Aprobado | Pendiente      |
| R12 | producción pasa DRAFT a CONFIRMED a CLOSED y no duplica consumos al reconfirmar             | `regression-business.test.mjs`    | Aprobado | Pendiente      |
| R13 | producción consumida no se anula ni rectifica a cero y conserva el stock                    | `regression-business.test.mjs`    | Aprobado | Pendiente      |
| R14 | pago OTHER exige descripción y conserva centavos sin aplicar y reversiones en su fecha      | `regression-business.test.mjs`    | Aprobado | Pendiente      |
| R15 | desactivación bloquea reintento y degradación a VIEWER bloquea comandos nuevos              | `regression-business.test.mjs`    | Aprobado | Pendiente      |
| R16 | mismo request_id de actores activos distintos mantiene autoría y resultados separados       | `regression-business.test.mjs`    | Aprobado | Pendiente      |
| R17 | escenario portable de contado, crédito y entrega conserva caja e idempotencia               | `regression-business.test.mjs`    | Aprobado | Pendiente      |
| R18 | lote de venta contado con segunda línea inválida revierte venta, caja, stock y auditoría    | `regression-business.test.mjs`    | Aprobado | Pendiente      |
| R19 | fallo SQL tras venta, pago y stock planeados revierte el batch completo y permite reintento | `regression-business.test.mjs`    | Aprobado | Pendiente      |
| R20 | entregas concurrentes generan una sola salida y rechazan la revisión obsoleta               | `regression-business.test.mjs`    | Aprobado | Pendiente      |
| R21 | operador crea maestros permitidos, versión de fórmula, borrador, venta, cobro y gasto       | `regression-permissions.test.mjs` | Aprobado | Pendiente      |
| R22 | operador no ejecuta acciones administrativas ni confirma mediante SAVE o concilia por alias | `regression-permissions.test.mjs` | Aprobado | Pendiente      |
| R23 | VIEWER rechaza cada comando público y conserva revisión, auditoría y todas las entidades    | `regression-permissions.test.mjs` | Aprobado | Pendiente      |
| R24 | administrador conserva último ADMIN activo y no pierde autoría al cambiar nombre            | `regression-permissions.test.mjs` | Aprobado | Pendiente      |
| H01 | GET y POST sin identidad devuelven 401 antes de acceder a D1                                | `http-contract.test.mjs`          | Aprobado | Pendiente      |
| H02 | GET autenticado entrega actor y estado persistente con Cache-Control no-store               | `http-contract.test.mjs`          | Aprobado | Pendiente      |
| H03 | identidad desconocida o desactivada recibe 403 sin exponer el estado                        | `http-contract.test.mjs`          | Aprobado | Pendiente      |
| H04 | VIEWER consulta con 200 pero POST responde 422 y no modifica ninguna entidad                | `http-contract.test.mjs`          | Aprobado | Pendiente      |
| H05 | POST real guarda comando y repite resultado sin duplicar revisión ni auditoría              | `http-contract.test.mjs`          | Aprobado | Pendiente      |
| H06 | Origin ajeno y cuerpo sobre el límite retornan 403 y 413 antes de guardar                   | `http-contract.test.mjs`          | Aprobado | Pendiente      |
| H07 | comando desconocido, request_id inválido y payload array son 422 sin efectos                | `http-contract.test.mjs`          | Aprobado | Pendiente      |
| H08 | JSON malformado conserva el contrato actual 503 y no filtra detalles técnicos               | `http-contract.test.mjs`          | Aprobado | Pendiente      |
| H09 | indisponibilidad de D1 devuelve 503 genérico tanto en lectura como escritura                | `http-contract.test.mjs`          | Aprobado | Pendiente      |
| H10 | clientes de mismo origen sin cabecera Origin siguen admitidos por el contrato actual        | `http-contract.test.mjs`          | Aprobado | Pendiente      |

R22 verifica 16 negativas administrativas del operador, incluidos SAVE con confirmación y los dos alias de conciliación. R23 verifica los 26 comandos públicos para VIEWER. No se cuentan esas combinaciones como nuevas pruebas independientes.
R19 inyecta un fallo de FK al final del batch de escritura comercial: la lectura inicial pasa, y venta/pago/stock/auditoría/revisión deben revertirse juntos.

## Red y navegador

Instancia portable y D1 con persistencia sintética nueva; Chrome headless. B son formularios y controles reales, con validación posterior del estado persistido por API.
N03 repite el mismo escenario portable de R17 a través de HTTP real, sin reimplementar cálculos esperados.

| ID  | Flujo                                                                        | Actual   | Tras migración |
| --- | ---------------------------------------------------------------------------- | -------- | -------------- |
| N01 | 401 de red y cabeceras de identidad falsificadas no autentican               | Aprobado | Pendiente      |
| N02 | sesión portable y contratos de error de red conservan el estado              | Aprobado | Pendiente      |
| N03 | escenario portable reutilizado por HTTP real con D1 local                    | Aprobado | Pendiente      |
| B01 | administrador crea cliente en formulario y la recarga lo conserva            | Aprobado | Pendiente      |
| B02 | lote DRAFT se confirma desde detalle y produce cuarenta sacos                | Aprobado | Pendiente      |
| B03 | venta contado entregada guarda céntimos, gramos y saldo a favor              | Aprobado | Pendiente      |
| B04 | venta futura se entrega y reutiliza excedente sin otro cobro                 | Aprobado | Pendiente      |
| B05 | rectificación de venta conserva motivo e historia                            | Aprobado | Pendiente      |
| B06 | devolución física agrega historia sin reducción económica implícita          | Aprobado | Pendiente      |
| B07 | reversión del pago libera también su crédito y anulación no duplica retornos | Aprobado | Pendiente      |
| B08 | gasto, balance, tema, recarga y navegación móvil                             | Aprobado | Pendiente      |
| N04 | salida de sesión de red vuelve a 401 sin alterar operaciones                 | Aprobado | Pendiente      |

## Escenarios preparados o pendientes

| ID              | Invariante para el destino                                                       | Estado actual y condición para automatizar                                                     |
| --------------- | -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| LOCAL-AUTH-01   | Login, expiración/revocación y logout impiden consultar después de cerrar sesión | Preparado como acciones; requiere autenticación local nueva                                    |
| LOCAL-AUTH-02   | Vincular credenciales a un ID histórico conserva autoría y permisos              | Preparado como acciones; requiere cuentas/sesiones locales nuevas                              |
| SQLITE-DISK-01  | Contado/crédito, cierre del proceso y reinicio conservan estado                  | Escenario portable listo; falta adaptador SQLite en disco y lifecycle destino                  |
| NODE-OFFLINE-01 | Arranque, login y operación con red externa bloqueada; solo loopback             | Acciones preparadas; falta servidor/distribución independiente                                 |
| P01             | Cuentas ADMIN/OPERATOR/VIEWER reales en navegador                                | HTTP de handlers y SSR de roles cubiertos; el mock portable solo aporta una identidad          |
| P02             | Restart del proceso Vinext sobre la misma D1 sintética                           | Recarga del navegador y store cubiertas; reinicio completo no incluido en esta suite           |
| P03             | Backup/restore operativo y recuperación de credenciales                          | Ensayo físico sintético de la tarea previa; no automatizado aquí sobre origen real             |
| P04             | Extracción y comparación de datos alojados reales                                | Requiere acceso autorizado a origen; no tocar producción                                       |
| P05             | Firefox/WebKit, lectores de pantalla y teclado completo                          | Suite Chrome y viewport móvil; cobertura adicional pendiente                                   |
| P06             | Concurrencia multiproceso SQLite, bloqueo y carga representativa                 | Revisión en store actual cubierta; requiere driver/lifecycle destino                           |
| P07             | Rectificar venta que ya tiene devoluciones                                       | Regresión protege el rechazo actual; aceptación positiva requiere decisión de negocio          |
| P08             | Pagos parciales a proveedores/fecha independiente de caja de producción          | Fuera del modelo actual; no simular reglas inexistentes                                        |
| P09             | Caché, CSRF, límite por bytes y clasificación de errores HTTP futura             | Caracterización actual documentada; nuevas expectativas requieren tarea de seguridad explícita |

## Cómo comparar antes y después

1. Ejecutar la suite anterior y las nuevas pruebas sin cambiar expectativas comerciales.
2. Conectar el destino a `cashCreditScenario` mediante `run(type, payload, request_id)` y `state()`.
3. Adaptar únicamente los límites de transporte y sesión; conservar IDs, cálculos y assertions de dominio.
4. Ejecutar los flujos B contra el servidor destino; revisar diferencias visuales antes de crear una baseline nueva.
5. Registrar resultado, evidencia y causa de cada diferencia. No marcar pendiente como aprobado ni actualizar hashes para ocultar cambios.

Consultar [reporte y evidencias](REPORTE_02_REGRESION.md) para comandos, resultados y límites.

## Avance posterior: persistencia y recuperación locales

La matriz anterior conserva los resultados históricos de Tarea 02. Los
[ensayos de persistencia de Tarea 05](REPORTE_05_PERSISTENCIA.md) y la
[administración SQLite de Tarea 06](REPORTE_06_MIGRACIONES_SQLITE.md) amplían la evidencia:

| Referencia      | Avance y límite                                                                                                                                         |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SQLITE-DISK-01  | Adaptador en archivo, cierre/reapertura y lectura desde proceso nuevo verificados con datos sintéticos. No implica servidor HTTP independiente.         |
| P03             | Respaldo, manifiesto, hashes y restauración SQLite a otro archivo automatizados; recuperación de credenciales y producción continúan pendientes.        |
| P06             | Locks, revisión obsoleta, escritores y preparación entre procesos cubiertos. Carga representativa y sistemas de archivos de red sin certificar.         |
| NODE-OFFLINE-01 | CLI administrativa probada sin paquetes ni runtime Cloudflare. El flujo completo de servidor, login, navegador y operación offline permanece pendiente. |

No se sustituyen las expectativas comerciales ni se actualizan fingerprints para
ocultar diferencias. Consultar los reportes de cada tarea para las ejecuciones finales.

## Backend Node y autenticación local — Tarea 07

Consultar [el reporte 07](REPORTE_07_BACKEND_NODE.md) para resultados finales y
contratos de seguridad. Las expectativas comerciales originales se reutilizan.

| Referencia      | Cobertura incorporada y límite                                                                                                                                                |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| LOCAL-AUTH-01   | Login, consulta, expiración, logout, revocación y denegación posterior con sesiones persistentes.                                                                             |
| LOCAL-AUTH-02   | Vinculación inicial de ADMIN histórico y credenciales para identidades existentes, sin cambiar autoría ni roles.                                                              |
| SQLITE-DISK-01  | Escenario portable por HTTP local, cierre/reapertura y lectura idéntica desde procesos nuevos.                                                                                |
| NODE-OFFLINE-01 | Backend compilado aislado bajo bloqueo de API de red externa del proceso de test; login y escenario comercial. No certifica firewall del SO ni frontend offline.              |
| R15, R21–R24    | Roles actuales, desactivación, permisos, último ADMIN y último acceso administrativo con credenciales.                                                                        |
| H01–H10         | Contratos comerciales HTTP existentes más Host/Origin/CSRF, bytes/chunked, JSON/UTF-8 inválidos, errores seguros y HTTPS. JSON malformado ahora es 400; permiso denegado 403. |

No se sustituyen los doce pasos E2E de la aplicación D1; continúan ejecutándose
por separado. El frontend independiente y la transferencia de producción siguen pendientes.

## Frontend independiente — Tarea 08

El estado anterior se conserva como historia. Consultar [reporte 08](REPORTE_08_FRONTEND_INDEPENDIENTE.md)
para resultados finales, capturas y condiciones de la prueba de red.

| Referencia           | Avance                                                                                                                                                                     |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| LOCAL-AUTH-01 / P01  | Login, recarga, roles reales ADMIN/OPERATOR/VIEWER, expiración con formulario, revocación y logout comprobados en navegador.                                               |
| NODE-OFFLINE-01      | Distribución compilada React/Node fuera del checkout; conexiones externas bloqueadas mediante instrumentación de tests. No certifica firewall del SO.                      |
| SQLITE-DISK-01 / P02 | Reinicio de proceso Node y recarga conservan sesión y estado completo de SQLite; el reinicio de Vinext no se presenta como automatizado.                                   |
| R01–R24              | Se mantiene la batería previa y se reutiliza el escenario portable mediante HTTP; la suite nueva comprueba sus flujos administrativos por formulario.                      |
| P09                  | Backend conserva Host/Origin/CSRF y bytes; transporte cliente clasifica errores, conserva ID y no reenvía automáticamente. Vite usa el mismo origen sin relajar controles. |
| UI                   | Capturas comparativas revisadas; 66 fingerprints heredados intactos. No hay actualización automática de referencias visuales.                                              |

Continúan pendientes P04/P05/P07/P08 y los límites de carga/entorno descritos en
los reportes; esta ampliación no representa migración de datos reales.
