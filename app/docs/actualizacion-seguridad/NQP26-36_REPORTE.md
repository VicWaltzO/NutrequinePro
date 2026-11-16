# NQP26-36 — Diagnóstico previo e implementación

Base: origin/main `2536fba1f53900084ad87312bc81dedec7a96d5e`. Worktree independiente y rama codex/nqp26-36-alertas. Checkout original con cambios ajenos preservado.

## Puerta 0

Git fetch confirmó [PR #48](https://github.com/VicWaltzO/NutrequinePro/pull/48) integrado. El [resumen estructurado del PR #48](https://github.com/VicWaltzO/NutrequinePro/pull/48#issuecomment-6902044809), comentario 6902044809, actualizado 2026-11-16T02:39:52Z (15/11 21:39:52 Colombia), registra code_review completed sobre 3c627940b3fff951c8b06b18966a7166953aad8f, has_any_findings=false y has_unresolved_findings=false. PR #48 sin hilos. El [hilo P2 PRRT_kwDOVAc-LM63tZoK del PR #47](https://github.com/VicWaltzO/NutrequinePro/pull/47#discussion_r4580032114) sigue administrativamente abierto: la reconstrucción usaba el corte actual para borradores históricos; HF01 reconstruye apertura auditada histórica y mantiene el corte vigente al confirmar. La corrección 3c627940 está integrada en 2536fba1. No se reabre ese defecto corregido por el mero estado del hilo. No se escribieron comentarios ni se resolvieron hilos ajenos.

## Diagnóstico antes de editar

Ficha oficial NQP26-36 y fuentes A/B R44–R45 leídas junto con orden y 47 controles. evaluatePreparation usa formula_id histórico, microFormulaRequirement, valuationHundredths y assignedHundredths; resta compromisos de terceros y conserva asignación propia. preparationOverview evalúa todas las órdenes. UI MicroPreparations muestra necesidades y se recarga por s.revision/foco/reevaluación. Brecha: falta umbral preventivo 20×máximo y distinción explícita de avisos por orden pendiente. No hacen falta tablas, migraciones ni un endpoint nuevo.

Solución mínima: compartir lectura física de apertura/ledger, derivar máximos de cabezas activas autorizadas y agregar alertas al overview existente. Presentar avisos locales en microinsumos. Fórmulas ausentes/incompletas y saldos no registrados serán datos no disponibles. No alterar evaluación, consumos, costos ni asignaciones. Riesgos: unidades centésimas, igualdad, fórmulas históricas, compromiso propio y lectura obsoleta durante refresco; cubrir con pruebas.

## Implementación

Se agregan `alerts.mjs`, `stock-balances.mjs` y `MicroAlerts.tsx`. El overview conserva sus contratos previos y agrega `alerts.preventive` y `alerts.by_order`. El saldo físico compartido conserva prioridad ledger/apertura y la evaluación original de compromisos. Se usan enteros en centésimas de gramo y formato específico en gramos con dos decimales para avisos. No hay tablas, migraciones, comandos ni endpoints nuevos.

El preventivo toma solo cabezas activas publicadas y autorizadas; cada ingrediente usa el máximo entre familias multiplicado por 20. Una familia sin receta completa/autorización se informa incompleta, sin cobertura total ficticia. Ingredientes sustituidos fuera de ambas cabezas desaparecen del preventivo. Las órdenes pendientes mantienen su formula_id histórico, asignaciones propias y de terceros. Confirmadas y supersedidas no alertan. La UI distingue ambos avisos y solo los muestra para revisión coincidente; recarga por revisión, foco o reevaluación.

## Validación

- `npm.cmd run verify` final: PASS; 770 casos, 764 PASS, 0 FAIL, 6 TODO históricos I14–I19 sin activar. Tres chequeos TypeScript, lint, formato, build y auditoría de distribución PASS: 2126 archivos, 69 paquetes runtime, 0 archivos privados.
- Pruebas nuevas: 9 principales (incluye HTTP real, SQLite integrity/FK, GET puro para tres roles, compra/replay/CAS) y 7 adversariales independientes; todas PASS. Se cubren dosis máximas/exclusivas, sustitución, receta histórica, ausencia de cabeza/apertura, duplicados/ID14, igualdad, déficit0.01g, compromisos/reversión/consumo, compra25→20, RETURN y AUDIT_ONLY.
- Revisión independiente sin contexto, acta separada y hashes de seis archivos finales: sin hallazgos P0–P2. Un ciclo automático de dos permitidos: dos reglas de lint `no-nested-ternary`, corregidas con if equivalentes. No hubo correcciones funcionales solicitadas por el revisor.
- Primera ejecución de verify: pruebas PASS (762+6TODO), detenida en lint; fue reemplazada por verify final completo. Dos casos adicionales posteriores están incluidos en los 770 finales.
- E2E: primer intento concurrente detenido tras fallo heredado de reinicio en respaldo/restauración; se conserva evidencia. Reintento aislado sin cambios de código: ese mismo paso L15 y flujo completo Frontend08 PASS. Suite E2E final completa: 58/58 PASS, 0 FAIL, Chrome instalado, tras build. El escenario nuevo comprueba desaparición tras compra y déficit exacto de 0.01/0.02 g tras consumo. Cuatro capturas sintéticas revisadas visualmente: 1440/390 px, claro/oscuro; sin desbordamiento horizontal.
- Detector mecánico de interfaz: sin observaciones. `git diff --check` limpio; capturas sintéticas y datos locales excluidos de Git.

## Gobernanza y entrega

Búsquedas adicionales de issues abiertos P0/P1/P2 y PR abiertos no devolvieron resultados en la consulta previa a publicar esta rama. Ello complementa la revisión del alcance y no certifica ausencia universal de defectos. El hilo PR47 queda administrativamente abierto, documentado como remediado por PR48; no se enviaron comentarios ni se resolvió en nombre del usuario.

No se anticipan NQP26-37/38, no se habilitan reservas I14–I19, no se usan bases empresariales ni se modifican consumos, compras o costos históricos para generar avisos. Las consultas son puras y no garantizan atención simultánea sin asignación formal. Sin merge ni despliegue. La integración queda sujeta a revisión técnica posterior y aprobación humana expresa.

Los cuatro entregables oficiales locales y el PR en borrador se cierran tras comprobar push y ambas CI sobre SHA final. Esta copia pública conserva únicamente documentación sanitizada; ZIP, matriz oficial, bitácora y capturas quedan fuera de Git.
