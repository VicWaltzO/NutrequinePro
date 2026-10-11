# Auditoría funcional para el video de Nutrequine Pro

Fecha: 11 de octubre de 2026.

Esta auditoría describe el código presente en el repositorio y la selección de
interacciones para la demostración. La comprobación de reglas puras se realizó
con estados aislados en memoria. **El ensayo E2E de la secuencia elegida pasó sus
24 comprobaciones**, según `qa/rehearsal-e2e.json`. La ejecución utilizó el
navegador local y la base aislada. Las funciones descartadas se describen a partir
del código; no se presentan como validadas por este ensayo.

## Aplicación y navegación

La aplicación utiliza React 19, TypeScript, Vinext/Vite, Cloudflare Workers y D1
SQLite. Las versiones y los comandos de desarrollo se encuentran en
`package.json`. La interfaz administrativa se compone en `app/ui/AdminApp.tsx`;
las reglas comerciales están separadas en `features/*/domain` y
`shared/domain`.

Las rutas de aplicación son `/`, `GET /api/state` y `POST /api/command`. Las
secciones administrativas se seleccionan mediante el hash del navegador, no
mediante páginas independientes. `app/ui/navigation.ts` define el orden del menú
y `app/ui/hooks/useAdminNavigation.ts` resuelve vistas y pestañas.

| Vista         | Hash principal | Pestañas encontradas                                     |
| ------------- | -------------- | -------------------------------------------------------- |
| Resumen       | `#dashboard`   | Vista general                                            |
| Ventas        | `#sales`       | `future`, `draft`, `corrections`, `returns`, `cancelled` |
| Cobranza      | `#collections` | `payments`                                               |
| Gastos        | `#expenses`    | Vista de registros                                       |
| Producción    | `#productions` | `draft`, `ingredients`, `formulas`                       |
| Inventario    | `#inventory`   | `movements`                                              |
| Balance       | `#balance`     | Consolidación y tabla mensual                            |
| Clientes      | `#customers`   | `sites`                                                  |
| Configuración | `#config`      | `products`, `users`, `audit`, `appearance`               |

Las pestañas se expresan como `#vista/pestaña`. Los enlaces históricos `#sites`
y `#products` se redirigen en la composición hacia Clientes → Sedes y
Configuración → Productos. Los códigos de ventas, producciones y pagos abren
diálogos con detalle y acciones.

## Identidad, permisos y persistencia de la demostración

`app/chatgpt-auth.ts` interpreta la identidad autenticada proporcionada por el
alojamiento. `app/api/state/route.ts` exige identidad y usuario activo para
devolver el estado. `app/api/command/route.ts` exige identidad, comprueba el origen
de la petición y limita su tamaño antes de ejecutar un comando.

En el perfil portable, `vite.config.ts` habilita la identidad local de prueba
mediante `sites({ mockAuth: true })`. No requiere iniciar una sesión real de
ChatGPT para preparar la demostración. Una base vacía con esquema válido recibe
los maestros iniciales; el primer usuario autenticado queda registrado como
ADMIN. Las identidades y datos reales del propietario no deben formar parte de
las capturas ni de los archivos de entrega.

Los roles son ADMIN, OPERATOR y VIEWER. VIEWER solo consulta. La interfaz y el
servidor restringen las acciones administrativas; por ejemplo, la confirmación
y el cierre de producción requieren ADMIN. La conciliación comprueba el mismo
requisito dentro del comando. Fuentes: `shared/domain/permissions.mjs`,
`features/produccion/domain/commands.mjs` y
`features/configuracion/domain/commands.mjs`.

La base local de la demostración debe permanecer separada de la base local
habitual y de la base alojada. `NUTREQUINE_LOCAL_STATE_DIR` configura su ubicación;
`scripts/local-database.mjs` y `scripts/local-bindings.mjs` comparten esa ruta
entre migraciones y servidor. La carpeta de datos locales, SQLite, registros,
herramientas descargadas y capturas de trabajo no se deben versionar.

