# NQP26-10 · Destino de venta y vínculo optativo

2026-10-30, America/Bogota. Implementación con datos sintéticos en rama codex/nqp26-10-sede-optativa y worktree independiente. Base origin/main a28daf025df139c881f784da363507baaf4e7b69. GitHub confirmó #21 y #20 fusionados antes de iniciar; no se creó una rama apilada. El checkout original y sus cambios previos permanecen intactos. Sin merge, despliegue ni uso de datos empresariales.

## Comportamiento y contrato

SALE_SAVE conserva siempre site_id, pero ya no añade customerSites automáticamente. Un cliente antiguo que omite el nuevo campo usa ONE_TIME y no crea ni reactiva relaciones. La asociación requiere site_link_mode: LINK, confirm_site_link: true y confirm: true. Se rechazan tipos/valores inválidos y contradicciones; confirm, deliver y create_production, si están presentes, deben ser booleanos reales. confirm_site_link no es una credencial: expresa intención y el servidor conserva autoridad sobre roles, existencia y actividad de las entidades. Cliente retirado/inactivo y sede inactiva se rechazan.

ADMIN y OPERATOR pueden vincular al confirmar una venta, coherentemente con su permiso vigente CUSTOMER_SITES_SAVE; VIEWER sigue bloqueado, incluso antes del replay. No se amplían permisos de maestros. El validador específico está en features/ventas/domain/site-link.mjs, pues master-command-contracts.mjs no aplica a SALE_SAVE. No se añaden endpoints, tablas o migraciones.

El helper idempotente reutiliza el vínculo inactivo y conserva su id/is_default. Una asociación nueva nunca se convierte en principal; no se modifican otras sedes ni la ficha de cliente. La venta, vínculo, pagos, movimientos y auditoría pasan por el mismo estado clonado, revisión optimista y batch SQLite. Un fallo de dominio o SQL revierte todo. Dos operadores pueden recibir conflicto de revisión: deben recargar/reintentar; no hay reintentos automáticos que escondan cambios de maestros. T03 conserva igualdad canónica por actor/request_id y 409 ante cuerpo distinto.

Los borradores guardan el destino con ONE_TIME y no conservan intención de vínculo. LINK se rechaza si confirm no es exactamente true. Al abrir para confirmar el borrador, se evalúa la relación vigente y se solicita la aceptación de nuevo. La edición/rectificación de históricos no cambia destinos.

## Interfaz

Sugerencia de principal existente solo si sigue habilitada. Selector nativo agrupado en Sedes del cliente/Otras sedes, orden español natural dentro de cada grupo. Aviso bajo Sede destino con nombres del cliente y sede; Solo esta venta predeterminado, alternativa Vincular sede y casilla explícita sin premarcar. Guardar se bloquea hasta aceptar. Cambiar cliente/sede invalida aceptación, incluso si luego se vuelve al original. Un cambio observado en la relación/actividad también la invalida. La selección no genera comandos.

SITE_SAVE sigue creando únicamente la ficha. Tras el alta rápida se selecciona la nueva sede y aparece el mismo aviso. Se conservan el alta rápida de cliente y las advertencias de homónimos de NQP26-09. Los borradores explican que el vínculo se elige al confirmar, sin controles que prometan asociar durante guardado temporal.

Labels, fieldset/legend, radios nativos, checkbox, aria-describedby y status en el aviso. Tokens y patrones existentes en claro/oscuro, sin modal adicional. El aviso se recorre dentro del scroll del formulario en móvil; las cuatro vistas y foco se verifican con Chrome automatizado, sin afirmar prueba con lector de pantalla o equipo físico.

## Evidencia y validación

Pruebas nuevas: tests/sale-site-link.test.mjs (memoria/SQLite, históricos, rollback y carrera de revisión), tests/sale-site-link-http.test.mjs (dos servidores/usuarios, flags, permisos y T03), tests/sale-site-ui.test.mjs (SSR) y tests/local-e2e/sale-site-link.test.mjs (flujo ordinario y cuatro vistas).

