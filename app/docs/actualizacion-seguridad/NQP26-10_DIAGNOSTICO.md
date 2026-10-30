# NQP26-10 · Diagnóstico previo

2026-10-30 America/Bogota. Orden de lectura: diagrama, matriz (28 pendientes), orden de ejecución. Se contrastaron con tarea 10, UX-03 completo y reporte 09. Los adjuntos son especificación de trabajo solicitada, no autoridad para ampliar permisos ni fusionar/desplegar.

GitHub consultado: #21 fusionado 2026-10-30, merge a28daf025df139c881f784da363507baaf4e7b69; #20 fusionado, merge b2fa2da736dd965ca599e314c5a39dbe0a39ecbb. Base origin/main a28daf0. Worktree independiente nqp26-10-sede-optativa, rama codex/nqp26-10-sede-optativa. Checkout original con cambios ajenos intacto.

Brecha real: features/ventas/domain/commands.mjs saleSave añade customerSites incondicionalmente fuera del bloque de confirmación; afecta borradores. La selección frontend no envía escrituras, pero carece de aviso y consentimiento. SITE_SAVE solo crea sede. El selector propone principal activa sin comprobar si la sede sigue habilitada. useSaleFormState gestiona fecha 06 y aceptación de homónimos 09: conservar ambas.

master-command-contracts.mjs solo valida maestros, no SALE_SAVE. Se añadirá validador específico de intención en dominio antes de mutaciones. Contrato site_link_mode ONE_TIME (ausente por compatibilidad) o LINK; confirm_site_link booleano; LINK exige true y confirm === true. Validar también tipos de confirm/deliver/create_production para evitar falsos flags. Un borrador solo admite ONE_TIME; no guarda intención en venta.

Permisos vigentes: ADMIN/OPERATOR pueden SALE_SAVE y CUSTOMER_SITES_SAVE; se conserva el mismo alcance para LINK. VIEWER bloqueado antes de replay. Cliente/sede deben estar activos y cliente no retirado. Asociación idempotente: reutilizar relación inactiva, conservar is_default y otras relaciones.

Persistencia: executeCommand clona estado; createStore calcula writePlan con revisión optimista; adapter SQLite ejecuta batch transaccional. Venta, relación y auditoría comparten batch. Un conflicto rechaza sin escritura y obliga recargar/revalidar; T03 conserva comparación de cuerpo por actor/request_id. No hacen falta tablas ni migraciones.

Archivos previstos: commands.mjs, helper de vínculo/contrato, hook de selección puro y useSaleFormState, SaleForm, forms.ts, CSS mínimo si procede; pruebas dominio memoria/SQLite, HTTP dos servidores y UI/E2E. Riesgos: aprobación obsoleta al cambiar selección, habitual inactiva, replay, rollback SQL después del vínculo, borradores y composición aislada de reservas. No habilitar partialReservations. No cambiar costos/stock/pagos/históricos.

Verificaciones pendientes: dirigidas, verify, E2E completo, capturas 1440/390 claro/oscuro, revisión independiente y CI final. No atribuir aprobación antes de ejecución. Informes completos/evidencias fuera de Git; resumen seguro en app/docs/actualizacion-seguridad según AGENTS.
