# NQP26-02 · Agregación de líneas de venta

Fecha: 28 de octubre de 2026. Estado: En revisión; implementación y controles locales terminados, pendiente de revisión técnica. Base main b8651ecc600cd94cc5275b6d0b1bec21b101eb55. Rama codex/nqp26-02-lineas-unicas-venta. Copia aislada limpia al comenzar, sin cambios previos del usuario. PR #11/#12 consultados y ya fusionados por el responsable; esta sesión no los fusionó.

## Diagnóstico previo a implementar

Reproducción sintética ejecutada: cinco llamadas a addSaleProduct dejan cinco filas de cantidad 1. Evidencia local 04_EVIDENCIAS/NQP26-02_reproduccion.log. Evento real: SaleLineEditor onClick actualiza setRows(current => addSaleProduct(current, product)); el helper reutiliza vacía o añade otra sin buscar producto. El test sale-lines espera incorrectamente dos filas; sale-form E2E espera tres tras repetir tarjeta. selectSaleProduct también repone precio de catálogo al seleccionar el mismo producto. Backend SaleForm envía SALE_SAVE/SALE_CORRECT; createSaleOperations.saleItems valida unidades/pesos/precios pero no unicidad.

## Diseño mínimo y límites

Incrementar única línea compatible preservando todos sus campos. Si hay varias candidatas, pedir elegir la línea mediante controles nativos accesibles; no seleccionar arbitrariamente por precio o índice ni fusionar snapshots históricos. Precio y peso editados de la única línea prevalecen sobre catálogo. Al reutilizar vacía desde una tarjeta, crear línea limpia de cantidad 1. Cantidad inválida o fuera del límite no se incrementa y se explica al usuario. Mantener actualizaciones funcionales.

Compartir clave de compatibilidad entre captura y dominio (producto, unidad, política, peso y precio canónicos). Backend rechaza duplicados nuevos compatibles atómicamente; permite variantes distintas. Excepción legacy explícita: conservar líneas históricas distintas ya duplicadas si retienen identidad y compatibilidad original; no permitir repetir original_item_id ni introducir nuevas duplicaciones mediante rectificación. No modificar inventario, pagos, entregas, reservas ni migraciones. La eliminación de última línea sigue en 03.

## Trazabilidad prevista

| Requisito                      | Código                                     | Prueba                               |
| ------------------------------ | ------------------------------------------ | ------------------------------------ |
| V01–V03 cantidad/manuales      | sale-lines.ts; SaleLineEditor              | sale-lines; sale-form E2E            |
| V04/V05 unidades y catálogo    | presentación compartida y captura          | sale-lines; presentations; E2E mixto |
| V06 identidad/reapertura       | useSaleFormState; selección                | unitarias y rectificación HTTP/E2E   |
| V07/V08 unicidad               | ventas/domain/operations; clave compartida | dominio memoria/disco y HTTP         |
| V09 clics rápidos/invalidación | actualización funcional y validación local | unitarias y navegador                |
| V10 regresión                  | sin cambios a movimientos/cobros           | verify y E2E completo                |

Riesgos previos: ventas legacy con filas repetidas; candidatos con varios precios/pesos; valores transitorios vacíos; consistencia gramos/céntimos; E2E 01 tuvo timeout de arranque no resuelto. No ampliar timeouts ni ocultar repeticiones. Resultados, commit y PR se registrarán al cerrar.

Revisión previa de 01 atendida en commit e030a79, incluida aquí como cambio documental solicitado antes de 02: modelo A preseleccionado, 17 todo futuros y reservas O1–O6 visibles. Sin aprobación adicional de persistencia.

## Implementación y pruebas dirigidas

