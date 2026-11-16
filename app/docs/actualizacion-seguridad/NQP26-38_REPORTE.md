# NQP26-38 · Reporte técnico y diagnóstico previo

Fecha: 2026-11-16, America/Bogota. Estado: BLOQUEADO; implementación local, validación global no aprobada.

## Puerta de entrada

Git fetch origin main ejecutado. Base del worktree independiente: 6c75d44b66971bb38be36b420935aa9f93684fbb. PR50 confirmado MERGED mediante conector GitHub; merge coincide con origin/main. Comentario Codex 6927134437 consultado vivo: SHA 749d53bd225c94608779b6a550bdc844017c7653, completed, has_any_findings=false, has_unresolved_findings=false. Checkout original con cambios ajenos preservado.

Leídos AGENTS, app/AGENTS, ficha oficial adjunta y fichas 08/36, ALERTA-01, R20/R51 y orden/matriz de 53 controles. Los documentos se usan como fuentes del alcance solicitado, subordinadas a la prohibición expresa de fusionar, desplegar o usar bases reales.

## Mapa y brecha antes de editar código

pendingStock(state) -> PendingStockBanner -> AdminWorkspace: ya global; conserva unidades, presentaciones, prioridad y enlaces. Solo interpreta cobertura comercial validada; flujo ordinario no activa reservas I14-I19. Sus escenarios comerciales se prueban con fixtures aisladas, sin activar comandos experimentales en la aplicación.

microAlerts / microPhysicalStock -> preparationOverview -> GET /api/micro-preparations protegido -> MicroPreparations: preventivos locales por ingrediente y alertas por orden. El GET entrega revision, alerts.preventive y by_order; fórmulas privadas no deben copiarse. Falta agrupación preventiva global y coordinación visual entre categorías.

## Solución mínima y riesgos

Conservar PendingStockBanner y cálculos de dominio. Agregar componente global de microinsumos junto a ventas, reutilizando contrato preventivo y alertWeight (0.01 g). Un único detalle nativo accesible, contador exacto de ingredientes insuficientes; saldos desconocidos y familias no autorizadas comunicados aparte. Categorías en flujo normal, sin overlays. Alertas por orden y vista local existentes se conservan.

Lectura con revisión vinculada al estado, invalidación por sesión/perfil, abort y secuencia monotónica para respuestas atrasadas; reconsultar tras revisión, navegación, recarga del estado y foco. Error explícito sin fingir cero; no presentar revisión anterior como vigente. Mantener apertura y foco durante actualización. Sin nuevas tablas, endpoints, fórmulas ni cálculos de inventario.

Riesgos a probar: respuestas fuera de orden, revisión diferente, GET fallido, cambio de sesión, doble conteo por ingrediente/ventas, unidades mixtas, foco/contraste y desbordamiento a 390px. Verificación completa y revisión independiente con pruebas propias; máximo dos ciclos correctivos. No anticipar 39/40.

## Implementación realizada

AdminWorkspace coordina ambas categorías en un contenedor grid en flujo normal. PendingStockBanner y pendingStock permanecen sin modificaciones. GlobalMicroAlerts consulta el GET protegido existente y conserva únicamente la proyección preventiva: una región, un desplegable nativo, contador exacto de LOW y detalle por ingrediente. UNAVAILABLE y familias sin autorización se comunican separadamente; no se presenta una evaluación incompleta como suficiencia. Se usa alertWeight para conservar 0.01 g.

El efecto se reevalúa por objeto de estado, revisión, sección/pestaña, foco y restauración de sesión. AbortController y secuencia monotónica descartan respuestas tardías incluso si el transporte ignora abort. Una revisión diferente o error produce mensaje explícito sin mostrar detalle anterior como vigente. La key actor:role reinicia datos al cambiar de perfil. No existe persistencia local de avisos; recarga consulta la autoridad existente. MicroPreparations y avisos por orden quedan intactos.

El único cambio transversal adicional es onSessionRestored en session-api, emitido después de validar la sesión e instalar CSRF. Permite recuperar la consulta tras login válido del mismo actor/rol sin desmontar formularios.

## Revisión independiente y ciclos

Revisor separado iniciado sin historial de conversación, con acceso al diff, instrucciones y ficha. Sus scripts, acta, logs y capturas originales se conservan en el ZIP oficial.

- Ciclo 1: primera prueba E2E exigía :focus-visible tras modalidad de ratón. Se corrigió la prueba para entrar con Tab antes de comprobar foco; sin cambios de negocio.
- Ciclo 2: el revisor encontró P2 reproducible en Chrome: tras 401 y reautenticación mismo actor/rol la franja quedaba no disponible. Corregido con evento de restauración. Prueba propia Chrome sobre build corregido PASS: nuevo GET automático sin foco/navegación/refresh. Ocho grupos adversariales del efecto y prueba propia de eventos de sesión PASS.
- Sin otros P0-P2 funcionales identificados en esa revisión; el cierre global posterior queda bloqueado por los fallos detallados abajo. No se ejecutó tercer ciclo correctivo. Un verify inicial fue interrumpido al incorporar la corrección; no se presenta como aprobado. La ejecución final usa afinidad de dos CPU para controlar la concurrencia del host, sin modificar scripts del repositorio.

## Evidencia dirigida y límites

Dos pruebas unitarias nuevas PASS: ocho ingredientes compartidos entre dos fórmulas autorizadas producen una región y ocho detalles, sin mutación; igualdad con mínimo elimina la franja; centésimas, saldo desconocido y familias incompletas no simulan suficiencia.