`npm.cmd run dev`, ejecutado desde `app/`, prepara D1 local antes de iniciar la
vista portable en `http://127.0.0.1:5173`. No publica el sitio ni modifica la base
de producción. La preparación usa el binding `DB` y la identidad local definida
en `wrangler.local.json`.

`lib/application-store.mjs` carga el estado y ejecuta casos de uso idempotentes.
Cada escritura solicita `request_id`, `type` y `payload`. Las entidades y la
auditoría se guardan en un lote atómico con control de revisión; un conflicto
requiere recargar. `db/schema.ts` define 27 tablas con relaciones y documentos
JSON. Los comandos validan y recalculan los datos en el servidor.

## Funcionalidades inspeccionadas y selección editorial

La aptitud indica si la función puede mostrarse de forma clara en esta pieza. Las
interacciones elegidas se ejecutaron en la interfaz real con datos de
demostración persistidos en la base aislada. La matriz E2E del final documenta sus
resultados. Las interacciones descartadas permanecen como auditoría del código.

| Módulo                                        | Funcionalidad real y evidencia                                                                                                                                                                         | Interacción observable                                                                              | Aptitud para esta pieza                                                     | Selección                                                         |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Resumen                                       | Métricas de ventas, cobros reales, deuda, resultado estimado, inventario y operaciones pendientes. `features/balance/components/DashboardView.tsx`.                                                    | Mostrar panel e inventario al comienzo; regresar al panel tras la operación.                        | Alta: relaciona los módulos con cambios visibles.                           | Elegido para inicio y cierre.                                     |
| Producción                                    | Registro por núcleos con fórmula activa, consolidación de insumos, costos, borrador y confirmación. `features/produccion/components/ProductionForm.tsx` y `features/produccion/domain/operations.mjs`. | Abrir lote, revisar productos y costos; confirmar producción.                                       | Alta: permite mostrar una operación que genera inventario.                  | Elegido.                                                          |
| Producción: detalle                           | Sacos y kilos comerciales, fórmula histórica, costos teóricos y reales, diferencias, costos adicionales e historial. `features/produccion/components/ProductionDetail.tsx`.                            | Abrir el código de producción y recorrer el detalle de costos.                                      | Alta: da evidencia de cálculo y trazabilidad.                               | Elegido.                                                          |
| Producción: conciliación y cierre             | ADMIN puede completar cobros reales, conciliar, cerrar o rectificar. `features/produccion/domain/commands.mjs`.                                                                                        | Completar todos los cobros reales y cerrar; las correcciones requieren motivo.                      | Media: añade formularios y conceptos que extienden la duración.             | Fuera de la secuencia principal. Puede prepararse como contexto.  |
| Producción: fórmulas e insumos                | Fórmulas versionadas con vigencia, filas de kg por núcleo y precios de insumos. `features/produccion/components/ProductionsView.tsx` y `features/produccion/domain/commands.mjs`.                      | Consultar fórmula; editar crea una nueva versión.                                                   | Media: requiere explicación sobre vigencia y snapshots.                     | Descartado para esta pieza.                                       |
| Ventas                                        | Cliente, sede, líneas de productos, kilos por saco, precio aplicado, crédito/contado y entrega. `features/ventas/components/SaleForm.tsx` y `features/ventas/domain/commands.mjs`.                     | Seleccionar producto: se autocompletan peso y precio; introducir sacos y registrar venta a crédito. | Alta: los campos y el total responden a la interacción.                     | Elegido.                                                          |
| Ventas futuras                                | Venta pendiente con lote nuevo o vinculado, comprobación de stock y entrega total posterior. `features/ventas/components/SaleDetail.tsx` y `features/inventario/domain/stock.mjs`.                     | Registrar futura, confirmar el lote y registrar entrega.                                            | Media: un segundo recorrido distraería de la secuencia elegida.             | Descartado para esta pieza.                                       |
| Ventas: rectificación, devolución y anulación | Ajustes auditados, retorno físico y validaciones de pagos y stock. `features/ventas/domain/commands.mjs`.                                                                                              | Abrir detalle y registrar acción con motivo cuando corresponde.                                     | Baja: exige explicar efectos físicos y económicos.                          | Descartado para esta pieza.                                       |
| Cobranza                                      | Pago recibido, método, referencia y aplicaciones explícitas a ventas del mismo cliente. `features/cobranza/components/PaymentForm.tsx` y `features/cobranza/domain/operations.mjs`.                    | Registrar pago parcial y observar la reducción del saldo de la venta.                               | Alta: cierra el vínculo entre venta y dinero recibido.                      | Elegido.                                                          |
| Cobranza: saldo a favor y reversión           | Excedente disponible en el pago original, aplicaciones posteriores y reversión total auditada. `features/cobranza/components/PaymentDetail.tsx` y `features/cobranza/domain/commands.mjs`.             | Aplicar saldo a otra venta o revertir el pago con motivo.                                           | Media: implica un flujo económico adicional.                                | Descartado para esta pieza.                                       |
| Inventario                                    | Stock físico por sacos y kilos, compromisos de ventas pendientes, movimientos y ajustes. `features/inventario/domain/stock.mjs` y `features/inventario/components/InventoryView.tsx`.                  | Consultar existencias y origen de movimientos.                                                      | Alta como consecuencia de producir y vender.                                | Visible en Resumen; recorrido independiente descartado.           |
| Clientes y sedes                              | Directorio, contactos, relación con destinos, deuda y crédito separados. `features/clientes/components/CustomersView.tsx` y `features/clientes/domain/summary.mjs`.                                    | Crear o editar maestro; abrir cuenta del cliente.                                                   | Media: necesario para fixtures, poco cambio visible en la historia elegida. | Preparación de datos; recorrido descartado.                       |
| Gastos                                        | Importe, categoría y relaciones opcionales; un gasto de producción agrega un costo sin duplicarlo en Balance. `features/gastos/domain/commands.mjs`.                                                   | Registrar gasto y consultar su relación.                                                            | Media: añade una rama independiente.                                        | Descartado para esta pieza.                                       |
| Balance                                       | Ventas, cobros, deuda, crédito, costos, resultado comercial estimado y resultado de caja. `features/balance/domain/summary.mjs` y `features/balance/components/BalanceView.tsx`.                       | Consultar cifras y periodo.                                                                         | Media: los resultados necesitan contextualizar costos del periodo.          | Métricas de Resumen elegidas; recorrido independiente descartado. |
| Configuración                                 | Empresa, valores iniciales, catálogo, usuarios, auditoría y apariencia. `features/configuracion/components/ConfigurationView.tsx`.                                                                     | Administrar maestros, permisos y tema.                                                              | Baja: no contribuye al recorrido operativo elegido.                         | Descartado para esta pieza.                                       |

