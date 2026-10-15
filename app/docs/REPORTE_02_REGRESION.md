# Tarea 02 — Ampliación de regresión

> Documento histórico: describe el estado de su tarea y commit de origen. Para operar la aplicación actual, consultar [instalación local](INSTALACION_LOCAL.md) y [arquitectura consolidada](ARQUITECTURA.md).

Fecha: 14/10/2026, America/Bogota. Rama: `codex/reestructuracion-arquitectonica`.
Base anterior: `36d8cb3`. La tarea amplía pruebas y documentación, sin modificar
reglas comerciales, arquitectura, autenticación, dependencias ni producción.

## Fuentes y alcance

Se consultaron la [auditoría 01](AUDITORIA_01_ARQUITECTONICA.md), el
[inventario](INVENTARIO_DEPENDENCIAS_01.md), el [plan local](PLAN_MIGRACION_LOCAL.md),
la [especificación maestra](ESPECIFICACION_MAESTRA_MVP.md), la aceptación y las
reglas vigentes del README. Los cambios aprobados posteriores a la especificación
(contado parcial/cero, excedentes y aplicación explícita de crédito) forman parte
de la regresión; no se reinstala una regla antigua de pago obligatorio completo.
Se aplicó la skill instalada `programacion-clara`: fixtures legibles, asserts de
resultados observables y recursos aislados, sin refactorización del producto.

Las capturas y archivos de la prueba de navegador usan exclusivamente datos
sintéticos y se guardan en directorios ignorados. El inicio portable crea el
esquema existente en una persistencia nueva de pruebas; no aplica migraciones
a la base habitual ni modifica los archivos SQL. La base alojada no se consulta.
Se conserva fuera del commit la eliminación previa del vídeo de showcase.

## Análisis de las 55 pruebas anteriores

| Archivo en `tests/`                | Pruebas base | Protección existente                                                                                | Brecha identificada                                                                |
| ---------------------------------- | ------------ | --------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `acceptance.test.mjs`              | 23           | A–F, BASE, snapshots, pago/stock, devolución, rectificación, producción, gastos, permisos, clientes | Más casos límite acumulativos, centavos/gramos y transiciones en store real        |
| `application-store.test.mjs`       | 5            | Inicialización, idempotencia, concurrencia, recarga y rollback                                      | Fallo SQL después de múltiples entidades comerciales y reintento del mismo request |
| `payment-credit-delivery.test.mjs` | 7            | Contado parcial/cero, crédito, aplicación y entrega                                                 | Método OTHER, fecha de reversión, centavo residual y portabilidad del escenario    |
| `persistence.test.mjs`             | 5            | SQL real, relaciones, batch atómico, revisión y crédito                                             | Ejecución de toda la operación comercial mediante el store con fallo tardío        |
| `configuration.test.mjs`           | 2            | Empresa, defaults, auditoría y permisos                                                             | Matriz más amplia de acciones por rol y desactivación de identidad                 |
| `browser-state.test.mjs`           | 2            | Bloqueo/reintento del cliente, tema y hash mediante harness                                         | Interacción DOM real, formularios, responsive y sesión portable                    |
| `ui-regression.test.mjs`           | 1            | 66 fingerprints HTML para vistas, roles y modales                                                   | No prueba clicks, red, login ni disco                                              |
| `architecture.test.mjs`            | 2            | Ciclos y límites de importación                                                                     | No prueba comportamiento de los endpoints                                          |
| `local-database.test.mjs`          | 3            | Esquema vacío, histórico y desconocido                                                              | Sin lifecycle de proceso ni recuperación operativa                                 |
| `local-migrations.test.mjs`        | 5            | Adopción/prefix ledger/índices y preservación                                                       | Sin adaptador de disco independiente, todavía inexistente                          |

La matriz [MATRIZ_REGRESION.md](MATRIZ_REGRESION.md) cataloga las 55 pruebas por
nombre/archivo y todos los escenarios nuevos. No se calcula un porcentaje de
cobertura funcional ni de líneas: pasar estos casos no cubre todos los estados.

## Pruebas añadidas

`regression-business.test.mjs` añade R01–R20, ejecutando el store comercial real
con el adaptador SQLite en memoria ya disponible. Cubre importes de céntimos,
pesos extraordinarios de gramos, redondeo de medio céntimo en costo, snapshots
de precio, entradas inválidas sin efectos, duplicados normalizados, sedes,
cliente retirado con deuda cobrable, borradores, ajustes de stock, devolución
acumulada y económica, anulación de remanente, rectificaciones históricas,
confirmación/cierre, stock consumido, reversiones por fecha, autoría, rechazo de
identidad inactiva, idempotencia, atomicidad y entrega concurrente.