E2E dirigido PASS: ocho micros, una venta de siete sacos, segunda venta de cuatro y dos frascos directos; tres pedidos y once sacos, frascos separados. Navegación/recarga, despliegues independientes, actualización con misma revisión, 503, revisión obsoleta, respuesta diferida después de compra y resolución de ambas categorías. Capturas inspeccionadas visualmente a 390/1440px en claro/oscuro; contraste calculado >=4.5, Tab/Enter y foco visible, sin desbordamiento global ni solapamiento.

Las ventas con cobertura comercial se verifican en fixture SQLite independiente interceptando solo GET /api/state del navegador. El servidor ordinario sigue con I14-I19 deshabilitados: no se habilitan reservas para hacer aparecer avisos. Las reposiciones micro usan comandos autorizados contra servidor y bases exclusivamente sintéticos. Regresiones NQP36/37 acreditan GET puro por rol, CSRF, permisos, cambios de fórmula, compras, correcciones y retornos.

La comprobación accesible incluye semántica de región/estado, aria-live, teclado, foco y contraste; no se certificó un lector de pantalla físico ni otros navegadores. No se modifican fórmulas, consumos, existencias, tablas, endpoints ni permisos. No se actualiza sidecar de diseño ni se anticipa NQP39/40.

## Entrega y gobernanza

El resumen público reside en app/docs/actualizacion-seguridad. Los cuatro archivos oficiales se centralizan fuera del código en las carpetas solicitadas: reporte/matriz en 03_REPORTES, ZIP en 04_EVIDENCIAS y orden/bitácora en 05_BITACORA. Matriz complementaria de 53 controles con referencias concretas; su conformidad técnica no sustituye revisión posterior de ChatGPT ni autorización humana expresa de integración.

No fusionar, no desplegar y no utilizar bases empresariales reales. Capturas, archivos de despliegue, credenciales y bases locales se excluyen de Git.

## Bloqueo del cierre global

La implementación NO queda aprobada ni lista para integración. Se respetó el máximo de dos ciclos automáticos; no se corrigen los bloqueos posteriores ni se alteran las referencias de regresión.

- npm run verify: FAIL en etapa test. 775 casos: 768 PASS, 1 FAIL, 6 TODO históricos I14-I19. tests/ui-regression.test.mjs detecta cambio HTML en ADMIN:dashboard; la referencia corporativa no contempla la nueva envoltura y franja global. No se actualiza automáticamente el baseline fuera del límite autorizado.
- npm run check, check:node y check:client ejecutados separadamente: PASS.
- npm run lint ejecutado separadamente: FAIL por una advertencia react-hooks/exhaustive-deps sobre sequence.current en cleanup de GlobalMicroAlerts.tsx, línea 55; política --max-warnings 0. Queda sin corregir por límite de ciclos.
- npm run format:check, build y check:distribution ejecutados separadamente: PASS. verify no acredita estas etapas porque se detuvo en test; se incluyen logs independientes de cada una.
- Primera corrida global E2E interrumpida: La prueba de autonomía ejecuta scripts/build-node.mjs, que resetea dist-node y genera únicamente backend, sin public-client. verify se detuvo antes de su build completo, por lo que aquella distribución no tenía frontend y no era válida para E2E. TEST_NETWORK_GUARD_ACTIVE es el marcador normal del fixture de bloqueo de red, no la causa del fallo. Se conserva la corrida como e2e-obsolete-distribution.log, sin atribuirla a defecto de interfaz. Después de reconstrucción limpia se ejecuta E2E global de cierre; resultado en sección final y e2e-final.log.

Con verificaciones fallidas, app/AGENTS.md prohíbe push. Se conserva commit únicamente local; no se publica rama, no se abre PR y no se ejecutan CI push/pull_request. Los controles A38-50/51/52/53 se entregan bloqueados/no ejecutados/parciales, sin presentarlos como conformes. La revisión técnica posterior de ChatGPT y la autorización humana de integración siguen pendientes. Continuar la corrección requeriría ampliar expresamente el límite de ciclos.

## Resultado final de las verificaciones

E2E global después de build completo limpio: 59/59 PASS, 0 FAIL, 0 SKIP, 0 TODO. Log original: e2e-final.log. Incluye el caso global NQP26-38, regresión NQP08, micros/preparaciones/compras/correcciones, roles, sesión, navegación, formularios y tablas.

Resumen: test/verify 775 casos con 768 PASS, 1 FAIL (referencia HTML), 6 TODO I14-I19; lint FAIL por una advertencia; los tres TypeScript, formato, build completo y distribución PASS. Distribución: 2126 archivos, 69 paquetes runtime, 0 privados y 0 paquetes retirados.

El revisor demostró adicionalmente, mediante proveedor de fuente en memoria y sin editar aplicación ni referencias, que las 66 referencias vuelven a coincidir al omitir exclusivamente la nueva franja y su envoltura. Esto delimita el desajuste al cambio visual previsto, pero NO convierte verify en aprobado. Acta y script reproducible en el ZIP.

Matriz de cierre: 49 controles con evidencia técnica, A38-50 y A38-51 BLOQUEADOS, A38-52 NO_EJECUTADO y A38-53 PARCIAL (cuatro archivos entregados; PR no abierto). Estado final: BLOQUEADO. Commit únicamente local; sin push, PR ni CI. Sin merge, despliegue ni bases empresariales reales. Se mantienen pendientes revisión ChatGPT y autorización humana de integración.