## Matriz de decisión y estabilidad

| Función encontrada                 | Ruta / pantalla                 | Interacción real                                   | Resultado comprobado                                                | Estabilidad                                   | Aptitud visual                | Elegida / descartada                       |
| ---------------------------------- | ------------------------------- | -------------------------------------------------- | ------------------------------------------------------------------- | --------------------------------------------- | ----------------------------- | ------------------------------------------ |
| Resumen                            | `/#dashboard`                   | Abrir y regresar después del pago                  | Ventas 7,380; cobros 6,960; deuda 420; stock 10 / 40 / 10           | Ensayo y dos capturas aprobados sin errores   | Alta; contexto global         | Inicio y cierre                            |
| Lote y costos                      | `/#productions`, PR-000002      | Abrir detalle, confirmar y desplazar hacia insumos | 40 sacos, 1,000 kg; CONFIRMED; stock 10 → 50; costo real 1,336.40   | Ensayo y capturas aprobados                   | Alta; tablas legibles a 1080p | Elegida                                    |
| Venta y autocompletado             | `/#sales`, Nueva venta          | Elegir producto, ingresar 10 sacos, confirmar      | Precio 72, peso 25; total y deuda 720; stock 50 → 40                | Ensayo y capturas aprobados                   | Alta; cálculo visible         | Elegida                                    |
| Pago parcial                       | `/#collections`, venta V-000002 | Registrar 300 y aplicarlo a la venta               | Pago persistido, saldo 420 y PARTIAL                                | Ensayo y capturas aprobados                   | Alta; antes y después claro   | Elegida                                    |
| Conciliación y cierre              | Detalle de producción           | Completar cobros reales y cerrar                   | Preparación por API real aprobada; UI de cierre fuera del recorrido | API local comprobada; UI no E2E en esta pieza | Media; extiende relato        | Preparación; descartada en cámara          |
| Fórmulas, ventas futuras y ajustes | Producción / Ventas             | Versionar, planificar, rectificar o devolver       | Implementación auditada en código; sin resultado E2E de esta demo   | Sin certificación interactiva                 | Media o baja para 30 s        | Descartadas                                |
| Saldo a favor y reversión          | Cobranza / detalle del pago     | Aplicar excedente o revertir con motivo            | Implementación auditada; esta venta usa pago parcial sin excedente  | Sin E2E de esta pieza                         | Media; requiere otro relato   | Descartadas                                |
| Inventario                         | Resumen / `/#inventory`         | Consultar stock y movimientos                      | Stock comprobado contra estado real y visible en Resumen            | Stock E2E aprobado; movimientos no filmados   | Alta como consecuencia        | Incluido en contexto; recorrido descartado |
| Clientes y sedes                   | `/#customers`                   | Crear maestros ficticios                           | Preparación mediante API y selección UI aprobadas                   | API y uso en venta comprobados                | Media                         | Preparación; recorrido descartado          |
| Gastos y Balance                   | `/#expenses`, `/#balance`       | Registrar egreso o consultar periodo               | Código auditado; métricas de Resumen E2E aprobadas                  | Vistas propias sin E2E de esta pieza          | Media                         | Descartadas                                |
| Configuración                      | `/#config`                      | Cambiar catálogos y usuario local                  | Preparación mediante comandos reales aprobada                       | API local comprobada; vista no filmada        | Baja para relato operativo    | Preparación; descartada en cámara          |