R19 agrega una FK inválida al final del batch de escritura, después de que el
store haya calculado venta, pago y salida de inventario. Comprueba que el batch
falla y deja intactas todas las entidades y revisión, y que reintentar la misma
solicitud por el adaptador normal crea exactamente una operación. El fallo no
se introduce en la lectura inicial ni se reemplazan reglas por mocks.

`regression-permissions.test.mjs` añade R21–R24. Verifica operaciones permitidas
del operador; rechaza 16 variantes administrativas, incluidos confirmación
incrustada en SAVE y los alias de conciliación; rechaza los 26 comandos públicos
para VIEWER; protege el último administrador activo y la autoría histórica al
renombrar usuarios. Cada rechazo compara el estado completo persistido. Las
combinaciones dentro de un caso no se presentan como pruebas independientes.

`http-contract.test.mjs` añade H01–H10. El harness transpila y ejecuta las rutas
TypeScript reales con objetos Request/Response. Suministra únicamente identidad
y conexión/store; los casos de uso y persistencia siguen siendo reales. Cubre
401, 403, 200, no-store, lectura VIEWER, denegación de escritura, idempotencia,
Origin ajeno, tamaño de cuerpo, comandos inválidos, JSON inválido y falta de D1.
Estas pruebas son integración de handlers y store: no se etiquetan como pruebas
de socket o de autenticación alojada.

## Red y navegador

`tests/e2e/admin-flows.test.mjs`, ejecutado por `npm run test:e2e`, inicia el
servidor portable real en un puerto loopback libre con una persistencia nueva
`.wrangler/regression-02-<ejecución>`. El helper detiene únicamente el árbol de
procesos que inició. No usa ni termina el servidor de otro desarrollador.
La prueba requiere el perfil portable existente; no cambia el perfil del checkout.

Se utiliza Playwright 1.62.1 de los paquetes multimedia existentes y Chrome
headless; no se añade ni elimina una dependencia. La prueba busca una instalación
local explícita en `demo-linkedin` o `showcase`, sin recurrir a cachés Codex.
Si falta esa herramienta, el comando falla con diagnóstico; no omite casos
silenciosamente. CI conserva la suite principal; E2E es un comando separado que
requiere instalar la herramienta y navegador en el entorno que lo ejecute.

N01–N04 comprueban HTTP por red: ausencia de sesión, cabeceras falsas, errores,
inicio/salida portable y el escenario financiero compartido contra D1 real.
B01–B08 usan formularios y controles: cliente y recarga, lote y confirmación,
contado con excedente, venta futura/entrega/aplicación de crédito, rectificación,
devolución, reversión/anulación, gasto, balance, tema y navegación móvil.
Los asserts comparan el estado que devuelve la API después del click, no solo
la existencia de un botón. Se registran excepciones JavaScript del navegador.

Los pasos B forman un recorrido dependiente y secuencial. Un fallo detiene los
siguientes pasos y conserva evidencia; no se cuentan los pasos no ejecutados
como aprobados. Los viewport son 1440 × 1000 y 390 × 844. Las capturas se revisan
como evidencia de presentación, sin generar snapshots visuales nuevos ni
actualizar los 66 fingerprints existentes.

## Reutilización para la migración

`tests/helpers/regression-scenarios.mjs` separa payloads y expectativas comerciales
de la conexión. `cashCreditScenario({run, state})` se ejecuta tanto por store
actual (R17) como por HTTP de red (N03). Usa valores esperados explícitos:
S/292.04 de venta, S/300.05 recibido, S/8.01 disponible/aplicado, S/2.00 de deuda
restante y 125.005 kg físicos. No deriva las expectativas financieras mediante
una segunda implementación del mismo algoritmo.

El módulo declara cuatro casos de aceptación futuros: LOCAL-AUTH-01,
LOCAL-AUTH-02, SQLITE-DISK-01 y NODE-OFFLINE-01. Son acciones/invariantes
preparadas, no tests aprobados ni componentes implementados. El destino podrá
proporcionar `run(type, payload, request_id)` y `state()` al escenario compartido;
los límites de sesión/HTTP se adaptarán por separado.

## Verificaciones finales

| Comando desde `app/`       | Resultado                                                                                     |
| -------------------------- | --------------------------------------------------------------------------------------------- |
| `npm.cmd test`             | 89 pruebas aprobadas: 55 anteriores y 34 nuevas; ninguna omitida                              |
| `npm.cmd run test:e2e`     | 12 pasos aprobados, 4 de red y 8 de navegador; Node informa 13 tests incluyendo el contenedor |
| `npm.cmd run check`        | TypeScript aprobado                                                                           |
| `npm.cmd run lint`         | ESLint aprobado, sin advertencias                                                             |
| `npm.cmd run format:check` | Prettier global aprobado                                                                      |
| `npm.cmd run build`        | Compilación de `/`, `/api/state` y `/api/command` aprobada                                    |

