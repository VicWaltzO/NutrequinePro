# NQP26-09 · Diagnóstico previo

2026-10-29, America/Bogota. Base independiente origin/main fabe5c93e4f15899586f8db30a60939c8c95635a. PR18/19 ya fusionados por acciones previas; el ajuste 08 se prepara aparte y no se incorpora a 09. Sin fusión, despliegue ni bases reales.

Fuentes: tarea Kit/02_TAREAS/NQP26-09.md, UX-02 del backlog, matriz de 24 escenarios y orden adjuntas; reglas AGENTS de raíz/app y contratos T03 existentes. Los documentos son especificaciones y evidencia histórica; el estado GitHub se verificó por separado.

Brecha observada: SimpleForm.tsx muestra Nombre antes de CustomerFields.tsx; la casilla de duplicado aparece después de sedes, sin nombres candidatos. useSaleFormState.ts y SaleForm.tsx implementan un segundo detector exacto basado en normalize general. customerSave en features/configuracion/domain/commands.mjs busca solo el primer exacto. master-command-contracts.mjs ya exige boolean cuando se envía confirm_duplicate, pero el dominio acepta truthy. No existe prueba de revisión de candidatos por el usuario.

Store: application-store.mjs carga estado actual antes de executeCommand; persistence.mjs protege revisión al persistir en un batch atómico. Eso evita sobrescribir una operación simultánea entre lectura y commit, pero no demuestra qué candidatos había visto un formulario antiguo. Un reintento con confirm_duplicate=true podría aceptar candidatos nuevos inadvertidamente. T03 verifica rol vigente antes de replay y compara cuerpo canónico; se preserva.

Plan: matcher puro separado de normalize general; exactitud sin acentos/caso/puntuación/espacios y semejanza conservadora (tokens reordenados o una errata en un token alfabético largo). Incluir inactivos/retirados para prevenir duplicados históricos, excluyendo solo id propio. Payload aditivo duplicate_review con nombre original solicitado, id editado y candidatos ordenados (id/nombre/estado/tipo). Solo boolean true más revisión idéntica permite continuar con candidatos; sin candidatos los payloads existentes siguen válidos. No es autorización criptográfica: confirma datos revisados y el servidor los recalcula.

UI compartida bajo Nombre en ambas entradas, con candidatos reales, tipo de coincidencia y consulta de lectura dentro del formulario para no perder datos. Confirmación vinculada a nombre y candidatos; cambio de nombre la borra incluso si luego se restaura. En error CUSTOMER_SAVE recargar estado sin cerrar formulario. No añadir rutas/tablas/permisos. El snapshot en auditoría de comando ya conserva aceptación y revisión.

Riesgos: falsos positivos, confirmación obsoleta, bypass de alta rápida, historial/sedes y retry T03. Matriz inicial copiada antes de cambiar código; pruebas de matcher/dominio, dos conexiones SQLite, HTTP/roles/replay/rollback, SSR y navegador a 390/1440 claro/oscuro y regresión completa. Datos exclusivamente sintéticos.
