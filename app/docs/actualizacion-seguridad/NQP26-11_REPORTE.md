# NQP26-11 · Inventario exhaustivo de tablas de NutrequinePro

2026-10-30 America/Bogota; calendario operativo del producto America/Lima. Alcance documental de UX-01, fase 5 P2, previo a la implementación NQP26-12. El inventario corresponde a tablas de visualización de la aplicación y documentos, según la ficha oficial; no a tablas SQL.

## Resultado

Inventario estático exhaustivo contrastado contra el grafo de fuentes, navegación y revisión independiente: **51 superficies, 268 columnas**, cada una con 24 campos de trazabilidad en [NQP26-11_INVENTARIO_TABLAS.csv](NQP26-11_INVENTARIO_TABLAS.csv). No se implementó ordenamiento ni se modificaron UI, runtime, negocio, comandos, APIs, SQLite, permisos, baseline, lockfile o reservas empresariales.

| Clasificación                                | Superficies | Columnas |
| -------------------------------------------- | ----------- | -------- |
| Aplicación interactiva (incluye formularios) | 29          | 172      |
| Aplicación solo lectura                      | 14          | 61       |
| Exportación/documento PDF                    | 8           | 35       |
| Total                                        | 51          | 268      |

**208 columnas SI** propuestas para 12. **60 NO** justificadas: 35 PDF, 13 controles de captura, 7 acciones y 5 valores heterogéneos/JSON de auditoría. Son 42 superficies UI con al menos una columna elegible, una superficie UI enteramente de controles (FORMULA-EDITOR, tres columnas NO) y ocho documentos excluidos del orden interactivo. Las listas/tarjetas sin cabecera están enumeradas aparte y no inflan el total de tablas.

Familias repetidas por fórmula, snapshot de producto, devolución o rectificación se identifican por contexto estructural y clave, sin contar IDs privados de cada empresa. Los consumidores distintos se separan: siete SaleTable, tres ProductionList, dos History y dos PaymentForm. Crear/editar sin cambio estructural del mismo formulario comparte familia; no se promete una tabla por cada registro empresarial.

## Base y lecturas

Se leyeron revisión técnica 10, ficha `Kit/02_TAREAS/NQP26-11.md`, UX-01 C.1–C.4 y fuente operativa B, plan maestro de 41 tareas, AGENTS raíz/app, matriz inicial 28 PENDIENTE, plantilla, mapa semilla, diagrama y orden de ejecución del paquete. Los adjuntos se trataron como especificación del encargo, contrastada con la petición; no autorizan ampliar alcance, fusionar o desplegar.

`git fetch origin` y consulta viva del PR #22 confirmaron que ya estaba fusionado, a diferencia de la revisión adjunta. Base exacta de `origin/main`: **`e66f4deefd75ad938ba6b6acabe3de46ed0ddc3e`** (merge de #22); head 10 `7120e3a3127995cf0d86017af8227e0e7d8c6a1b`. El conector no devolvió workflow runs para el SHA merge base; no se le atribuye una CI inexistente. Contrato/matriz de invariantes NQP26-01 presentes en la base; seis TODO futuros I14–I19 permanecen intactos.

Worktree independiente `C:/Users/vicve/Documents/ChatGPT/NQP26-11-inventario`, rama `codex/nqp26-11-inventario-tablas`, creada desde origin/main. La herramienta administrada rechazó dos intentos por referencia; se completó mediante `git worktree add`. Checkout original y sus cambios ajenos preservados. Se volvió a contrastar `ls-remote main` antes de entrega; no se apiló sobre rama sin fusionar.

## Cobertura verificable

[BUSQUEDAS](NQP26-11_BUSQUEDAS.md) registra siete enfoques: consumidores JSX, HTML directo, roles table/grid, generación dinámica, reportes/impresión, consumidores indirectos y barrido global de fuentes. Resultado: 33 declaraciones JSX en 21 archivos, un wrapper HTML y ocho llamadas PDF. No se encontraron roles table/grid ni generadores alternativos de DOM tabular. El barrido global concilia alias y método de layout como generadores, no como instancias adicionales.

El parser TypeScript temporal extrajo cabeceras y celdas; la lectura manual expandió dos celdas dinámicas de ReconcileForm y siguió callbacks/pestañas/modales. La [conciliación](NQP26-11_RECONCILIACION_FUENTES.md) asigna cada declaración a todos sus contextos de inventario. [Navegación y contrato](NQP26-11_NAVEGACION_Y_CONTRATO.md) y [exclusiones](NQP26-11_EXCLUSIONES.md) cubren listas, roles, módulos sin tabla, SQL, helpers y documentos. No se inventan superficies de compras, preparaciones o microinsumos de tareas futuras.

