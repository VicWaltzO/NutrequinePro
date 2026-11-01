# NQP26-16 · Selector del balance mensual

Base: `origin/main` `9bcd306e15301a4791754fdead3afaf53a28e265`.
Al comenzar, el PR #27 ya estaba fusionado; se verificó el cambio respecto del
paquete de referencia y se utilizó un worktree independiente.

El control existente `type="month"` se conserva. Chrome con locale `es-PE`
muestra «Octubre de 2026» y abre el selector visual con clic y toque emulado.
La nueva prueba recorre mes y año con PageUp/PageDown y flechas, sin escribir
YYYY-MM, en 1440×1000 y 390×844. Comprueba octubre, vacío, errores/reintento,
teclado, temas, nombre accesible, filtros independientes y lecturas sin efectos.
Se distingue móvil emulado de dispositivo físico y árbol accesible de una
auditoría completa con lector de pantalla. Los clics internos del popup nativo
no son accesibles por el DOM de Playwright; la prueba combina apertura por
clic/toque y navegación del popup por teclado.

La prueba inicial detectó pérdida de foco después de descargar el balance:
el estado ocupado deshabilitaba el botón. Se restaura el foco únicamente si
la descarga de balance comenzó con ese botón enfocado y el usuario no se
movió a otro control. No se cambia el selector, endpoint, modelo, renderizador,
periodo, cálculos ni nombre del PDF. Los demás documentos conservan su conducta.

La prueba de rangos cubre octubre de 2026, 1900/2000/2100, bisiestos, enero,
diciembre y entradas inválidas. El E2E documental existente conserva la
comprobación de roles, revocación, descargas e igualdad completa del estado.

Entrega local compacta: `03_REPORTES/NQP26-16/{REPORTE.md,MATRIZ.csv}`,
`04_EVIDENCIAS/NQP26-16/EVIDENCIAS.zip` y
`05_BITACORA/NQP26-16/ORDEN_CODEX.md`, bajo la raíz oficial
`Actualizacion_2026-10-24_Codex`. Los logs completos, capturas sintéticas,
comparación PDF y revisión independiente se conservan allí, fuera del commit.

Validación final y revisión independiente: consultar los cuatro entregables.
Preparado para revisión técnica posterior de ChatGPT; sin integración,
despliegue, datos empresariales reales ni activación de reservas.
