# NQP26-38 · Alertas globales agrupadas y apilables

Fecha: 2026-11-16, America/Bogota. Estado final: BLOQUEADO por E2E global L12; verify completo aprobado. Tres ciclos consumidos, sin cuarto ciclo, push, PR ni CI. El reporte oficial externo vincula el SHA local final y las evidencias.

## Resultado

Ventas y microinsumos se presentan en franjas globales separadas, agrupadas y apiladas en flujo normal. Microinsumos muestra el número exacto de ingredientes LOW, detalle con faltante a 0.01 g y comunicación separada de saldo o familias no disponibles. Navegación, recarga y operaciones autorizadas reconsultan la fuente vigente; resolución elimina el aviso. No hay cierre manual que oculte incidencias pendientes.

PendingStockBanner y pendingStock permanecen sin modificar. Sus unidades, presentaciones, prioridades y enlaces a ventas se conservan; solo cuentan cobertura neta comercial validada. Las alertas preventivas reutilizan el GET /api/micro-preparations y la proyección NQP36, sin calcular inventario paralelo ni retener evaluaciones por orden o recetas privadas. Las alertas específicas de preparaciones permanecen locales.

## Puerta de entrada y autorización

Base origin/main: 6c75d44b66971bb38be36b420935aa9f93684fbb. PR50 MERGED comprobado en GitHub, con ese merge y head 749d53bd225c94608779b6a550bdc844017c7653. Última revisión Codex de ese head: completed, sin hallazgos ni pendientes; comprobación viva repetida durante ciclo3. Worktree separado y checkout original preservados.

Se leyeron AGENTS raíz/app, ficha oficial, ALERTA-01, R20/R51, tareas 08/36 y las matrices/órdenes. El diagnóstico anterior a la implementación está preservado en el commit 62b5bcc y en la entrega bloqueada original incluida en el ZIP actualizado.

Después de consumir dos ciclos ordinarios se detuvo la corrección y no se publicó el estado bloqueado. El ZIP de recuperación no se trató como autorización: se respondió BLOQUEADO_AUTORIZACION y no se modificaron archivos. Posteriormente el usuario autorizó expresamente: «AUTORIZO REALIZAR LAS TAREAS NECESARIAS PARA ARREGLAR». Esa instrucción se aplica a un tercer y último ciclo B1/B2, sus pruebas, revisión y publicación condicionada. No autoriza un cuarto ciclo, merge, despliegue o NQP39.

## Diagnóstico previo del ciclo extraordinario

Estado preservado: 62b5bcc90a5a71fcde8771f65c25905bf3ff2b7b; worktree limpio y base comprobada. Las pruebas focales reprodujeron antes de editar el fallo de referencia corporativa y la advertencia exhaustive-deps. Evidencias originales: diagnostic-html.log y diagnostic-lint.log, ambas etiquetadas como diagnóstico del estado de entrada, no como resultados finales.

El desajuste afectaba los 66 renders SSR por introducir la nueva franja y su envoltura. El contador de peticiones estaba en un ref compartido y su incremento en cleanup disparaba la heurística del linter. Se planificó aislamiento exacto del nuevo SSR y secuencia por ejecución del efecto, conservando el resto de las protecciones. Ese diagnóstico se escribió antes del cambio en el reporte del commit 6e2fcd9.

## Corrección única B1/B2

B1: el archivo ui-corporate.json y sus 66 hashes históricos se conservan byte por byte. El test elimina únicamente el segmento SSR exacto de carga de la franja nueva y su envoltura, después de exigir presencia única inmediatamente dentro de main. Ningún otro contenido se normaliza por esta corrección. Las aserciones nuevas rechazan ausencia, duplicación y desplazamiento de la franja; una modificación HTML adyacente permanece visible para el golden. Las pruebas específicas y E2E validan agrupación, semántica, precisión y resolución del aviso cargado.

