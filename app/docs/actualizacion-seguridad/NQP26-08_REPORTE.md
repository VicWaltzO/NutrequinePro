# NQP26-08 · Aviso global de faltantes netos

2026-10-29, America/Bogota. Calendario operativo: America/Lima.
Estado: **CONFORME PARA CAPA 1 / PARCIAL PARA ACEPTACIÓN EMPRESARIAL**. A08-15 y A08-16 permanecen parciales por Capa 2.

## Base y diagnóstico

Se revisó primero NQP26-07_REVISION_TECNICA, después la matriz A08-01–22 y la orden 08, contrastadas con ALERTA-01, R20–R27 y contratos/código 04–07. La revisión 07 no habilita reservas ni completa E07-14.

GitHub confirmó #18 abierto/borrador, sin fusión, cabeza `7f987c547968a0c555adaa13cbac694755cfbfee`. `origin/main` sigue en `2219f98fea2db06fc341e9b0c7e383f657aac89e`. La rama `codex/nqp26-08-aviso-global` se apila sobre `codex/nqp26-07-entrega-ux`, por dependencia del detalle moderno de venta de 07 (SaleDetail/SaleSupplyStatus), al que enlaza el aviso, y sus regresiones. En main ese detalle todavía no presenta cobertura K/N ni la guarda moderna de entrega. Worktree aislado; modificaciones y eliminaciones ajenas del checkout original preservadas.

Diagnóstico previo local: `03_REPORTES/NQP26-08_DIAGNOSTICO.md`. `useAdminOperations` ya reemplaza el estado después de comandos y recarga. `AdminWorkspace` es común a navegación y roles. El dominio valida acumuladores y enlaces de cobertura; no hay proyección global. El servidor ordinario rechaza bases modernas y el experimental rechaza servir frontend. Estas guardas permanecen intactas.

## Implementación

`pendingStock` es una proyección pura de estado comercial validado: solo ventas coverage_version=1, CONFIRMED/RECTIFIED y PENDING, y líneas vigentes con coverage.version=1. Deriva N=max(0,q−K) desde cobertura vinculada; no consulta committed ni saldo de movimientos, no asigna y no adopta históricos. Ventas únicas globalmente y dentro de cada grupo.

Agrupa por producto, unidad, peso real, peso nominal, política de peso y mecanismo. NUCLEUS_PRODUCTION explícito en saco suma al resumen por producir. DIRECT_STOCK se desglosa por presentación sin agregar a fabricación. El maestro explícito es fiable porque PRODUCT_SAVE impide cambiar presentación/modalidad con historial. No se aplica el default de productPresentation a maestros ambiguos: quedan informativos, por determinar. Los snapshots de línea conservan precedencia; no se reescriben ni convierten frascos, unidades o pesos.

`PendingStockBanner` monta una franja en flujo normal, antes del título operativo, con resumen textual, desplegable nativo, detalle por producto/presentación y ventas ordenadas según fecha de entrega, antigüedad e ID. Abrir venta reutiliza sale-detail existente. Resumen aria-live polite/atomic; teclado y foco nativos; enlaces de lectura para ADMIN, OPERATOR y VIEWER. La franja desaparece sin N>0, aunque la entrega siga pendiente. Microinsumos permanecen separados.

No cambia comandos, permisos, persistencia, esquemas, HTTP, fechas, pagos, lotes, precios o movimientos. No hay flag de entorno/URL/UI/configuración para reservas. No hay adopción legacy, fusión, despliegue ni datos empresariales.

## Evidencia y límites

Los escenarios de dominio usan comandos reales de la composición aislada en memoria y SQLite. El ensayo de navegador empieza con un servidor ordinario y una venta legacy, comprueba ausencia de aviso K/N y luego utiliza transporte simulado solo dentro de Playwright para leer otro estado sintético persistido. Bloquea cualquier comando del navegador en esa fase. No hay ruta de fixture en la aplicación ni enlace del servidor ordinario al motor experimental.

Navegación/recarga/actualización modernas, roles y render del banner son evidencia sintética protegida. No acreditan actualización comercial ordinaria tras reposición. A08-15/16 se mantienen PARCIALES por esa frontera; los resultados de SSR nunca se presentan como integración empresarial. I14–I19 y E07-14 siguen pendientes/parcial según sus contratos.

