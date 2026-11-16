# NQP26-38 · Alertas globales agrupadas y apilables

Fecha: 2026-11-16, America/Bogota. Estado del resumen versionado: CONFORME LOCAL, publicación/CI pendientes al emitir el commit. El PR y los cuatro entregables oficiales externos documentan el cierre remoto sobre el SHA final, sin cambiarlo después.

## Resultado y alcance

Ventas y microinsumos tienen franjas globales separadas, agrupadas y apiladas en flujo normal. Microinsumos muestra conteo exacto de ingredientes LOW y detalle por ingrediente con faltante de 0.01 g; saldos y familias no disponibles se comunican como evaluación incompleta, sin inventar suficiencia. Navegación, recarga y operaciones autorizadas recuperan datos vigentes; resolución elimina el aviso. Los desplegables son nativos y no hay cierre manual que oculte incidencias.

PendingStockBanner y pendingStock se conservan sin modificaciones. La venta usa cobertura neta validada, cuenta pedidos únicos y separa sacos por producir de frascos por abastecer, preservando presentación, prioridad y enlaces. Las ventas con cobertura se ensayan solo mediante fixtures SQLite independientes y GET interceptado del navegador; el servidor ordinario no activa I14–I19.

Los preventivos reutilizan la proyección de NQP36 y el GET protegido /api/micro-preparations, sin cálculo paralelo de inventario ni tablas/endpoints nuevos. Las alertas por orden continúan en su preparación. El estado global retiene únicamente la proyección preventiva, sin recetas privadas ni evaluaciones por orden; revisión, secuencia, active, abort, sesión y cleanup protegen contra datos obsoletos. onSessionRestored recupera lectura con el mismo actor/rol sin desmontar formularios.

## Base, diagnóstico previo y autorizaciones

Base origin/main: 6c75d44b66971bb38be36b420935aa9f93684fbb. PR50 MERGED comprobado vivo en GitHub, con ese merge y head 749d53bd225c94608779b6a550bdc844017c7653. Última revisión Codex del head: completed, sin hallazgos ni pendientes. Worktree independiente y checkout original preservados. AGENTS raíz/app, ficha oficial, ALERTA-01, R20/R51, tareas 08/36 y matriz complementaria de 53 leídas.

El diagnóstico anterior a la implementación se conserva en 62b5bcc y en el historial del ZIP: ventas ya era global y preventiva micro solo local. Tras dos ciclos ordinarios se detuvo sin publicar; el paquete condicionado no se trató como permiso y se respondió BLOQUEADO_AUTORIZACION. La autorización humana posterior permitió un tercer ciclo B1/B2. Sus correcciones preservaron byte por byte los 66 golden históricos y eliminaron la advertencia de lint sin desactivar reglas ni protecciones del efecto.

El ciclo3 dejó verify completo aprobado, pero E2E falló en L12 y su contenedor: 54/56 registrados PASS, L13–L15 no registrados al detenerse su flujo dependiente. La evidencia saneada documentó un GET global en vuelo cuyo 401 llegaba durante el intento de pulsar Actualizar datos tras revocación. La aplicación abría el login y la acción del test quedaba esperando un botón inerte. Se detuvo el ciclo y no se publicó; no se presentó un retry como verde. El estado de entrada 26a1c8e, el diagnóstico y los cuatro entregables bloqueados están preservados en el ZIP final.

Nueva instrucción humana: «Autorizo más ciclos, los necesarios para completar la tarea 38». Amplía los ciclos necesarios exclusivamente para cerrar NQP26-38 y reemplaza los límites anteriores. No autoriza merge, despliegue, bases empresariales reales o NQP39/40. La continuación se registró antes de la publicación y conserva los commits históricos.

## Reparaciones y capacidad de regresión

B1: el test corporativo aísla únicamente el segmento SSR exacto nuevo y su envoltura, exigiendo presencia única inmediatamente dentro de main. Los 66 hashes históricos permanecen intactos. Las pruebas negativas rechazan ausencia, duplicado y desplazamiento; el HTML adyacente no se borra ni se normaliza. Las pruebas específicas/E2E verifican la franja cargada, agrupación, semántica, precisión y resolución.

B2: cada ejecución del efecto posee secuencia propia y conserva active, AbortController, invalidación por sesión y desuscripción. Una respuesta de una ejecución anterior queda excluida por active=false; dentro de cada ejecución solo publica la última secuencia. El cleanup invalida y aborta. Sin eslint-disable, cambios a configuración ESLint o silenciamiento de warnings.