La prueba aislada de composición con partialReservations existe solo en fixture de pruebas. No se habilita en la aplicación empresarial ni se modifica el motor de cobertura, costos, stock o pagos para acomodar el flujo.

Primeras dirigidas: 8 aprobadas/1 fallo solo por limpieza con segunda conexión abierta; corregido orden de cierre. Dirigidas HTTP+dominio: 10/10 aprobadas. Tras reforzar carrera de sede y rollback con pago/stock, dominio+SSR: 10/10 aprobadas (no se suman a suite general). Revisión independiente inicial ejecutó HTTP+dominio 10/10, sin P0–P2.

Verify-01: 378 aprobadas, 1 fallo de huella modal:sale, seis TODO. Todas las huellas y HTML antes/después fueron comparados: solo cambia el selector de sedes por optgroup y orden nominal. Se actualizó únicamente modal:sale de a4788f41732ba4d66d5e2d82d2b70fceb3f43f242f3666fd36e58c670396b756 a 2db40ad1e422b0d7bba80788b7bdd0164b726fce83efedaa4907f45159061f06. No se aumentan timeouts ni se cambian fixtures de negocio.

Una compilación auxiliar se solapó con el build de la prueba node-backend y falló ENOENT al copiar dist-node. No se atribuye ese fallo al contrato de venta; siguientes builds se ejecutan secuencialmente. UI-01 Chrome en desarrollo: 1/1 aprobada; al inspeccionar capturas se corrigió el tamaño de radios heredado del input global. UI-02 repite comprobación visual. Resultados finales verify/E2E/CI y SHAs se registrarán al completar, sin atribuir ejecuciones a otro SHA.

Informes completos y matriz con referencias en 03_REPORTES; logs, capturas sintéticas y bitácora en 04_EVIDENCIAS locales, excluidos de Git. Solo este resumen seguro, diagnóstico y código/pruebas sintéticas se versionan en app; la matriz final permanece en 03_REPORTES. Mantener seis TODO I14–I19 y dependencias de fases posteriores. La matriz distingue controles técnicos de aceptación empresarial.

## Validación local final de compilación

Verify-02: salida 0; 386 casos totales, 380 aprobados, seis TODO I14–I19, cero fallos/omitidos/cancelados. Los 11 controles nuevos de dominio/HTTP/SSR forman parte de ese total, no se suman las repeticiones dirigidas. Pasaron check/check:node/check:client, lint sin advertencias, format:check, build y check:distribution. Distribución: 2080 archivos, 69 paquetes runtime, cero archivos privados y cero paquetes retirados. El build final incorpora el tamaño corregido de radios.

UI-02 Chrome desarrollo: 1/1 aprobada, sin errores de consola. Capturas 1440/390 claro/oscuro revisadas por agente principal y revisor independiente; radios corregidos y confirmación legible. Se amplía la captura de la prueba final para mostrar aviso y controles juntos en móvil y comprobar sus límites frente al pie del formulario. Las capturas y logs siguen fuera de Git. Revisión independiente final del delta: sin P0–P2; ejecutó 10/10 dominio+SSR, sin sumar pruebas solapadas.

## Regresión E2E y revisión final

E2E-01 completo sobre build final, Chrome: salida 0, 35/35 aprobadas, cero fallos/omitidas/canceladas/TODO. Incluye homónimos/alta rápida 09, destinos 10, fechas/borradores/reinicio, entregas legacy, lotes, sacos/frascos, pagos/contabilidad estimada, producción, exportación, integración A/B y reservas empresariales apagadas. La prueba D10 final comprueba aviso y confirmación dentro de los límites visibles frente al pie y captura las cuatro vistas. Principal y revisor independiente inspeccionaron las cuatro capturas finales: aviso nominal completo, opciones y confirmación legibles juntos también a 390 px. Sin P0–P2 pendientes.

La matriz completa y evidencias finales permanecen fuera de Git en 03_REPORTES/04_EVIDENCIAS. El PR borrador y los SHA funcional/final se registran al publicar. La CI del SHA final se cotejará en GitHub y se dejará en el PR y la bitácora local; no se atribuye por anticipado. Este cierre técnico no implica aceptación empresarial ni activación de fases futuras.
