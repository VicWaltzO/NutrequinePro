# NQP26-17 · Papelera roja en Clientes

Base comprobada en GitHub: PR #28 fusionado y `origin/main`
`87008eb8736a74211f5efefd0d798981460a9264`. Trabajo en worktree independiente.

Se sustituye exclusivamente el disparador textual de baja de Clientes por
`Trash2` de Lucide, rojo con el token `--danger`. Botón nativo con nombre
accesible contextual, tooltip y SVG oculto al árbol accesible. Reutiliza los
objetivos 40px escritorio / 44px móvil y el foco del sistema. Hover específico
con `--danger-soft`, sin cambiar los demás iconos ni la tabla de Sedes.

Se conservan `write`, `open("customer-delete", x)`, modal, payload, autorización
ADMIN/OPERATOR, rechazo VIEWER y baja lógica. No hay cambios en servidor,
SQLite, migraciones, historial, reservas ni reglas de negocio.

La regresión específica usa clientes sintéticos con y sin historial. Comprueba
nombre, SVG, color y contraste computados, foco y tamaño, Tab/Enter/Espacio,
cancelación/Escape sin escritura, confirmación con ID original, persistencia y
conservación de entidades comerciales, saldos y auditoría previa. Incluye roles
por interfaz y HTTP. Capturas a 1440×1000 y 390×844, light/dark y toque emulado.
No equivale a dispositivo físico ni auditoría integral con lector de pantalla.

Se revisaron individualmente las referencias SSR ADMIN:customers y
OPERATOR:customers contra origin/main: al revertir solo el disparador nuevo en
el HTML, el resto es idéntico. Solo esas dos huellas se actualizan; VIEWER,
Sedes, modales y los demás escenarios conservan sus referencias.

Resultados completos, intentos, revisión independiente, SHA final y CI se
registran en los cuatro entregables locales prefijados NQP26-17, bajo
`Actualizacion_2026-10-24_Codex` en 03_REPORTES, 04_EVIDENCIAS y 05_BITACORA.
Logs y capturas sintéticas quedan fuera de Git. PR en borrador; sin fusión ni
despliegue y sin datos empresariales reales.