B2: cada ejecución del efecto posee su contador de solicitudes y conserva active, AbortController, invalidación por sesión y limpieza de listeners. Una respuesta de una ejecución anterior queda excluida por active=false aunque su contador coincida con el de una ejecución nueva; dentro de cada ejecución solo publica la última secuencia. El cleanup invalida y aborta. No hay eslint-disable, cambios a configuración ESLint ni supresión de advertencias. onSessionRestored continúa recuperando la consulta con el mismo actor/rol sin desmontar formularios.

Los dos archivos funcionales de recuperación son GlobalMicroAlerts.tsx y tests/ui-regression.test.mjs. No hubo cambios de aplicación posteriores al commit de corrección 6e2fcd9a957a77c6ae355604bbb14ec1161ef15a; el siguiente commit solo cierra este reporte. La revisión independiente compara el código contra el SHA final exacto.

## Verificación real nueva

- Pruebas afectadas: 6/6 PASS; lint focal cero advertencias.
- Ensayos adversariales del efecto reutilizados contra fuente corregida: 8 grupos PASS; eventos de sesión PASS. Son repeticiones nuevas, no logs heredados.
- npm.cmd run verify completo: 776 casos, 770 PASS, 0 FAIL, 6 TODO históricos I14–I19. Tres TypeScript, lint global cero advertencias, formato, build completo y auditoría de distribución PASS. Distribución: 2126 archivos, 69 paquetes runtime, 0 privados y 0 paquetes retirados.
- npm.cmd run test:e2e sobre el build final: FAIL: 56 casos registrados, 54 PASS y 2 FAIL (L12 y su contenedor padre; un único escenario de fallo). L13–L15 no se registraron al detenerse su flujo dependiente; no se presentan como ejecutados ni como SKIP de Node. Log original nuevo: e2e-final.log. No se usa el 59/59 del estado anterior como aprobación del ciclo3.
- git diff --check y revisión de archivos preparados: PASS; sin bases, credenciales, capturas ni archivos de despliegue en Git.

La suite global incluye ocho micros insuficientes, coexistencia con ventas de 7 + 4 sacos y 2 frascos separados, navegación, recarga, colapso independiente, errores de lectura, revisión obsoleta, respuesta tardía tras reposición y desaparición de categorías al resolverlas. Las compras/confirmaciones/correcciones, roles, CSRF y lectura sin mutación se cubren con las regresiones NQP08/36/37 y demás pruebas del repositorio. Las ventas comerciales con cobertura se prueban solo con fixtures SQLite independientes y transporte GET interceptado; el servidor ordinario no activa I14–I19.

## Revisión independiente reproducible

Revisor nuevo iniciado sin historial de conversación de implementación. Sus ensayos propios transpilan el efecto real con promesas que ignoran abort y prueban cambio de revisión/contexto, sesión, restauración, errores, cleanup y remount tipo StrictMode. Prueba propia de session-api valida notificación solo después de autenticación válida y desuscripción efectiva.

El test corporativo real pasa los 66 escenarios; el fixture original conserva SHA256 62e3f0c2842a1eeaff307e250bb5edbc91f5a6a1d445ada87a3a38da7e8a855e. Cuatro mutaciones del fuente AdminWorkspace en memoria —quitar, duplicar, mover la franja e insertar HTML colateral— son rechazadas. No se modificaron aplicación ni referencias para esas pruebas.

Chrome independiente sobre copia del build corregido index-CWsPl2Ci.js: una franja, ocho detalles, 0.01 g, teclado, 390 px sin overflow, 401 → login UI mismo actor/rol → nuevo GET y conteo restituido, navegación, recarga y resolución sin avisos obsoletos; cero errores de página. Un timeout inicial del script externo al buscar navegación con menú móvil cerrado se conserva como fallo del arnés; la prueba completa posterior usa 1440 px para navegar y no cambió aplicación ni distribución.