La captura definitiva añade dos controles de calibración a los 24 funcionales: `qa/e2e.json` contiene 26 comprobaciones aprobadas. El desfase medido y la tolerancia se conservan en `qa/alignment.json`. No se atribuye estabilidad E2E a capacidades revisadas únicamente en código.

## Reglas que debe respetar la demostración

- La producción en borrador no incrementa el stock. Confirmar crea entradas de
  producto terminado y movimientos de consumo de insumos.
- Seleccionar un producto vendible en el formulario de venta carga el precio de
  lista y el peso habitual. Estos valores pueden editarse; la operación conserva
  referencias históricas y el servidor recalcula el subtotal.
- La venta a crédito registra deuda, sin crear un ingreso de caja. El pago parcial
  es una operación posterior con su propia fecha, método y aplicaciones.
- Una entrega requiere stock físico suficiente tanto en sacos como en kilos. Los
  compromisos no se descuentan nuevamente al entregar. No existe entrega parcial.
- Los importes internos son céntimos enteros y los pesos internos gramos
  enteros. El payload de los formularios usa soles y kilos.
- Las aplicaciones de pago deben corresponder al mismo cliente, no pueden
  superar el saldo pendiente y su suma no puede superar el importe disponible.
- Deuda y saldo a favor se muestran por separado. La aplicación de saldo a favor
  no registra un segundo cobro.