Se amplió sale-lines.ts para incrementar una única candidata mediante actualización funcional, conservar valores/manuales e identidad y reiniciar únicamente una fila vacía reutilizada por tarjeta. Seleccionar de nuevo el mismo producto conserva todos los campos. Si hay varias candidatas, SaleLineEditor muestra elección explícita por línea con peso/precio; cancelar o elegir devuelve foco a la tarjeta. La cantidad inválida o al límite mantiene estado y muestra corrección necesaria, sin NaN ni creación de duplicados. BASE sigue filtrada por catálogo y rechazada por backend si no está habilitada para venta.

La utilidad shared/domain/sale-line-compatibility.mjs expresa presentación y clave canónica. En servidor, saleItems comprueba unicidad después de resolver catálogo/snapshot y normalizar gramos/céntimos; un rechazo revierte el comando completo. Dos líneas con distinto peso o precio siguen siendo variantes distintas. La rectificación admite duplicados legacy únicamente con identidades originales distintas y clave original inalterada; repetir la misma identidad o introducir duplicados nuevos se rechaza. No se hace limpieza automática de ventas antiguas.

No hay un campo independiente de descuento de venta en el contrato actual: el precio manual aplicado se conserva; los descuentos de producción no se modifican y permanecen cubiertos por regresión. Se añadió unit_weight_grams_snapshot al estado de captura de rectificaciones para conservar el nominal histórico. No se cambió el comportamiento de SALE_OUT, la entrega PENDING, pagos ni migraciones.

Pruebas históricas corregidas: sale-lines deja de esperar dos filas; sale-form deja de esperar la fila duplicada y verifica cantidad 3 conservando 17,001 kg y S/73,01; payment-credit-delivery conserva la comprobación de agrupación de cantidades/peso usando variantes de precio distintas (las líneas idénticas nuevas ahora se rechazan). No se eliminaron aserciones de inventario ni se sustituyeron por mocks.

| Ejecución real                                                                                                                            | Resultado                                                                                                                                  | Evidencia local                              |
| ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------- |
| node --test tests/sale-lines.test.mjs tests/payment-credit-delivery.test.mjs                                                              | 15 aprobadas, cero fallidas/canceladas/omitidas/todo; código 0                                                                             | 04_EVIDENCIAS/NQP26-02_dirigidas_inicial.log |
| node --test tests/sale-line-uniqueness.test.mjs tests/presentations.test.mjs                                                              | 17 aprobadas, cero fallidas/omitidas                                                                                                       | 04_EVIDENCIAS/NQP26-02_dominio.log           |
| check:client y check:node                                                                                                                 | Ambos aprobados                                                                                                                            | Salida real de herramientas                  |
| UI_REVIEW_DEV=1, REGRESSION_BROWSER_CHANNEL=chrome; node --test tests/local-e2e/sale-form.test.mjs tests/local-e2e/presentations.test.mjs | 2 aprobadas, cero fallidas/canceladas/omitidas; desarrollo aislado con Vite                                                                | 04_EVIDENCIAS/NQP26-02_e2e_dirigidas.log     |
| npm.cmd run verify                                                                                                                        | Código 0; 266 registradas, 249 aprobadas, 17 todo, cero fallidas/canceladas/omitidas; tipos, lint, formato, build y distribución correctos | 04_EVIDENCIAS/NQP26-02_verify.log            |
| npm.cmd run test:e2e con Chrome, tras build                                                                                               | 29 aprobadas en una sola corrida, cero fallidas/canceladas/omitidas/todo; código 0; 538678,411 ms                                          | 04_EVIDENCIAS/NQP26-02_e2e.log               |

Distribución verificada: 2072 archivos, 69 paquetes de runtime, cero privados/paquetes retirados. Las 17 todo de 01 permanecen pendientes y no se cuentan como aprobadas. No hubo fallos en las pruebas dirigidas; la reproducción previa documenta un defecto, no una solución anterior.

