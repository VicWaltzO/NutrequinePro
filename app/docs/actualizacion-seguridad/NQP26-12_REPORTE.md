# NQP26-12 — Ordenamiento global tipado y accesible

2026-10-30, America/Bogota. **CONFORME LOCAL**: 208/208 columnas SI implementadas en 42/42 superficies elegibles; 60 NO conservadas. Cierre de PR y CI aún pendiente de observación.

## Base y aislamiento

Al iniciar se observó main e66f4de y PR23 abierto/draft en 1ed523e; se creó un worktree administrado separado sobre la cabeza 11. Durante la ejecución se confirmó su integración externa: merge **6f5c7921825afebd9a8d5afd997a016ffb39e7cf**, 30/10/2026 16:35:53 UTC. `git diff --quiet 1ed523e origin/main` = 0: ambos árboles son idénticos. La rama `codex/nqp26-12-ordenamiento-global` se reposicionó conservando índice/trabajo sobre ese main. El PR de 12 es independiente hacia main. Esta tarea no fusiona ni despliega; el checkout original y sus cambios ajenos se conservan.

Fuentes leídas y contrastadas: revisión técnica/fuentes 11, inventario, contrato, matrices y orden 12 del ZIP; ficha oficial Kit/02_TAREAS/NQP26-12 y UX-01. Se trataron como especificación del encargo, sin ampliar autorización. D11-25 conserva su condición parcial histórica; no se reetiqueta retrospectivamente.

## Implementación por etapas

- **A, núcleo:** `table-sort.ts` compara escalares/tuplas sobre valores originales. Collator es-PE natural, céntimos, gramos, decimales, fechas civiles/meses ISO e instantes por época. Nulos/vacíos al final en ambas direcciones; 0/false válidos; secundarios ASC e identidad estable. Ordena copia decorada con originalIndex, sin mutar registros.
- **B, listados:** `SortableTable` recibe registros/accesores tipados y render callback. Botones nativos en encabezados elegibles, aria-sort activo y ciclo inicial→ASC→DESC→inicial. No inspecciona DOM ni ordena React children. Filtros anteriores, contextos compartidos y las últimas cinco ventas del resumen conservan su alcance.
- **C, detalles/formularios:** integración en snapshots, History, perfiles y formularios. OriginalIndex mantiene pareja a.products[i]/handler en rectificación y conciliación; aplicaciones, devoluciones y preview conservan IDs. Los controles NO, acciones y JSON no reciben indicadores. FORMULA-EDITOR sigue sin sort.
- **D, reconciliación:** 51 IDs/268 columnas, 43 UI (42 elegibles) y ocho PDF. Seguimiento por columna con accessor real, archivo/línea y caso de prueba; cobertura por contexto consumidor. No hay delta de superficies respecto a la fuente 11.

El anexo de [contrato efectivo](NQP26-12_CONTRATO_COMPARADORES.md) documenta enums por etiqueta, booleanos, compuestos, cantidades mixtas por cantidad principal/unidad secundaria sin agregación, nulos, claves y estado de contexto. No cambia servidor, comandos, dominios empresariales, SQLite, esquemas, permisos, PDF, prioridades ni reservas. No hay dependencias nuevas ni cambio de lockfile.

## Verificaciones realmente ejecutadas

| Control                           | Resultado observado                                                                                                                                                                                     |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| verify-03                         | **Salida 0**; 433 totales: **427 PASS, seis TODO I14–I19**, cero fallos/canceladas/omitidas.                                                                                                            |
| TypeScript/lint/formato/build     | Check, check:node, check:client, lint, format:check y build completos aprobados dentro de verify-03.                                                                                                    |
| Distribución                      | 2080 archivos, 69 paquetes runtime, cero archivos privados y cero paquetes retirados.                                                                                                                   |
| E2E-03, después del build         | **Salida 0, 36/36 PASS**; cero fallos/canceladas/omitidas/TODO; 721301.143 ms.                                                                                                                          |
| E2E global 12 dentro de esa suite | 79752.7877 ms; áreas/detalles/formularios, encabezados ASC/DESC/inicial, Enter/Space, foco, filtros y subconjunto del resumen.                                                                          |
| Núcleo/cobertura dirigida         | 47/47: tres del núcleo, 43 familias UI y reconciliación. Están incluidas en npm test, no se suman de nuevo.                                                                                             |
| Dirigida E2E previa Sort04        | 1/1 PASS, 78.645 s; es repetición de la prueba de la suite, no un caso adicional.                                                                                                                       |
| Referencia HTML existente         | Conservados 66 escenarios: se normalizan solo los nuevos controles de encabezado; contenido, inputs y pantallas restantes siguen contra sus huellas originales. No se reemplazaron huellas masivamente. |
| Revisión independiente            | Dos inspecciones favorables sin P0–P2 confirmados; 47/47 dirigidas propias del revisor, sin atribuirle verify/E2E del autor.                                                                            |

