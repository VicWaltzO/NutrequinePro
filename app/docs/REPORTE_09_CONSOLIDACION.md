# Tarea 09 — Consolidación de la arquitectura local

Fecha: 15/10/2026. Rama exclusiva: `codex/reestructuracion-arquitectonica`.
Base funcional y remota comprobada: `a229671d745d466c6ddc14293e448a2c3fc06b0a`.
Referencia local de recuperación: etiqueta anotada `respaldo/tarea-08-a229671`;
no se mueve ni se reescribe el historial. El commit base sigue accesible en GitHub.

## Inventario previo y decisiones

Se consultaron auditoría 01, plan local, reportes 04–08 y matriz; se aplicó
`programacion-clara`. La inspección abarca imports de fuentes, configuraciones,
scripts, paquetes y lockfile, pruebas, CI y documentación. No se leen secretos
ni se intervienen bases reales. El borrado previo del vídeo de showcase es ajeno
y permanece fuera de los commits de esta tarea.

| Clase                                | Elementos                                                                                              | Decisión y consumidores comprobados                                                                                                                    |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Arquitectura independiente necesaria | `client/`, `server/`, adaptador SQLite, administración SQLite                                          | Conservar; entradas ejecutables reales de Tareas 06–08.                                                                                                |
| Compartidos activos                  | `features/`, `shared/`, store, persistencia neutral, contratos, `db/schema.ts`, Drizzle SQL/meta       | Conservar reglas, relaciones, IDs y SQL histórico. Componentes importados por el panel; dominio importado por store.                                   |
| Reemplazados                         | App Router, `lib/store.ts`, adaptador D1, `db/index.ts`, Workers, autenticación ChatGPT                | Sus consumidores son exclusivamente las entradas/plataforma retiradas; Node compone store y SQLite directamente.                                       |
| Reemplazados                         | Plugins Sites/Vinext, perfiles y scripts Wrangler, `.openai/`, tipos Cloudflare                        | Ningún consumidor en el grafo Node/React independiente. Sustituir los comandos principales por Vite/Fastify/CLI SQLite.                                |
| Reemplazados sin uso comercial       | Conectores, preview y componentes del starter                                                          | Sin imports desde el panel, funcionalidades o UI compartida activa. Retirar fuentes sin consumidores y paquetes asociados, conservando avisos legales. |
| Desarrollo necesario                 | TypeScript, Vite, React plugin, Tailwind/PostCSS, ESLint, Prettier, generador Drizzle, herramienta E2E | Conservar herramientas usadas; configurar lint sin Next y declarar dependencias directas reales.                                                       |
| Historia documental                  | Auditorías/reportes 01–08, especificación, demo multimedia, referencias visuales previas               | Conservar como antecedentes, sin presentarlos como procedimientos operativos actuales. No publicar capturas o bases.                                   |
| Compatibilidad histórica necesaria   | Lectura del ledger `d1_migrations` en `lib/sqlite/schema.mjs`                                          | Conservar: reconoce metadatos SQLite previos sin cargar D1 ni Cloudflare. No eliminar por su nombre.                                                   |

La referencia `tests/fixtures/ui-independent-08.json` se capturó antes de cambiar
fuentes, aplicando las mismas resoluciones explícitas del cliente Tarea 08 en el
harness SSR. Nueve vistas se compararon con la referencia antigua: únicamente
el header de logout ya aprobado en Tarea 08 cambia; el resto de su HTML coincide.
La referencia histórica `ui-baseline.json` permanece intacta. No se generan
expectativas a partir del código consolidado para ocultar diferencias.

## Verificaciones

En curso. Este documento se completará con resultados finales y trazabilidad
de eliminaciones antes de crear el commit de cierre.