El ensayo E2E final duró aproximadamente 166 segundos, sin fallos, omisiones ni
excepciones JavaScript registradas. El arranque se ejecutó con permisos para los
procesos Chrome/workerd y registros Wrangler/Miniflare separados por instancia.
La compilación conservó avisos de tiempos de plugins, sin errores de aplicación.

En la ejecución conjunta `npm.cmd run verify`, test/check/lint/formato pasaron;
build encontró `EPERM` al resolver archivos de dependencias dentro del aislamiento.
Se repitió el comando de compilación con permisos. No se modificaron dependencias
ni se silenciaron errores para superar la comprobación.

Los primeros intentos encontraron problemas del nuevo test (etiquetas de
controles, cuerpo JSON serializado como string válido y redirecciones automáticas
tras logout). Se corrigieron los tests tras inspeccionar los controles y las
peticiones, sin cambiar expectativas de negocio ni snapshots. Otros intentos
fallaron en `workerd` con `std::terminate`, o en la hidratación Vite con
`send was called before connect`. Se conserva su evidencia. El ensayo final
pasó con registros aislados y sin verificaciones concurrentes; no demuestra que
el runtime de desarrollo sea inmune a esas incidencias en otros equipos.

## Evidencias locales

Ejecución aprobada: `2026-10-14T17-45-23-217Z-12652` (12:45 America/Bogota).
Directorio: `app/outputs/regression-02/2026-10-14T17-45-23-217Z-12652/`.

- `results.json`: los 12 pasos, estado aprobado, lista vacía de errores JS y SHA256
  de cada captura. No contiene registros reales ni credenciales de producción.
- `B01.png`–`B08.png`: ocho evidencias de los flujos y `N04.png` de la vista final.
- `trace.zip`: traza Playwright con acciones, snapshots DOM y peticiones sintéticas.
- `server.log`: arranque y resultados HTTP; incluye el diagnóstico deliberado del
  JSON inválido. Esos errores esperados del caso N02 no son fallos de la suite.

Se inspeccionaron visualmente `B03.png` (ventas/estados/importes) y `B08.png`
(inventario móvil oscuro). El stock final visible es 44 sacos y 1,108.004 kg,
coincidente con los asserts; las tablas móviles conservan desplazamiento
horizontal. Esto no es una certificación visual de todas las vistas.
Las capturas, trazas, logs y bases quedan fuera del commit y del push. Para
reproducirlas, ejecutar `npm.cmd run test:e2e` con el navegador y Playwright
existentes instalados; el comando imprime la ruta de la nueva evidencia.

Se añadió únicamente el script de pruebas `test:e2e` al paquete. Prettier
excluye `demo-linkedin/.tools/` porque contiene ejecutables/archivos descargados
de FFmpeg y no código de aplicación; es la causa de los 36 avisos locales
documentados previamente. No se desactivan reglas de fuentes ni se cambia el
lockfile. Los artefactos de pruebas quedan fuera de Git mediante las exclusiones
existentes de `outputs/` y `.wrangler/`.

## Riesgos y pendientes

- H08 caracteriza JSON malformado como 503 genérico; una API futura debería
  revisar la clasificación sin cambiar expectativas silenciosamente aquí.
- H10 conserva admisión sin Origin; Host/CSRF y límite por bytes necesitan
  revisión explícita en el futuro servidor. El límite actual usa caracteres.
- La simulación portable de Sites tiene una única identidad; H y R cubren
  roles con identidades suministradas, pero no login real multicuenta en navegador.
- Seguir todas las redirecciones tras logout portable puede volver a la entrada
  simulada y autenticar otra vez. N04 inspecciona logout sin seguir redirects;
  no demuestra revocación de una sesión del futuro sistema local.
- Recarga/store se verifican; restart completo del proceso, backup/restore
  operativo, expiración de sesiones, disco independiente, offline sin plataforma
  y concurrencia multiproceso siguen pendientes.
- La suite de navegador cubre Chrome y un viewport móvil, no Firefox/WebKit,
  accesibilidad integral, todas las configuraciones ni todos los formularios.
- Las rectificaciones de ventas con devoluciones y pagos a proveedores siguen
  los límites de negocio existentes. No inventar escenarios positivos hasta
  que esas reglas se definan.

La matriz identifica cada pendiente y qué componente o decisión permite
automatizarlo. La migración y su siguiente fase no se inician con esta entrega.
