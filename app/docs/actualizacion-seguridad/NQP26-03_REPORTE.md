# NQP26-03 · Última línea de venta y vacío seguro

Fecha: 28 de octubre de 2026. Estado: implementado y verificado; entrega en revisión, sin despliegue.

## Base y alcance

Se leyeron, en el orden solicitado, la revisión técnica NQP26-02, la matriz V02-E01–E12 y la orden NQP26-03. Son documentos de referencia del encargo; las observaciones de la revisión se contrastaron con el estado actual. Se consultaron AGENTS.md raíz y app, fuentes originales A/VENTA-02 y B, informe 02, contratos 01 y PR #13.

GitHub confirma que #13 fue fusionado el 28 de octubre a las 12:15:30 de Bogotá (UTC−5). Base actualizada: 1063f483c05699df3176c6d2e05f37c8e809cc67. Rama independiente codex/nqp26-03-venta-vacia, creada desde origin/main en worktree aislado. Los cambios previos del checkout original, incluidas eliminaciones de demo y carpetas locales no versionadas, se conservaron. No se fusionó ni rebasó ninguna rama durante esta tarea.

## Diagnóstico y contrato

La reproducción previa con Chrome y fixtures sintéticos falla en toBeEnabled: el único botón Quitar producto está disabled. Evidencia local NQP26-03_reproduccion_final.log. Dos preparaciones anteriores fallaron por datos incorrectos del fixture del frasco (supply_mode no permitido y falta de stock_entry_mode); se conservaron los logs antes/reproduccion y se corrigió solo el ensayo.

rows=[] representa edición temporal: cero líneas, total cero, sin faltantes, catálogo y Agregar producto disponibles. rows=[vacía] representa captura manual: cero productos válidos y total cero; guardar, confirmar y rectificar quedan deshabilitados. rows=[válida] permite continuar según las validaciones anteriores. Una lista con filas válidas y una vacía tampoco se envía. La misma condición protege el botón y onSubmit.

El servidor ya exige al menos un artículo y resuelve product_id contra productos existentes. Se mantuvo esa lógica sin cambios; se añadieron ensayos de rechazo atómico. No se tocaron modelos SQL, reservas, stock, permisos, entregas, pagos ni producción.

## Implementación

SaleLineEditor permite quitar la última fila y muestra «Aún no hay productos agregados». Mantiene el anuncio accesible y tras quitar deja foco en Agregar producto. Las elecciones de variante pertenecen a una referencia concreta de rows: editar, agregar o quitar invalida su selección y una actualización diferida verifica la misma referencia antes de incrementar. No se consolidan variantes.

SaleForm muestra una explicación breve y bloquea el envío con cero filas o con cualquier fila sin producto. La previsualización y los subtotales omiten filas sin producto y evitan importes no finitos en entradas temporales. Reañadir usa createSaleLine y el catálogo vigente, sin arrastrar identidad, cantidad, precio ni peso histórico.

## Pruebas y límites

Dirigidas: node --test tests/sale-lines.test.mjs tests/sale-empty-preview.test.mjs tests/sale-empty.test.mjs tests/sale-line-uniqueness.test.mjs: 16 aprobadas, cero fallidas, omitidas o todo. Las pruebas de dominio corren en memoria y SQLite disco: venta nueva, borrador existente, confirmación, cobro/entrega/producción solicitados, rectificación de venta entregada y mezcla de fila válida con vacía. Comparan el estado completo antes/después, incluida auditoría y revisión.

La prueba Chrome dirigida final aprobó en desarrollo tras corregir la reapertura del detalle al cancelar: Cancelar cierra el formulario, por lo que el ensayo debe navegar al listado y abrir de nuevo la venta por código. El primer intento fallido se conserva como NQP26-03_e2e_dirigida.log; el aprobado, como NQP26-03_e2e_dirigida_final.log. Después se ampliaron aserciones de anuncio, precio residual, elección invalidada al editar y borrador vacío; se comprobaron en desarrollo (NQP26-03_e2e_ampliada.log: 1 aprobada, cero fallidas) y también en la suite compilada.