L12: la nueva reparación cambia únicamente pruebas. reachLoginAfterRevocation observa el login y, si continúa activo el espacio de trabajo, activa el refresco en una misma tarea del navegador; evita la carrera de la acción pendiente de Playwright. Rechaza falta de control, disabled o área inert y exige el diálogo y encabezado correctos. No oculta excepciones ni amplía timeouts.

Se añade comprobación backend 401 inmediatamente tras revocación. Se conservan íntegros rotación de cookie, rechazo CSRF 403, request_id del reintento, reautenticación, logout, 401 posterior y almacenamiento sin tokens. Un E2E determinista nuevo congela el GET global para comprobar ambos órdenes reales: detección proactiva primero y refresco primero. No se simula una autorización exitosa ni se modifica código de autenticación o de aplicación para aprobar el test. Pruebas focales L01–L15 y ambos órdenes: 17/17 PASS; lint focal cero advertencias.

## Verificación final nueva

- npm.cmd run verify completo: 776 casos, 770 PASS, 0 FAIL y 6 TODO históricos I14–I19. Tres TypeScript, lint global cero advertencias, formato, build y auditoría de distribución PASS.
- Distribución: 2126 archivos, 69 paquetes runtime, 0 privados y 0 paquetes retirados.
- npm.cmd run test:e2e sobre el build final: 60/60 PASS, 0 FAIL, 0 SKIP y 0 TODO. Ejecución nueva con L12 y L13–L15 aprobados; no se reutilizan los 59/59 ni los fallos del historial como aprobación del cierre.
- git diff --check, revisión del diff preparado y exclusiones de datos sensibles: PASS.

Las pruebas incluyen ocho micros bajos/una franja/ocho detalles; siete sacos exactos, segunda venta de cuatro y dos frascos separados; coexistencia, navegación, recarga, colapso independiente, enlaces a ventas, error de GET, revisión obsoleta, respuesta diferida y desaparición al resolver. Regresiones NQP08/36/37 y pruebas del resto del repositorio acreditan roles, CSRF, GET puro, compras, confirmaciones, correcciones, retornos y conservación de historial.

## Revisión independiente reproducible

Revisor nuevo sin historial de implementación, con pruebas propias fuente/Chrome y controles adversariales. Verifica secuencia/abort ignorado, revocación, restauración, revisión y cleanup; SSR con ocho detalles/centésimas, error/carga sin contenido viejo, resolución y familias incompletas; ventas netas y frascos separados. Controles negativos del helper rechazan botón inexistente/deshabilitado/inert, click que no abre login y encabezado incorrecto. También se inspecciona que L12 conserve todas sus aserciones de seguridad.

Chrome independiente usa distribución aislada de build estable y comprueba autenticación/revocación y ambos órdenes. Acta, scripts, logs, capturas y manifiesto están vinculados al SHA final exacto; no se presenta la suite global del autor como ensayo propio del revisor. Las copias incompletas iniciales del arnés se conservaron como fallos de infraestructura, no como defectos de aplicación ni resultados aprobados.

Dictamen final: sin hallazgos P0–P2 en el alcance examinado, con ensayos propios fuente, controles negativos y navegador real. El commit de código de cierre 70897fcb4c9de6710aaad1f5e035b2e9817eca2d se compara con el SHA final documental: sin modificaciones funcionales posteriores a las pruebas o la revisión. El commit final solo cierra este reporte; el cierre remoto se adjunta fuera del código y en el PR para conservar un único SHA final de CI.

## Evidencia, límites y gobernanza

Cuatro archivos oficiales: reporte/matriz en 03_REPORTES, ZIP con manifiesto SHA256 y CRC en 04_EVIDENCIAS y orden/bitácora en 05_BITACORA. La matriz de 53 controles identifica evidencias reales y explica la ampliación humana de ciclos para A38-51. El historial bloqueado se conserva separado y no se confunde con las ejecuciones finales. El ZIP excluye bases, credenciales y traces crudos que pudieran contener headers de sesiones sintéticas.

Sin cambios de fórmulas, consumos, existencias, costos, gastos, tablas, endpoints, permisos NQP37 o reservas I14–I19. Datos exclusivamente sintéticos externos al código. Sin sidecar de diseño ni NQP39/40. Accesibilidad: semántica, teclado/foco, contraste y cuatro vistas 390/1440 claro/oscuro; no se certifica lector de pantalla físico ni todos los navegadores.

Publicación autorizada únicamente tras puertas locales y revisión independientes aprobadas: push de la rama, PR en borrador y comprobación de CI push/pull_request sobre SHA final. No fusionar ni desplegar. La integración requiere revisión técnica posterior de ChatGPT y autorización humana expresa.
