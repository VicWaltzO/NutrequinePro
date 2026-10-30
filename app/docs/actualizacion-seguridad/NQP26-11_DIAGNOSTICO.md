# NQP26-11 · Diagnóstico previo

2026-10-30 America/Bogota (contrato operativo America/Lima). Base consultada mediante git fetch y GitHub PR #22: e66f4deefd75ad938ba6b6acabe3de46ed0ddc3e, merge de #22. Cabeza 10: 7120e3a3127995cf0d86017af8227e0e7d8c6a1b. La revisión adjunta describe un estado anterior: hoy #22 está cerrado/fusionado. Rama independiente codex/nqp26-11-inventario-tablas, worktree hermano NQP26-11-inventario. Cambios ajenos del checkout original preservados. create_worktree del app rechazó dos intentos por referencia; git worktree add completó el aislamiento.

Lecturas: revisión técnica 10; ficha oficial Kit/02_TAREAS/NQP26-11.md, plan maestro Kit/00_DIRECCION/PLAN_MAESTRO.md, UX-01 de fuente A, AGENTS raíz/app; matriz de 28 controles inicialmente PENDIENTE, plantilla, semilla, diagrama y orden. Los documentos adjuntos son requisitos contrastados con la petición, no autorización para fusionar, desplegar o adelantar 12.

Brecha: Table compartido solo recibe cabeceras/children. Un inventario por importaciones omitiría instancias indirectas de SaleTable (dashboard, ventas, cobranza, perfil), ProductionList (producción y balance), History por entidad, tablas por fórmula y snapshots. El informe es sobre tablas de visualización, no sobre esquema SQL. Descubrimiento preliminar: tablas JSX compartidas y generador PDF server/reports.mts; comprobar asimismo DOM dinámico y listas sin tabla.

Alcance: solo documentación verificable, una fila por columna y contexto; comparadores propuestos para 12, sin modificar runtime, UI, negocio, contratos, baseline, datos ni lockfile. Informes versionados en esta carpeta conforme AGENTS. Copias de entrega 03_REPORTES, evidencias 04_EVIDENCIAS y bitácora 05_BITACORA fuera de Git. Riesgos: confundir presentación con valor bruto, gramos con kg y centavos con soles; omitir tablas anidadas; afirmar paginación remota inexistente o acceso administrativo donde solo hay controles de escritura.

Pendiente en este diagnóstico inicial: conciliación completa, verify/E2E sintéticos, revisión independiente, matriz final, commit, push, PR draft y CI del SHA final. Sin aceptación anticipada.
