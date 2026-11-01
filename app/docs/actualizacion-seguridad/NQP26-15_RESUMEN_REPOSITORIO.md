# NQP26-15 · Catálogo de productos en Inventario

La gestión del catálogo se encuentra en Inventario → Productos, después de Stock actual y Movimientos. La misma colección `state.products` y el editor existente conservan IDs, imágenes, precio base, presentaciones y estados. ADMIN dispone de Nuevo producto y Editar; OPERATOR y VIEWER consultan. La autorización y las validaciones siguen en `PRODUCT_SAVE`, sin cambios en servidor, esquema o reglas de negocio.

Los enlaces `#products` y `#config/products` renderizan la vista nueva y sustituyen la entrada de historial con `#inventory/products`, sin añadir un paso al volver atrás. Configuración conserva Empresa y valores, Usuarios, Auditoría y Apariencia. La tabla mantiene sus comparadores tipados y añade modalidad de ingreso e imagen vigente; imagen y acciones no son ordenables. El inventario histórico de tablas NQP26-11 permanece intacto; la prueba de cobertura aplica explícitamente la nueva ubicación y las dos columnas.

Base confirmada en GitHub: PR #26 fusionado, `origin/main` en `b93fc24d0c362ebeb2e487aa3f488450c3008ba0`. Worktree independiente y rama `codex/nqp26-15-trasladar-catalogo-productos`; checkout original preservado.

Pruebas específicas: navegación canónica/legacy/recarga/atrás, alta BOTTLE y UNIT, edición con desactivación, precio histórico intacto, imágenes, errores HTTP 422 sin escritura y permisos HTTP 403 para ambos lectores; orden inicial/ascendente/descendente por teclado y cuatro capturas de catálogo 1440/390 claro/oscuro. Se mantienen las seis TODO I14–I19. Los 12 deltas del golden corresponden exclusivamente a inventario, configuración y enlaces antiguos; 54 escenarios conservan su hash.

Los resultados finales de verify, E2E, revisión independiente y CI se consignan en el PR y en los cuatro entregables compactos oficiales bajo `Actualizacion_2026-10-24_Codex`: REPORTE.md y MATRIZ.csv en 03_REPORTES/NQP26-15, EVIDENCIAS.zip en 04_EVIDENCIAS/NQP26-15 y ORDEN_CODEX.md en 05_BITACORA/NQP26-15. La evidencia extensa queda dentro del ZIP. SSR valida presentación; Chrome usa datos sintéticos y viewports emulados. No equivale a auditoría WCAG completa, aprobación empresarial ni revisión formal de GitHub.

Entrega pendiente de revisión técnica posterior de ChatGPT. PR en borrador: sin fusión, despliegue, datos empresariales reales ni activación de reservas.