- El resultado comercial es estimado: descuenta el costo total de producción
  registrado en el periodo. No representa margen por saco vendido ni valoración
  contable del inventario. La narración debe mantener esta distinción.

## Resultados del ensayo E2E

Evidencia: `qa/rehearsal-e2e.json`, ejecución
`1791740172281-rehearsal`. Sus 24 comprobaciones tienen `passed: true`, con cero
errores de navegador y cero solicitudes fallidas. El ensayo declara ejecución
exclusivamente local y solicitudes externas bloqueadas. Se ejecutó a 1920 × 1080,
con locale `es-PE` y zona horaria `America/Lima`.

La preparación creó datos ficticios mediante los comandos reales de la
aplicación: un lote inicial, una venta previa cobrada por S/ 6,660.00 y un lote
pendiente de Hi-Performance. Los precios usados son valores propios de la base
de demostración. La venta previa explica que el Resumen final incluya importes
superiores a los de la venta registrada durante el recorrido.

| Flujo elegido              | Resultado observado                                                                                                                                                      | Estado                 |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------- |
| Inicio en Resumen          | Base nueva sin operaciones antes de preparar; panel operativo tras preparar, deuda inicial cero y stock inicial Hi-Performance de 10 sacos.                              | Aprobado en ensayo E2E |
| Producción y costos        | Apertura del detalle PR-000002 y tabla real de costos. Lote de 40 sacos / 1,000 kg comerciales, insumos conciliados y costo real S/ 1,336.40 según los datos preparados. | Aprobado en ensayo E2E |
| Confirmación de producción | `PRODUCTION_CONFIRM` responde HTTP 200, estado `CONFIRMED` y stock Hi-Performance de 10 → 50 sacos.                                                                      | Aprobado en ensayo E2E |
| Autocompletado de venta    | Hi-Performance carga precio S/ 72.00 y peso de 25 kg; 10 sacos producen total S/ 720.00.                                                                                 | Aprobado en ensayo E2E |
| Registro a crédito         | `SALE_SAVE` responde HTTP 200; condición `CREDIT`, estado `CONFIRMED` / `DELIVERED`, deuda S/ 720.00 y stock de 50 → 40 sacos.                                           | Aprobado en ensayo E2E |
| Pago parcial               | `PAYMENT_CREATE` responde HTTP 200; aplicación auténtica a la venta creada, pago S/ 300.00, saldo S/ 420.00 y estado `PARTIAL`.                                          | Aprobado en ensayo E2E |
| Cierre en Resumen          | Ventas S/ 7,380.00, cobros S/ 6,960.00 y deuda S/ 420.00. Stock por productos Potripregnant / Hi-Performance / Nutrelin Adulto: 10 / 40 / 10 sacos.                      | Aprobado en ensayo E2E |
| Persistencia               | Recargar conserva 2 ventas, 2 producciones y 2 pagos, sin duplicar; mantiene saldo S/ 420.00.                                                                            | Aprobado en ensayo E2E |

El precio y el peso autocompletados, los cambios de estado, el pago aplicado y
los saldos se verificaron contra las respuestas y el estado reales de la
aplicación. La tabla de costos se abrió y se recorrió dentro del diálogo nativo.
El importe S/ 1,336.40 se obtiene de los insumos y costos del fixture en
`record_demo.mjs`; el registro JSON comprueba explícitamente que el lote tiene
todos sus insumos conciliados.

Este ensayo valida la secuencia seleccionada y su persistencia local. No
certifica publicación, acceso alojado, permisos de todos los roles ni las
funciones descartadas de la tabla editorial.

Las comprobaciones del repositorio son `npm.cmd test`, `npm.cmd run check`,
`npm.cmd run lint` y `npm.cmd run build`, ejecutadas desde `app/`. Su resultado se
informa por separado y no se deduce del ensayo interactivo.