Cada fila CSV contiene ID estable, área, ruta/contexto, clase, archivo/línea, roles, proveedor, filtros efectivos, paginación, orden actual, etiqueta exacta, valor bruto/cálculo, tipo, unidad, elegibilidad, comparador propuesto, nulos/desempates, exclusión, prueba sugerida, evidencia de celda y estado de verificación. El método Table/DOM/documento consta en BUSQUEDAS y conciliación: UI usa Table→DOM; PDF usa reports.table→ReportLayout. Los 24 campos de la plantilla se conservan sin añadir columnas supuestas.

## Precisiones para NQP26-12

- Estado completo local autorizado; **no existe paginación de registros**. Dashboard recorta últimas cinco ventas, no página 1 del historial. PDF sí pagina físicamente A4, sin recortar la consulta.
- Los filtros visibles no siempre se aplican: el CSV distingue cada consumidor. Balance mensual y fórmulas conservan su alcance global; estado no filtra pagos, devoluciones, rectificaciones o insumos.
- Los tres roles leen configuración/usuarios/auditoría. Controles y comandos de escritura conservan permisos; no inferir lectura ADMIN por botón Editar.
- Comparar dinero en centavos y masa en gramos; captura de formularios puede estar en soles/kg y strings parciales. Cantidades BAG/BOTTLE/UNIT no son magnitudes intercambiables; núcleos admiten centésimas. No hay columna real de porcentaje observada.
- Distinguir fecha civil, mes e instante UTC. PDF de movimientos cliente mezcla tipos por familia; permanece fuera de orden interactivo.
- Nulos al final en ambas direcciones, cero/false válidos, claves estables concretas por familia. Secuencias de estados y compuestos están propuestas explícitamente para aprobación/implementación en 12.
- Preservar cola por entrega/creación/ID, orden de cálculo y snapshots. Rectificación de producción usa `a.products[i]`: no reordenar una mitad y perder correspondencia. Las reservas empresariales no se activan para demostrar cobertura.

## Revisión y verificaciones

[Revisión independiente](NQP26-11_REVISION_INDEPENDIENTE.md): agente separado inspeccionó fuentes y CSV. Confirmó 33/33 cabeceras JSX, 51 familias, 268 columnas, índices y rutas existentes. Cinco P2 documentales sobre filtros, relación de sedes, desempates, tipos de captura y etiqueta de contexto legacy fueron corregidos y revisados de nuevo. **Sin P0–P2 pendientes de exhaustividad o alcance.** No se presenta como aprobación formal GitHub ni como ejecución independiente de las suites.

Instalación local `npm.cmd ci --ignore-scripts`: salida 0, 400 paquetes. Node v24.18.0. `verify-01` se detuvo en tests: 386 totales, 378 aprobadas, 2 fallos Windows al Set/GetAccessControl de directorios sintéticos temporales, 6 TODO. Se repitió la suite sin cambiar código ni pruebas, usando TEMP/TMP exclusivos externos. No se oculta el intento fallido.

`verify-02`, salida **0**: 386 totales, **380 aprobadas, cero fallos, seis TODO**, tres TypeScript, lint sin advertencias, format:check, build completo y check:distribution. Distribución: 2080 archivos, 69 paquetes runtime, cero archivos privados y cero paquetes retirados. Los seis TODO no cuentan entre aprobadas. Las repeticiones y verificaciones estáticas no se suman a los 380.

E2E y recorrido Chrome complementario se registran en [EVIDENCIA_VALIDACION](NQP26-11_EVIDENCIA_VALIDACION.md), junto con límites de montaje por estado/rol. La matriz distingue exhaustividad estática contrastada de recorrido visual parcial. No se afirma que cada familia histórica/condición vacía se haya montado visualmente para cada rol.

## Archivos y entrega

Únicamente documentación pública de la tarea en `app/docs/actualizacion-seguridad/`:

1. `NQP26-11_DIAGNOSTICO.md`
2. `NQP26-11_INVENTARIO_TABLAS.csv`
3. `NQP26-11_EXCLUSIONES.md`
4. `NQP26-11_RECONCILIACION_FUENTES.md`
5. `NQP26-11_BUSQUEDAS.md`
6. `NQP26-11_NAVEGACION_Y_CONTRATO.md`
7. `NQP26-11_REVISION_INDEPENDIENTE.md`
8. `NQP26-11_EVIDENCIA_VALIDACION.md`
9. `NQP26-11_MATRIZ_ACEPTACION.csv`
10. `NQP26-11_REPORTE.md`

Copias de entrega en `C:/Users/vicve/Documents/ChatGPT/NQP26-11-entrega/03_REPORTES/`, evidencias sintéticas externas en `04_EVIDENCIAS/` y bitácora `05_BITACORA/REGISTRO_TAREAS.csv`. No versionar capturas, bases, credenciales sintéticas, logs completos ni scripts temporales de autoría. El SHA documental funcional y el SHA final se registran en la bitácora externa y el cuerpo del PR para evitar autorreferencia del commit. PR independiente en borrador hacia main, sin fusión ni despliegue; estado vivo y CI del head final se cotejan al entregar. La aceptación de NQP26-12 sigue pendiente y exige implementar/probar el contrato propuesto.