Se inspeccionaron capturas sintéticas de escritorio 1440×1000 claro y móvil emulado 390×844 oscuro. Sin desbordamiento horizontal; catálogo, estado vacío y foco visibles. Chrome verifica los otros tamaños/temas, teclado Enter y anuncios DOM. No se afirma prueba en teléfono físico ni con lector de pantalla real. Se aplicó Impeccable al refinamiento conservando el diseño existente; no se actualizó el sistema visual.

La primera ejecución de verify registró 252 aprobadas, 17 todo y 1 fallo: la referencia HTML corporativa conservaba los controles anteriores de venta. Tras inspección, solo cambiaron modal:sale y modal:sale:correct; se actualizaron sus dos hashes y la nota de revisión. No se retiró ni debilitó la prueba histórica. El intento inicial de actualización se detuvo por usar sale-correct en vez de sale:correct en la lista permitida, sin escribir otros hashes; la ejecución dirigida posterior pasó. Se repitió verify completo y se conserva NQP26-03_verify_inicial.log. La segunda corrida pasó las 253 pruebas, conservó 17 todo y pasó TypeScript, pero lint detectó bottle sin uso en el ensayo E2E. Se añadió una aserción de identidad del frasco; lint y formato dirigidos pasaron. Se conservó NQP26-03_verify_segunda.log y la tercera corrida completa terminó con código 0: 270 registradas, 253 aprobadas, 17 todo y cero fallidas/canceladas/omitidas. Pasaron los tres chequeos TypeScript, lint, formato, build y distribución: 2072 archivos, 69 paquetes runtime, cero archivos privados o paquetes retirados. Evidencia: NQP26-03_verify_final.log. A continuación se inició E2E completo con Chrome sobre el build. E2E completo terminó con código 0 en una única corrida: 30 aprobadas, cero fallidas/canceladas/omitidas/todo; 498255,6543 ms. El nuevo escenario NQP26-03 pasó en 17046,0391 ms. No se ampliaron timeouts ni se repitió la suite completa E2E. La incidencia histórica de arranque de 01 no se reprodujo; no se afirma haber resuelto retrospectivamente su causa. Evidencia: NQP26-03_e2e.log. Commit funcional: a988fa61e7faa1f7b9e938c32dce69f5299b9eb4. Rama publicada con upstream en origin/codex/nqp26-03-venta-vacia. [PR #14](https://github.com/VicWaltzO/NutrequinePro/pull/14) abierto en borrador hacia main, sin fusionar. Este registro de entrega se añade en un commit documental posterior. Los 17 contratos todo de 01 siguen pendientes y no se cuentan como aprobados. Ninguna base empresarial fue abierta o modificada. Evidencias, bases sintéticas y logs permanecen locales fuera del commit.

## Evidencia de cierre

| Control                                                      | Resultado                                                                           | Log local en 04_EVIDENCIAS |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------- | -------------------------- |
| Dirigidas de líneas, previsualización, atomicidad y unicidad | 16 aprobadas, 0 fallidas                                                            | NQP26-03_dirigidas.log     |
| Chrome de desarrollo ampliado                                | 1 aprobada, 0 fallidas                                                              | NQP26-03_e2e_ampliada.log  |
| verify final                                                 | 253 aprobadas, 17 todo, 0 fallidas; tipos/lint/formato/build/distribución correctos | NQP26-03_verify_final.log  |
| E2E completo compilado, Chrome                               | 30/30 en una corrida, 0 fallidas u omitidas                                         | NQP26-03_e2e.log           |
| Detector Impeccable                                          | []                                                                                  | NQP26-03_detector.json     |

La [matriz V02-E01–E12](NQP26-03_MATRIZ_ACEPTACION.csv) registra resultados y archivos de prueba. Capturas de desarrollo en 04_EVIDENCIAS/NQP26-03 y del build en 04_EVIDENCIAS/NQP26-03_compilado. El reporte tiene copia local en 03_REPORTES/NQP26-03_REPORTE.md; el registro de tareas permanece en 05_BITACORA/REGISTRO_TAREAS.csv. Integración a main y despliegue quedan pendientes de decisiones posteriores del responsable.