Revisión visual: se mantiene el diseño corporativo, tipografía y tokens existentes; se inspeccionó captura previa y render nuevo de escritorio. Los escenarios dirigidos probaron selección repetida de frascos, HTTP 422 sin cambios ante duplicados y BASE, variantes, clics rápidos, formulario móvil y rectificación con original_item_id. Las capturas finales de elección de línea se inspeccionaron en escritorio 1440 × 1000 y móvil emulado 390 × 844: controles legibles, sin desbordamiento y cancelación con foco conservado. No se afirma prueba en teléfono físico. Impeccable detect devolvió [] para TSX/CSS afectados; el sidecar de diseño desactualizado se dejó intacto y no se actualizó la habilidad ni el sistema visual dentro de esta tarea.

## Cierre y criterios de aceptación

Entorno real: Windows, Node v24.18.0, npm 11.16.0, Chrome local. Desde app se ejecutaron verify y luego test:e2e sin ampliar timeouts ni repetir fallos para obtener verde. verify registró 266 pruebas: 249 aprobadas, 17 todo, cero fallidas/canceladas/omitidas (suite general 383624,1923 ms). E2E compilado registró 29 aprobadas, cero fallidas/canceladas/omitidas/todo, en una sola corrida. El incidente de arranque de NQP26-01 no se reprodujo aquí; su causa sigue sin estar demostrada y no se declara resuelto retrospectivamente.

| Caso | Resultado comprobado                                                                                                                                      |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| V01  | Cinco clics rápidos: una línea, cantidad 5; contador y cálculo conservan la misma fila                                                                    |
| V02  | Cantidad manual 7 seguida de clic: 8                                                                                                                      |
| V03  | Precio S/73,01 y peso 17,001 kg conservados; subtotal de tres unidades S/219,03 verificado en captura                                                     |
| V04  | Tres frascos en una línea, 2,2 kg por frasco fijo                                                                                                         |
| V05  | Tres productos diferentes generan tres líneas en prueba unitaria; venta mixta conserva saco/frasco                                                        |
| V06  | Rectificación reabierta conserva snapshot y original_item_id; incremento y envío real aceptados                                                           |
| V07  | Duplicados canónicos: HTTP 422 y estado sin cambios; también memoria/disco, sin cobro/movimiento parcial                                                  |
| V08  | Distinto peso/precio se conserva sin fusionar; selección explícita en UI; identidades legacy verificadas                                                  |
| V09  | Clics rápidos, edición manual y cancelación de elección sin duplicación; cantidades inválidas/límite preservan estado en unitarias; foco vuelve a tarjeta |
| V10  | verify y E2E completo aprobados, incluidos descuentos de producción, cobros, stock, entrega, devolución y reinicio                                        |

Se conservaron los 17 todo de 01: reservas parciales, reintentos con otro contenido/permisos y recepción real del molino no quedan solucionados por este cambio. La eliminación de la última línea continúa en NQP26-03. Ninguna base empresarial, secreto, captura privada ni configuración local entra al commit.

Informe versionado y copia local: app/docs/actualizacion-seguridad/NQP26-02_REPORTE.md y C:/Users/vicve/Documents/ChatGPT/Nutrequine Pro/Actualizacion_2026-10-24_Codex/03_REPORTES/NQP26-02_REPORTE.md. Los logs quedan en 04_EVIDENCIAS. Las capturas sintéticas se copian allí desde outputs (excluido de Git). Se conserva el commit documental previo e030a79 como atención separada de la revisión de 01 dentro de esta entrega; no cambia su arquitectura propuesta ni sus pruebas.

Entrega de implementación verificada: e96cc01eb6f6f327436254b993727c90a936e8e0. PR #13 en borrador: https://github.com/VicWaltzO/NutrequinePro/pull/13. Este registro se añade en un commit documental posterior; su SHA final se conserva en git log y en REGISTRO_TAREAS.csv. Rama codex/nqp26-02-lineas-unicas-venta, base main b8651ecc600cd94cc5275b6d0b1bec21b101eb55. Estado En revisión; no fusionar ni desplegar.
