# NQP26-14 · Orden natural de selectores nominales

La presentación de los catálogos dependía del orden recibido desde el proveedor. Ahora los 41 contextos nominales y los dos contextos de sedes agrupadas usan orden natural español por etiqueta visible. Las veinte secuencias de negocio y el mes conservan su orden lógico.

La utilidad pura `shared/lib/nominal-order.mjs` usa `Intl.Collator("es-PE", { sensitivity: "base", numeric: true })`, copia las opciones y desempata por etiqueta normalizada, ID y posición fuente. `Select` requiere `order="nominal"`; su política predeterminada sigue siendo `preserve`. Los strings se comparan traducidos mediante `label`, los objetos por `name`. Los placeholders quedan fuera del catálogo y `OTHER` al final solo en métodos de pago/conceptos previstos.

Las proyecciones especiales mantienen grupos de sedes y principal, índices `new:index`, defaults de producto/ingrediente de fórmula, filtros, IDs y valores enviados. Las fórmulas añaden nombre accesible `Insumo N` por fila. No se cambian APIs, persistencia, reglas de negocio, históricos ni reservas.

Pruebas incorporadas: núcleo/Select, integración de los 64 IDs y barrido AST de las 31 declaraciones consumidoras, más dos recorridos Chrome con SQLite sintético, teclado, 1440/390, temas, ADMIN/OPERATOR/VIEWER, alta rápida, cambio de catálogo, new:index y payload persistido. SSR usa hooks inertes y estados de interfaz preparados en memoria: no se atribuyen a SSR permisos ni interacción. Los 66 escenarios de referencia se cotejaron antes de actualizar veinte hashes: solo permutaciones de opciones y etiqueta accesible de ingrediente, sin debilitar la comprobación permanente.

Los resultados reales finales, matrices, revisión independiente y evidencias se centralizan en la carpeta oficial del usuario `Actualizacion_2026-10-24_Codex`, bajo `03_REPORTES`, `04_EVIDENCIAS` y `05_BITACORA`. Las suites finales y CI se registran allí y en la descripción del PR; no se presentan como resultados nuevos los contadores de NQP26-13.

La revisión independiente detectó dos carencias de cobertura, corregidas mediante montaje de contenedores y recorridos por roles/cambio de producto/negativos. Su informe distingue lo ejecutado de la inspección estática y del límite visual. Accesibilidad básica no equivale a auditoría WCAG completa, dispositivo físico o lector de pantalla.

Entrega para revisión técnica posterior de ChatGPT. PR en borrador hacia main tras comprobar PR25 fusionado y base `46bf47e92c9d89539073b5112b0bb0acc4817432`; sin fusión, despliegue, datos empresariales ni aprobación automática.

La regresión completa detectó además una fecha fija de prueba vencida: el filtro de actividad esperaba vacío desde 2026-11-01 aunque las rectificaciones sintéticas usan el reloj del servidor. El fixture ahora elige el día posterior a todas las fechas de actividad, según la zona horaria configurada, conservando las mismas aserciones y sin cambiar filtros ni código de aplicación.

La prueba corporativa conservó su gesto CDP y aserción de cierre, añadiendo una espera al foco y fin de transición del panel y un hit-test del punto inicial. Esto hace explícita la precondición del gesto, sin alterar Sidebar ni aumentar timeouts; el fallo intermitente anterior y sus límites causales se conservan en la bitácora.
