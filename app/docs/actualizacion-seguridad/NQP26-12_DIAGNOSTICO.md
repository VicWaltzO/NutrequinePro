# NQP26-12 — Diagnóstico previo

Fecha: 2026-10-30, America/Bogota. GitHub consultado en vivo: PR #23 abierto/draft, cabeza 1ed523e67b6e8b4c9ad4943d26b013a1aa9e4d2e, base main e66f4deefd75ad938ba6b6acabe3de46ed0ddc3e. Worktree aislado sobre esa cabeza; PR de 12 se apilará sobre codex/nqp26-11-inventario-tablas. Checkout original con cambios ajenos intacto.

Fuentes: ZIP NQP26_11_REVISION_Y_12_INICIO, revisión técnica y fuentes 11; contrato, matrices, seguimiento y orden 12; tarea oficial de Kit y UX-01. Son evidencia/especificación del alcance solicitado, no autorización de fusión ni despliegue. D11-25 sigue parcial históricamente.

Sin delta aplicativo entre e66f4de y cabeza 11: solo diez documentos. Inventario congelado: 51 IDs, 268 columnas; 43 UI (42 elegibles), 8 PDF; 208 SI y 60 NO. Las propuestas se validan contra los accesores del código, no contra HTML. Table solo recibe heads/children: 33 declaraciones en 21 archivos. No hay paginación de registros; los filtros y autorización producen los arrays antes del render. Dashboard selecciona exactamente slice(-5). No se modifica ese alcance.

Arquitectura elegida: utilidad pura de valores escalares/tuplas tipadas, decoración con posición original e identidad, sort inmutable; SortableTable genérico recibe registros y render callback, nunca ordena children. Ternario original/asc/desc, nulos al final en ambas direcciones, secundarios ascendentes fijos e identidad estable. Enums sin prioridad empresarial documentada por etiqueta española, booleanos false/true. Fechas civiles/meses por representación ISO, instantes por época. Cantidades mixtas por cantidad numérica principal y unidad secundaria ASC fija (decisión final detallada en contrato), sin sumar unidades incompatibles.

Riesgos: índices en ReconcileForm y ProductionCorrectionForm (se preserva posición fuente para handlers y a.products[i]); inputs por ID en pagos, crédito, devolución y producción. Snapshots y correcciones tienen ID; meses usan periodo único; disponibilidad legacy usa product_id; previews usan ing.id. Contextos reutilizados conservan estado solo dentro de su montaje/contexto; subpestaña/entidad nueva restaura orden inicial. PDFs, servidor, SQLite, prioridades y reservas fuera del cambio.

Plan por etapas: A núcleo y pruebas unitarias; B listados; C detalles/formularios; D conciliación 268/43, regresión completa y revisión independiente sin contexto del implementador.

## Actualización de base durante la ejecución

En una reconsulta de GitHub se confirmó que #23 fue integrado externamente el 30/10/2026 a las 16:35:53 UTC (11:35:53 America/Bogota), merge `6f5c7921825afebd9a8d5afd997a016ffb39e7cf`. `git diff --quiet 1ed523e origin/main` devuelve 0: no hay delta de archivos ni de inventario. La rama propia todavía sin publicar se reposicionó conservando íntegramente índice y trabajo sobre ese main. El PR de 12 se abre independiente hacia main. No se realizó ninguna fusión por esta tarea; la validación en curso conserva el mismo código.
