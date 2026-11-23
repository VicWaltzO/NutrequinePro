# NQP26-39 — Reporte técnico

Base: origin/main 7cf56f4b36a6cc643a982f62bcea0c0958089353. GitHub PR #51 closed, merged=true, draft=false; integrado el 20-11-2026 18:00:02 America/Bogota. SHA bc0fde250e224140f4f5aa38581a92d2ddd79817 ancestro de main. Comentario Codex 6932787837: completed, sin findings ni unresolved findings sobre ese SHA.

Ficha oficial y fuentes A/B leídas, R40 preserva la elección de cobro real/teórico. Cuatro fórmulas macro; no confundir las dos familias micro. Rama independiente codex/nqp26-39-macro-historial en worktree desde origin/main. Checkout original con cambios ajenos preservado.

Comportamiento previo: ProductionsView recorre todas las fórmulas en orden inverso, abre activas y deja históricas colapsadas en la misma lista. FORMULA_SAVE ya desactiva activas del producto, fija valid_to y añade versión creciente sin sobrescribir ingredientes previos. buildProductionProduct selecciona activa y guarda formula_id y formula_snapshot; costos y pesos se congelan por lote. FormulaForm crea versiones y la guarda write existente controla edición.

Brecha: separar la consulta de activas y un historial cerrado inicialmente, solo lectura, con fechas de inicio/fin. Solución mínima: componente común de lectura; secciones semánticas y details nativo. Conservar orden inverso y permisos. Sin cambios de dominio, esquema, migraciones, endpoints, molino, costos, producción o reservas I14–I19.

Riesgos: referencias SSR corporativas, fechas finales ausentes, nombres vinculados ausentes/renombrados, vacío, foco/overflow móvil. Pruebas propias de separación, v2/v3 sintéticas, inmutabilidad de lotes/estado, roles y navegador a 390/1440 claro/oscuro. Solo se actualizará una huella corporativa afectada y se conservarán las restantes.

Registro previo: diagnóstico guardado antes de cambios funcionales; validaciones y cierre pendientes en ese momento.

## Implementación y alcance

La vista principal filtra exclusivamente is_active; el historial cerrado inicialmente contiene exclusivamente inactivas. Ambas reutilizan MacroFormulaList y el mismo render de producto, versión, fechas, ingredientes, peso por núcleo, total y peso comercial. Las fechas finales existentes se muestran sin inventar fechas nuevas. Se conservan orden inverso de versiones, ordenamiento SortableTable, formato weight y la guarda write existente. El historial no ofrece edición; ADMIN y OPERATOR conservan crear versión, VIEWER mantiene solo lectura con rechazo HTTP de escritura.

No se cambió FORMULA_SAVE ni FormulaForm, snapshots, contratos, permisos, SQLite, migraciones, endpoints, molino real/teórico, costos, inventarios, familias micro ni reservas I14–I19. El diagnóstico se registró antes de editar. No se iniciaron NQP26-40 ni despliegues y no se usaron bases empresariales reales. Los datos y cuentas de prueba se generaron explícitamente en fixtures sintéticos aislados.

Se añadieron estados vacíos y etiquetas para referencias ausentes; la lectura no inventa recetas. Se conservan BASE y la exclusión existente de productos de ingreso directo como CascoPlus+ sin fórmula. Las tablas conservan scroll interno cuando lo necesitan; los nombres largos se ajustan. El historial usa details/summary nativos con Enter/Espacio, regiones semánticas, mínimo de 44px y foco interior para evitar el recorte heredado.

## Validación específica

Dos pruebas propias SSR/dominio: cuatro fórmulas macro, v2/v3 por producto, una activa y anteriores solo históricas, fechas finales, lotes y costos históricos inmutables, nuevo lote con fórmula vigente; tres roles, renombres, vacío y referencias/ingredientes ausentes. Las comparaciones clonan el estado del VM para contrastar datos sin diferencias de prototipo.

E2E propio Chrome: v2 por API y v3 por FormulaForm vigente; cuatro activas, dos históricas, ordenamiento local, apertura/cierre y recarga; 390px y 1440px, claro y oscuro, Tab/Enter/Espacio/foco, cero desborde global, sin errores JavaScript. Comparación completa de estado y revisión; cero solicitudes de escritura durante consultas. ADMIN crea versión, OPERATOR conserva su acción y VIEWER sin acción y con HTTP 403. Cuatro capturas sintéticas revisadas visualmente.

Revisión independiente sin contexto: tres pruebas propias SSR de partición intercalada, estado congelado, permisos, escape de nombres, dosis/totales exactos con weight vigente, fechas, BASE y CascoPlus+. Ensayo propio Chrome con tres históricas, nombres largos a 390px, teclado, cero escrituras y revisión intacta. Detectó P2 de foco recortado; corrección local de outline-offset y nueva aserción E2E, con comprobación independiente posterior. El acta y los ensayos se incluyen en el ZIP. Ningún hallazgo P0–P2 queda abierto al cierre local.

## Referencias corporativas y ciclos

Se actualizó exclusivamente ADMIN:productions/formulas tras inspección del DOM y de las cuatro capturas. Huella anterior 4efa0dac09c3016d4748c213ee8a62ce9004c56c96c8cf92da8a8856957314d8; nueva 9d19ffa9eea1bbdff3fbeaaf34fa29b7bd5685dc47520a748b6d4b4fd655e1d5. Las otras 65 huellas se conservaron byte por byte; no se cambiaron normalizadores ni se regeneró indiscriminadamente el fixture.

CICLOS.md conserva los fallos iniciales y correcciones: cwd de npm, import del componente, comparación de VM, actualización puntual de golden, activación real de modalidad teclado y P2 de foco. El primer verify completo aprobó antes del ajuste de foco; se repitió completo después. Sin ocultar fallos, reducir controles ni fijar un límite de ciclos.

## Límites y gobierno

Chrome y semántica nativa comprobados; no se ensayó lector de pantalla físico ni todos los navegadores. El historial muestra nombres vinculados actuales según contrato existente; los snapshots de lotes se conservan y no se reescriben. Los filtros globales preexistentes no se rediseñaron; el ordenamiento de ingredientes permanece local y sin persistencia.

Se entregan exactamente cuatro archivos oficiales en 03_REPORTES, 04_EVIDENCIAS y 05_BITACORA. El reporte versionado es resumen técnico sin evidencias privadas; las capturas, ZIP y datos temporales no se incluyen en commits. El cierre remoto se registra en esos entregables y en el PR para vincular el SHA final sin modificarlo después de verificar. La integración requiere revisión técnica posterior de ChatGPT y autorización humana expresa. No fusionar ni desplegar.

## Verificación global

Verify final (segunda ejecución completa tras corregir foco): PASS. 778 casos: 772 aprobados, 0 fallos, 6 TODO históricos I14–I19; sin omitidos ni cancelados. Tres comprobaciones TypeScript, lint sin advertencias, formato, build y distribución: 2126 archivos, 69 paquetes runtime, 0 privados. E2E global completo tras el build final: 61/61 PASS, 0 fallos, 0 omitidos, 0 cancelados y 0 TODO. Duración 1244310,7502 ms. Corridas locales completadas el 20-11-2026; cierre documental y remoto retomado el 23-11-2026, America/Bogota. No hubo cambios funcionales durante la pausa.