## Ejecuciones

- Rojo inicial: prueba no ejecutable por selector aún inexistente; 0 aprobadas, 1 fallida, sin ocultar el intento.
- Dirigida 01: 3 aprobadas, 2 fallidas. El fixture histórico no tenía modalidad explícita: se preparó la ficha antes de historial, sin relajar clasificación.
- Dirigida 02: 3 aprobadas, 2 fallidas. El dominio rechazó anular una venta con pago; el ensayo ahora revierte expresamente el pago antes de cancelar.
- Dirigida 03: 5/5 aprobadas, cero fallidas/todo/omitidas/canceladas. Incluye memoria y SQLite. Están incluidas en verify, no se suman aparte.
- Comprobación adicional exact-seven: RECTIFIED, q=14/K=7/N=7 y una venta. No se suma al total de pruebas.
- verify-01: salida 0; 355 aprobadas, seis todo I14–I19, cero fallidas/omitidas/canceladas. Tres TypeScript, lint, formato, compilación y auditoría correctos: 2078 archivos, 69 paquetes runtime, cero privados/retirados.
- UI-01 dirigida: 1/1 aprobada. Navegación/recarga, roles, teclado, aria, retiro tras reposición/cancelación y cuatro capturas 1440/390 claro/oscuro. El estado ordinario legacy no muestra aviso K/N. Se conserva distinción de transporte sintético.
- E2E-01 completo: 33/33 aprobadas en una corrida después del build final; cero fallidas/omitidas/canceladas/todo, salida 0. Incluye flujos ordinarios de fechas, Entrega legacy, lote, pagos, reapertura, CascoPlus+, BASE no vendible y formularios; el control nuevo A08 declara explícitamente su segmento sintético. No se suman UI-01 ni dirigidas al total.
- Después de verify, el único cambio de prueba fue capturar fullPage en lugar del viewport; el E2E completo usa esa línea final. Lint y formato del ensayo repetidos correctamente. Código funcional sin cambios desde 17e8836.
- CI de la cabeza af1d4f8dbc9e65e2cb9f6562ae82a3c6fed83b48: [workflow 40960962132](https://github.com/VicWaltzO/NutrequinePro/actions/runs/40960962132), completed/success, incluidos verify y E2E en Linux. Consultada después de finalizar; no se imputa a otro SHA.

Logs completos de todos los intentos y capturas sintéticas en `04_EVIDENCIAS`, fuera de Git. No se cambian timeouts ni huellas de regresión HTML.

## Revisión

Revisión estática independiente del SHA funcional `17e88365cad71c40dd5d6c2d99d0a6caa04c9000` contra 7f987c5: sin hallazgos P0–P2. Alcance: código y pruebas escritas; no ejecución ni aprobación empresarial/formal de GitHub. Revisión independiente de documentación visual: extensión compatible con tokens y reglas existentes; DESIGN.md conservado. Deuda preexistente design.json no reparada ni canonizada.

Revisión visual independiente final: **ship** para esta extensión operativa, sin correcciones materiales. Cuatro capturas fullPage desde el inicio del documento: 1440×1000 y 390×844, claro/oscuro, estado desplegado con foco visible. Franja en flujo normal y acciones posteriores alcanzables; sin desbordamiento del cuerpo. El desplegable comienza cerrado. Detector Impeccable sobre targets modificados: [] (una ejecución). No equivale a prueba en teléfono físico ni lector de pantalla real.

## Archivos de la entrega

- app/features/ventas/domain/pending-stock.mjs
- app/features/ventas/components/PendingStockBanner.tsx
- app/client/pending-stock.css
- app/client/admin/AdminWorkspace.tsx
- app/client/main.tsx
- app/tests/pending-stock.test.mjs
- app/tests/local-e2e/pending-stock.test.mjs
- app/docs/actualizacion-seguridad/NQP26-08_REPORTE.md
- app/docs/actualizacion-seguridad/NQP26-08_MATRIZ_ACEPTACION.csv

## Entrega y cierre

[PR #19](https://github.com/VicWaltzO/NutrequinePro/pull/19) abierto en borrador, base codex/nqp26-07-entrega-ux, sin conflictos ni fusión, comprobado en GitHub. Commits 17e8836 (implementación) y af1d4f8 (reporte/matriz y captura fullPage) publicados y cotejados mediante ls-remote. Revisión estática independiente adicional del delta fijo 17e8836..af1d4f8: sin P0–P2; solo documentación y captura completa. El cierre documental posterior no cambia código y su SHA/CI se registra en la bitácora y el PR.

Matriz completa: **20 controles técnicos aprobados y dos parciales (A08-15/16)**, con nivel de evidencia por escenario. No quedan controles sin resultado. La franja moderna sigue inerte en aplicación ordinaria: no se habilita el motor para obtener aprobación. E07-14 e I14–I19 conservan su estado. Conforme para Capa 1; sin aceptación empresarial, fusión ni despliegue.

## Ajuste NQP08-R1 · 2026-10-29

Estado remoto contrastado: PR #18 y #19 ya fusionados por acciones anteriores; main `fabe5c93e4f15899586f8db30a60939c8c95635a`. Se preserva la entrega original como antecedente; las afirmaciones anteriores sobre PR abiertos no describen el estado vigente. Parche independiente `codex/nqp26-08-indexacion` desde ese main, en el worktree existente de 08. No se retargetea un PR fusionado ni se realiza otra fusión/despliegue.

Se reemplaza P×L por índice único de líneas vigentes con cobertura y acumulador por grupo dentro de cada venta. Orden original de líneas y prioridad de ventas intactos; contrato de salida sin campos nuevos. Costo O(S + P log P + L + G log G), incluyendo filtro de ventas y ordenamiento de grupos que ya existían. Memoria O(L + G + pares venta/grupo de salida). No se aborda el P3 opcional del resumen; no cambia UI, design.json, comandos ni persistencia.

Oráculo congelado del selector anterior en tests/helpers/pending-stock-reference.mjs. Cuatro pruebas comparan salida completa e inmutabilidad a tamaños crecientes, con líneas múltiples, inactivas, 25/50 kg, frascos 2,2 kg, K=q, históricos sin cobertura y empates de fecha/antigüedad. Cuentan consultas de sale_id con getters; el nuevo índice inspecciona todos los registros una vez y omite claves de filas no vigentes/sin cobertura. No se fijan tiempos máximos frágiles.

Medición dirigida: 100 pedidos/10.600 líneas: 1.060.000 consultas antiguas frente a 500 nuevas, 44,5 ms frente a 2,8 ms. 1.000 pedidos/106.000 líneas: 106.000.000 frente a 5.000, 3.646,8 ms frente a 34,9 ms. Los tiempos son observaciones de esta máquina, no SLA ni evidencia empresarial.

A08-15/16 siguen PARCIALES; E07-14 e I14–I19 no cambian. Reservas empresariales siguen deshabilitadas. Revisión independiente del delta contra main: sin P0–P2 para AppState válido; el revisor ejecutó 4/4 nuevas pruebas y diff --check. No ejecutó verify ni E2E; esos resultados corresponden al agente principal.

Validación del ajuste: verify-04 completo con salida 0, 359 aprobadas, seis todo I14–I19, cero fallidas/omitidas/canceladas. Tres TypeScript, lint, formato, build y auditoría correctos: 2078 archivos, 69 paquetes runtime, cero privados/retirados. Las cuatro nuevas pruebas están incluidas en el total.

Intentos conservados: verify-01 terminó 358 aprobadas/1 fallida/6todo por timeout de 30 s al arrancar distribución aislada; no se amplió el timeout. verify-02 no inició porque Node prohíbe --test-concurrency en NODE_OPTIONS; no se cambió el comando ni el entorno persistente. verify-03 aprobó 359/6todo, tipos y lint, pero detectó formato del informe. Se formateó y repitió verify-04 con el comando normal, correcto. E2E completo tras ese build: 33/33 aprobadas, salida 0, cero fallidas/omitidas/canceladas/todo. No se suman dirigidas. Logs en 04_EVIDENCIAS/NQP26-08_ajuste-\*.

Entrega del ajuste: validación local completa y revisión independiente correctas; CI y PR correctivo se verifican tras publicar. La condición de integración preparatoria queda pendiente de CI en el SHA publicado.