Dictamen de los ensayos propios de código: sin hallazgos P0–P2 en los recorridos examinados. Dictamen GLOBAL posterior: BLOQUEADO por L12 de la suite global. Los PASS propios son evidencia parcial y no autorizan publicación. Scripts, logs, capturas saneadas, hashes y acta vinculados al SHA local final; la suite global del autor no se atribuye a ensayos propios del revisor.

## Historial, alcance y límites

El estado inicial tuvo verify 768 PASS/1 FAIL/6 TODO y lint con una advertencia; no se presenta como verde. Su E2E limpio anterior fue 59/59. Una corrida anterior sin frontend no es defecto de interfaz: la prueba Node de autonomía recompila solo backend y verify fallido no alcanzó a reponer public-client. El marcador TEST_NETWORK_GUARD_ACTIVE era normal. Todo ese historial se preserva como entrega bloqueada, separado de logs nuevos.

No se cambian fórmulas, consumos, existencias, costos, gastos, tablas, endpoints, permisos NQP37 ni reservas I14–I19; tampoco sidecar de diseño o NQP39/40. Datos exclusivamente sintéticos y externos al código. Accesibilidad comprobada mediante semántica, teclado/foco, contraste y cuatro vistas 390/1440 claro/oscuro; no se certificó lector físico ni todos los navegadores.

Tres ciclos totales: dos ordinarios y un extraordinario autorizado. Sin cuarto ciclo. Los cuatro entregables oficiales se centralizan en 03_REPORTES (reporte/matriz de 53), 04_EVIDENCIAS (ZIP con manifiesto SHA256) y 05_BITACORA (orden/bitácora); el ZIP también incluye los 14 controles de recuperación. La matriz explica la excepción humana del tercer ciclo. La publicación solo se permite tras puertas locales y revisión independientes aprobadas; las dos CI deben comprobarse sobre el SHA final. No fusionar ni desplegar. La integración requiere revisión técnica posterior de ChatGPT y autorización humana expresa.

## Bloqueo de E2E global después del tercer ciclo

L12 revoca sesiones mediante API y exige pulsar «Actualizar datos» antes de esperar el login. Una lectura global de microinsumos en vuelo recibe 401 durante la localización/acción del botón, abre correctamente la autenticación y vuelve inaccesible ese botón. La prueba termina por timeout de 20 s. La captura muestra «La sesión terminó»; pageErrors y requestFailures están vacíos.

El revisor inspeccionó un trace filtrado: CUSTOMER_SAVE 200 inicio 40054.387 ms, duración 43.933 ms; GET micro-preparations 401 inicio 40109.337 ms, duración 17.457 ms; click de actualización inicio 40121.597 ms, timeout 60135.105 ms. El GET precede al click y el 401 termina unos 5 ms después de empezar la acción: evidencia una carrera durante el intento, no demuestra que el login estuviera abierto antes de iniciar el click. Se respalda una incompatibilidad de sincronización del test con la detección proactiva; no se demuestra por sí sola un defecto funcional de sesión.

No se corrige ni relaja el E2E después de este resultado: el tercer y último ciclo estaba autorizado con detención si persistían errores. No se ejecutó un cuarto ciclo. Se conservan resultados originales y evidencia saneada; se excluye trace.zip crudo porque puede contener credenciales/headers de sesiones sintéticas. No se reemplaza esta corrida fallida por un retry para aparentar verde.

La prueba corporativa y lint de entrada sí quedaron corregidos y verify pasó completo. La publicación sigue prohibida por app/AGENTS.md con E2E fallido; se conserva la rama y commit local, sin push ni PR. Ambas CI permanecen NO_EJECUTADO, no pendientes de un lanzamiento automático. Matriz oficial: A38-50/51 BLOQUEADO, A38-52 NO_EJECUTADO y A38-53 PARCIAL; 49 controles con evidencia técnica limitada. La recuperación R38-C3-09/10 queda bloqueada y R38-C3-12 sin ejecutar; B1/B2 y verify acreditados. Hace falta una nueva decisión humana antes de modificar aplicación o pruebas de regresión.