La prueba global compara el estado HTTP completo, auditoría/revisión incluidas, y confirma cero comandos por ordenar. Luego realiza seis guardados sintéticos deliberados: rectificación por producto, conciliación por ingrediente, pago/crédito por venta, devolución por línea y borrador por insumo. Verifica persistencia y reapertura; no se confunden esos guardados con escrituras causadas por sort. También abre History de producción tras rectificar.

Se capturan 12 combinaciones ADMIN/OPERATOR/VIEWER × 1440×1000/390×844 × claro/oscuro en el directorio. Se inspeccionaron directamente escritorio y móvil en ambos temas. El recorrido exhaustivo de cabeceras/contextos es ADMIN; las capturas/roles y las suites previas añaden permisos y responsividad. No se afirma una prueba cartesiana de todo dato histórico/rol/tema posible. SSR instrumenta la frontera para evaluar cada accessor y elegibilidad, no sustituye la interacción real. Los oráculos primarios son independientes; secundarios/ciclo/índices se prueban en el núcleo y navegador.

Medición complementaria de la utilidad pura: 10 000 filas sintéticas en 8.92 ms, fuente intacta. No es SLA ni medida del rendimiento total del dominio/UI.

## Incidencias y correcciones conservadas

- Primer helper E2E no transmitía el request_id del replay existente; se corrigió la prueba. Otro ensayo esperaba ASC al volver al mismo contexto que conservaba su selección: las capturas independientes ahora recargan.
- Una E2E paralela inicial se abortó: el test de autonomía reconstruye dist-node sin frontend, mientras E2E copiaba esa distribución transitoria. La corrida final fue secuencial después de verify/build válido.
- Al ampliar guardados, el helper esperaba cierre del diálogo, pero el flujo existente abre el detalle guardado; ahora espera que desaparezca el formulario y cierra el detalle. Otro fixture intentaba S/1.23 sobre una primera venta reducida a S/0.77 por crédito: la validación nativa rechazó el envío. Se selecciona la venta objetivo por ID/código y se verifica la validez del formulario, sin debilitar sus límites.
- Verify-01: 427 PASS/seis TODO y tres TS/lint correctos; detención por formato de History e informe independiente, corregido con Prettier.
- Verify-02: 424 PASS, tres timeouts, seis TODO. Se observó un avance de reloj de varias horas y duraciones anómalas; fallaron autonomía y dos procesos PowerShell ACL con ETIMEDOUT. No se atribuye causa definitiva ni se amplían timeouts/permisos. Verify-03 completo pasó sin cambios de runtime.

## Entrega y trazabilidad

- [Matriz de aceptación](NQP26-12_MATRIZ_ACEPTACION.csv).
- [Cobertura de 43 UI](NQP26-12_MATRIZ_COBERTURA_43_UI.csv).
- [Seguimiento de 268 columnas](NQP26-12_SEGUIMIENTO_268_COLUMNAS.csv).
- [Revisión independiente](NQP26-12_REVISION_INDEPENDIENTE.md).
- [Diagnóstico previo y actualización de base](NQP26-12_DIAGNOSTICO.md).

Las dos matrices de cobertura conservan 208 IMPLEMENTADO/60 EXCLUIDO_CONTRATO y 42 UI APROBADO/FORMULA-EDITOR excluido. La matriz de aceptación cierra los controles locales; PR/CI se completan solo al observarlos. El SHA funcional, SHA final y URLs de CI se registrarán en el PR y cierre externo para evitar autorreferencia del commit documental.

Copias completas en `C:/Users/vicve/Documents/ChatGPT/NQP26-12-entrega/03_REPORTES/`; logs/capturas sintéticos externos en `04_EVIDENCIAS/` y bitácora en `05_BITACORA/`. No se versionan bases, credenciales, capturas, logs completos ni archivos de despliegue. Sin fusión ni despliegue.
