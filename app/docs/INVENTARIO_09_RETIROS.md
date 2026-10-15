# Inventario de retiros — Tarea 09

Base: `a229671`. Listado generado de cambios Git y manifiestos, revisado por consumidores.
No enumera datos privados ni elimina archivos fuera de app. Las referencias históricas conservadas no son dependencias de ejecución.

Archivos retirados sin movimiento reconocido: **119**. Movimientos reconocidos: **19**.
Paquetes directos retirados: **30**. Entradas del lockfile: **936 → 510**.
Nombres de paquetes retirados del lockfile: **340**. Cambios de versión en rutas comunes: **0**.

## Dependencias directas y sustitución

| Paquete retirado            | Reemplazo o razón                                                                                |
| --------------------------- | ------------------------------------------------------------------------------------------------ |
| `@base-ui/react`            | Solo importado por componentes del starter sin consumidores; se conserva la UI comercial propia. |
| `@cloudflare/vite-plugin`   | React/Vite, Fastify y SQLite locales; ya no participa en las entradas operativas.                |
| `@cloudflare/workers-types` | React/Vite, Fastify y SQLite locales; ya no participa en las entradas operativas.                |
| `@hookform/resolvers`       | Solo importado por componentes del starter sin consumidores; se conserva la UI comercial propia. |
| `@shadcn/react`             | Solo importado por componentes del starter sin consumidores; se conserva la UI comercial propia. |
| `@vitejs/plugin-rsc`        | React/Vite, Fastify y SQLite locales; ya no participa en las entradas operativas.                |
| `class-variance-authority`  | Solo importado por componentes del starter sin consumidores; se conserva la UI comercial propia. |
| `clsx`                      | Solo importado por componentes del starter sin consumidores; se conserva la UI comercial propia. |
| `cmdk`                      | Solo importado por componentes del starter sin consumidores; se conserva la UI comercial propia. |
| `date-fns`                  | Solo importado por componentes del starter sin consumidores; se conserva la UI comercial propia. |
| `embla-carousel-react`      | Solo importado por componentes del starter sin consumidores; se conserva la UI comercial propia. |
| `eslint-config-next`        | Configuración ESLint directa para TypeScript, React, hooks y accesibilidad.                      |
| `input-otp`                 | Solo importado por componentes del starter sin consumidores; se conserva la UI comercial propia. |
| `json-rpc-2.0`              | Puente de preview sin consumidores; Fastify conserva el parser HTTP propio.                      |
| `next`                      | React/Vite, Fastify y SQLite locales; ya no participa en las entradas operativas.                |
| `next-themes`               | Solo importado por componentes del starter sin consumidores; se conserva la UI comercial propia. |
| `radix-ui`                  | Solo importado por componentes del starter sin consumidores; se conserva la UI comercial propia. |
| `raw-body`                  | Puente de preview sin consumidores; Fastify conserva el parser HTTP propio.                      |
| `react-day-picker`          | Solo importado por componentes del starter sin consumidores; se conserva la UI comercial propia. |
| `react-hook-form`           | Solo importado por componentes del starter sin consumidores; se conserva la UI comercial propia. |
| `react-resizable-panels`    | Solo importado por componentes del starter sin consumidores; se conserva la UI comercial propia. |
| `react-server-dom-webpack`  | React/Vite, Fastify y SQLite locales; ya no participa en las entradas operativas.                |
| `recharts`                  | Solo importado por componentes del starter sin consumidores; se conserva la UI comercial propia. |
| `sonner`                    | Solo importado por componentes del starter sin consumidores; se conserva la UI comercial propia. |
| `tailwind-merge`            | Solo importado por componentes del starter sin consumidores; se conserva la UI comercial propia. |
| `tw-animate-css`            | Solo importado por componentes del starter sin consumidores; se conserva la UI comercial propia. |
| `vaul`                      | Solo importado por componentes del starter sin consumidores; se conserva la UI comercial propia. |
| `vinext`                    | React/Vite, Fastify y SQLite locales; ya no participa en las entradas operativas.                |
| `wrangler`                  | React/Vite, Fastify y SQLite locales; ya no participa en las entradas operativas.                |
| `zod`                       | Solo importado por componentes del starter sin consumidores; se conserva la UI comercial propia. |

Las nuevas declaraciones directas son herramientas usadas, no nuevas capas de runtime:
`@eslint/js`, `eslint-plugin-jsx-a11y`, `eslint-plugin-react`, `eslint-plugin-react-hooks`, `globals`, `playwright`, `typescript-eslint`.
`drizzle-orm` permanece como dependencia de desarrollo del esquema/generador; Fastify no lo importa.
Se conservan los paquetes requeridos por React, Vite, estilos, tipos, pruebas, lint y compilación.

## Archivos retirados

| Ruta anterior                                             | Justificación                                                                                         |
| --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `.openai/hosting.json`                                    | Configuración, tipos o herramienta exclusiva de la plataforma retirada; reemplazo en scripts locales. |
| `app/api/command/route.ts`                                | Entrada o composición heredada; React en client/admin y API Fastify.                                  |
| `app/api/state/route.ts`                                  | Entrada o composición heredada; React en client/admin y API Fastify.                                  |
| `app/chatgpt-auth.ts`                                     | Entrada o composición heredada; React en client/admin y API Fastify.                                  |
| `app/layout.tsx`                                          | Entrada o composición heredada; React en client/admin y API Fastify.                                  |
| `app/page.tsx`                                            | Entrada o composición heredada; React en client/admin y API Fastify.                                  |
| `app/ui/Topbar.tsx`                                       | Entrada o composición heredada; React en client/admin y API Fastify.                                  |
| `app/ui/admin-api.ts`                                     | Entrada o composición heredada; React en client/admin y API Fastify.                                  |
| `build/connector-preview-plugin.mjs`                      | Puente/conector de plataforma sin consumidores comerciales.                                           |
| `build/connector-preview-worker.mjs`                      | Puente/conector de plataforma sin consumidores comerciales.                                           |
| `build/sites-vite-plugin.LICENSE`                         | Configuración, tipos o herramienta exclusiva de la plataforma retirada; reemplazo en scripts locales. |
| `build/sites-vite-plugin.ts`                              | Configuración, tipos o herramienta exclusiva de la plataforma retirada; reemplazo en scripts locales. |
| `build/sites-worker.ts`                                   | Configuración, tipos o herramienta exclusiva de la plataforma retirada; reemplazo en scripts locales. |
| `client/LocalImage.tsx`                                   | img nativo conserva dimensiones y alt; no hace falta un wrapper Next.                                 |
| `cloudflare-env.d.ts`                                     | Configuración, tipos o herramienta exclusiva de la plataforma retirada; reemplazo en scripts locales. |
| `components.json`                                         | Scaffold sin consumidores en el panel; avisos legales preservados.                                    |
| `components/connector-error.tsx`                          | Scaffold sin consumidores en el panel; avisos legales preservados.                                    |
| `components/ui/accordion.tsx`                             | Scaffold sin consumidores en el panel; avisos legales preservados.                                    |
| `components/ui/alert-dialog.tsx`                          | Scaffold sin consumidores en el panel; avisos legales preservados.                                    |
| `components/ui/alert.tsx`                                 | Scaffold sin consumidores en el panel; avisos legales preservados.                                    |
| `components/ui/aspect-ratio.tsx`                          | Scaffold sin consumidores en el panel; avisos legales preservados.                                    |
| `components/ui/attachment.tsx`                            | Scaffold sin consumidores en el panel; avisos legales preservados.                                    |
| `components/ui/avatar.tsx`                                | Scaffold sin consumidores en el panel; avisos legales preservados.                                    |
| `components/ui/badge.tsx`                                 | Scaffold sin consumidores en el panel; avisos legales preservados.                                    |
| `components/ui/breadcrumb.tsx`                            | Scaffold sin consumidores en el panel; avisos legales preservados.                                    |
| `components/ui/bubble.tsx`                                | Scaffold sin consumidores en el panel; avisos legales preservados.                                    |
| `components/ui/button-group.tsx`                          | Scaffold sin consumidores en el panel; avisos legales preservados.                                    |
| `components/ui/button.tsx`                                | Scaffold sin consumidores en el panel; avisos legales preservados.                                    |
| `components/ui/calendar.tsx`                              | Scaffold sin consumidores en el panel; avisos legales preservados.                                    |
| `components/ui/card.tsx`                                  | Scaffold sin consumidores en el panel; avisos legales preservados.                                    |
| `components/ui/carousel.tsx`                              | Scaffold sin consumidores en el panel; avisos legales preservados.                                    |
| `components/ui/chart.tsx`                                 | Scaffold sin consumidores en el panel; avisos legales preservados.                                    |
| `components/ui/checkbox.tsx`                              | Scaffold sin consumidores en el panel; avisos legales preservados.                                    |
| `components/ui/collapsible.tsx`                           | Scaffold sin consumidores en el panel; avisos legales preservados.                                    |
| `components/ui/combobox.tsx`                              | Scaffold sin consumidores en el panel; avisos legales preservados.                                    |
| `components/ui/command.tsx`                               | Scaffold sin consumidores en el panel; avisos legales preservados.                                    |
| `components/ui/context-menu.tsx`                          | Scaffold sin consumidores en el panel; avisos legales preservados.                                    |
| `components/ui/dialog.tsx`                                | Scaffold sin consumidores en el panel; avisos legales preservados.                                    |
| `components/ui/direction.tsx`                             | Scaffold sin consumidores en el panel; avisos legales preservados.                                    |
| `components/ui/drawer.tsx`                                | Scaffold sin consumidores en el panel; avisos legales preservados.                                    |
| `components/ui/dropdown-menu.tsx`                         | Scaffold sin consumidores en el panel; avisos legales preservados.                                    |
| `components/ui/empty.tsx`                                 | Scaffold sin consumidores en el panel; avisos legales preservados.                                    |
| `components/ui/field.tsx`                                 | Scaffold sin consumidores en el panel; avisos legales preservados.                                    |
| `components/ui/form.tsx`                                  | Scaffold sin consumidores en el panel; avisos legales preservados.                                    |
| `components/ui/hover-card.tsx`                            | Scaffold sin consumidores en el panel; avisos legales preservados.                                    |
| `components/ui/input-group.tsx`                           | Scaffold sin consumidores en el panel; avisos legales preservados.                                    |
| `components/ui/input-otp.tsx`                             | Scaffold sin consumidores en el panel; avisos legales preservados.                                    |
| `components/ui/input.tsx`                                 | Scaffold sin consumidores en el panel; avisos legales preservados.                                    |
| `components/ui/item.tsx`                                  | Scaffold sin consumidores en el panel; avisos legales preservados.                                    |
| `components/ui/kbd.tsx`                                   | Scaffold sin consumidores en el panel; avisos legales preservados.                                    |
| `components/ui/label.tsx`                                 | Scaffold sin consumidores en el panel; avisos legales preservados.                                    |
| `components/ui/marker.tsx`                                | Scaffold sin consumidores en el panel; avisos legales preservados.                                    |
| `components/ui/menubar.tsx`                               | Scaffold sin consumidores en el panel; avisos legales preservados.                                    |
| `components/ui/message-scroller.tsx`                      | Scaffold sin consumidores en el panel; avisos legales preservados.                                    |
| `components/ui/message.tsx`                               | Scaffold sin consumidores en el panel; avisos legales preservados.                                    |
| `components/ui/native-select.tsx`                         | Scaffold sin consumidores en el panel; avisos legales preservados.                                    |
| `components/ui/navigation-menu.tsx`                       | Scaffold sin consumidores en el panel; avisos legales preservados.                                    |
| `components/ui/pagination.tsx`                            | Scaffold sin consumidores en el panel; avisos legales preservados.                                    |
| `components/ui/popover.tsx`                               | Scaffold sin consumidores en el panel; avisos legales preservados.                                    |
| `components/ui/progress.tsx`                              | Scaffold sin consumidores en el panel; avisos legales preservados.                                    |
| `components/ui/radio-group.tsx`                           | Scaffold sin consumidores en el panel; avisos legales preservados.                                    |
| `components/ui/resizable.tsx`                             | Scaffold sin consumidores en el panel; avisos legales preservados.                                    |
| `components/ui/scroll-area.tsx`                           | Scaffold sin consumidores en el panel; avisos legales preservados.                                    |
| `components/ui/select.tsx`                                | Scaffold sin consumidores en el panel; avisos legales preservados.                                    |
| `components/ui/separator.tsx`                             | Scaffold sin consumidores en el panel; avisos legales preservados.                                    |
| `components/ui/sheet.tsx`                                 | Scaffold sin consumidores en el panel; avisos legales preservados.                                    |
| `components/ui/sidebar.tsx`                               | Scaffold sin consumidores en el panel; avisos legales preservados.                                    |
| `components/ui/skeleton.tsx`                              | Scaffold sin consumidores en el panel; avisos legales preservados.                                    |
| `components/ui/slider.tsx`                                | Scaffold sin consumidores en el panel; avisos legales preservados.                                    |
| `components/ui/sonner.tsx`                                | Scaffold sin consumidores en el panel; avisos legales preservados.                                    |
| `components/ui/spinner.tsx`                               | Scaffold sin consumidores en el panel; avisos legales preservados.                                    |
| `components/ui/switch.tsx`                                | Scaffold sin consumidores en el panel; avisos legales preservados.                                    |
| `components/ui/table.tsx`                                 | Scaffold sin consumidores en el panel; avisos legales preservados.                                    |
| `components/ui/tabs.tsx`                                  | Scaffold sin consumidores en el panel; avisos legales preservados.                                    |
| `components/ui/textarea.tsx`                              | Scaffold sin consumidores en el panel; avisos legales preservados.                                    |
| `components/ui/toggle-group.tsx`                          | Scaffold sin consumidores en el panel; avisos legales preservados.                                    |
| `components/ui/toggle.tsx`                                | Scaffold sin consumidores en el panel; avisos legales preservados.                                    |
| `components/ui/tooltip.tsx`                               | Scaffold sin consumidores en el panel; avisos legales preservados.                                    |
| `db/index.ts`                                             | Composición D1 reemplazada por factory Node y adaptador SQLite neutral.                               |
| `examples/d1/app/api/notes/route.ts`                      | Configuración, tipos o herramienta exclusiva de la plataforma retirada; reemplazo en scripts locales. |
| `examples/d1/db/schema.ts`                                | Configuración, tipos o herramienta exclusiva de la plataforma retirada; reemplazo en scripts locales. |
| `hooks/use-mobile.ts`                                     | Scaffold sin consumidores en el panel; avisos legales preservados.                                    |
| `lib/adapters/d1.ts`                                      | Composición D1 reemplazada por factory Node y adaptador SQLite neutral.                               |
| `lib/connector-context.ts`                                | Puente/conector de plataforma sin consumidores comerciales.                                           |
| `lib/connector-contract.mts`                              | Puente/conector de plataforma sin consumidores comerciales.                                           |
| `lib/connector-errors.mts`                                | Puente/conector de plataforma sin consumidores comerciales.                                           |
| `lib/connector-preview.d.ts`                              | Puente/conector de plataforma sin consumidores comerciales.                                           |
| `lib/connectors.ts`                                       | Puente/conector de plataforma sin consumidores comerciales.                                           |
| `lib/store.ts`                                            | Composición D1 reemplazada por factory Node y adaptador SQLite neutral.                               |
| `lib/utils.ts`                                            | Scaffold sin consumidores en el panel; avisos legales preservados.                                    |
| `next.config.ts`                                          | Configuración, tipos o herramienta exclusiva de la plataforma retirada; reemplazo en scripts locales. |
| `scripts/build-verified.sh`                               | Configuración, tipos o herramienta exclusiva de la plataforma retirada; reemplazo en scripts locales. |
| `scripts/connector-preview/connector-preview-session.mjs` | Puente/conector de plataforma sin consumidores comerciales.                                           |
| `scripts/connector-preview/host-binding.mjs`              | Puente/conector de plataforma sin consumidores comerciales.                                           |
| `scripts/connector-preview/protocol.mjs`                  | Puente/conector de plataforma sin consumidores comerciales.                                           |
| `scripts/execution-profile.mjs`                           | Configuración, tipos o herramienta exclusiva de la plataforma retirada; reemplazo en scripts locales. |
| `scripts/install-ci.mjs`                                  | Configuración, tipos o herramienta exclusiva de la plataforma retirada; reemplazo en scripts locales. |
| `scripts/install-ci.sh`                                   | Configuración, tipos o herramienta exclusiva de la plataforma retirada; reemplazo en scripts locales. |
| `scripts/install-pnpm.sh`                                 | Configuración, tipos o herramienta exclusiva de la plataforma retirada; reemplazo en scripts locales. |
| `scripts/local-bindings.mjs`                              | Configuración, tipos o herramienta exclusiva de la plataforma retirada; reemplazo en scripts locales. |
| `scripts/local-database.mjs`                              | Configuración, tipos o herramienta exclusiva de la plataforma retirada; reemplazo en scripts locales. |
| `scripts/local-migration-plan.mjs`                        | Configuración, tipos o herramienta exclusiva de la plataforma retirada; reemplazo en scripts locales. |
| `scripts/npm-install.mjs`                                 | Configuración, tipos o herramienta exclusiva de la plataforma retirada; reemplazo en scripts locales. |
| `scripts/pnpm-install.mjs`                                | Configuración, tipos o herramienta exclusiva de la plataforma retirada; reemplazo en scripts locales. |
| `scripts/prepare-local-db.mjs`                            | Configuración, tipos o herramienta exclusiva de la plataforma retirada; reemplazo en scripts locales. |
| `scripts/run-framework.mjs`                               | Configuración, tipos o herramienta exclusiva de la plataforma retirada; reemplazo en scripts locales. |
| `scripts/sites-env.mjs`                                   | Configuración, tipos o herramienta exclusiva de la plataforma retirada; reemplazo en scripts locales. |
| `scripts/sites-env.sh`                                    | Configuración, tipos o herramienta exclusiva de la plataforma retirada; reemplazo en scripts locales. |
| `shared/ui/LoadingScreen.tsx`                             | Carga y logout propios en client/LoadingScreen.                                                       |
| `tests/e2e/admin-flows.test.mjs`                          | E2E de plataforma reemplazado por L01–L15 y desarrollo independiente.                                 |
| `tests/helpers/d1-memory.mjs`                             | Configuración, tipos o herramienta exclusiva de la plataforma retirada; reemplazo en scripts locales. |
| `tests/helpers/http-route-harness.mjs`                    | Handlers antiguos sustituidos por HTTP Node real y sesiones: mapeo H01–H10 en reporte 09.             |
| `tests/helpers/local-test-server.mjs`                     | E2E de plataforma reemplazado por L01–L15 y desarrollo independiente.                                 |
| `tests/http-contract.test.mjs`                            | Handlers antiguos sustituidos por HTTP Node real y sesiones: mapeo H01–H10 en reporte 09.             |
| `tests/local-database.test.mjs`                           | Planificador Wrangler reemplazado por administración SQLite Tarea 06.                                 |
| `tests/local-migrations.test.mjs`                         | Planificador Wrangler reemplazado por administración SQLite Tarea 06.                                 |
| `vendor/shadcn-tailwind-4.13.0.css`                       | Scaffold sin consumidores en el panel; avisos legales preservados.                                    |
| `vite.config.ts`                                          | Configuración, tipos o herramienta exclusiva de la plataforma retirada; reemplazo en scripts locales. |
| `wrangler.local.json`                                     | Configuración, tipos o herramienta exclusiva de la plataforma retirada; reemplazo en scripts locales. |

## Movimientos y consolidación

| Origen                               | Destino                                    |
| ------------------------------------ | ------------------------------------------ |
| `app/ui/AdminApp.tsx`                | `client/admin/AdminApp.tsx`                |
| `app/ui/AdminWorkspace.tsx`          | `client/admin/AdminWorkspace.tsx`          |
| `app/ui/ModalContent.tsx`            | `client/admin/ModalContent.tsx`            |
| `app/ui/ModalHost.tsx`               | `client/admin/ModalHost.tsx`               |
| `app/ui/OperationDetails.tsx`        | `client/admin/OperationDetails.tsx`        |
| `app/ui/PageHeading.tsx`             | `client/admin/PageHeading.tsx`             |
| `app/ui/RecordFilters.tsx`           | `client/admin/RecordFilters.tsx`           |
| `app/ui/Sidebar.tsx`                 | `client/admin/Sidebar.tsx`                 |
| `app/ui/SimpleForm.tsx`              | `client/admin/SimpleForm.tsx`              |
| `client/Topbar.tsx`                  | `client/admin/Topbar.tsx`                  |
| `app/ui/hooks/useAdminNavigation.ts` | `client/admin/hooks/useAdminNavigation.ts` |
| `app/ui/hooks/useAdminOperations.ts` | `client/admin/hooks/useAdminOperations.ts` |
| `app/ui/modal-configuration.ts`      | `client/admin/modal-configuration.ts`      |
| `app/ui/navigation.ts`               | `client/admin/navigation.ts`               |
| `app/ui/resolve-modal-record.ts`     | `client/admin/resolve-modal-record.ts`     |
| `app/ui/selectors.ts`                | `client/admin/selectors.ts`                |
| `app/globals.css`                    | `client/globals.css`                       |
| `client/domain.d.mts`                | `lib/domain-preview.d.mts`                 |
| `client/domain.mjs`                  | `lib/domain-preview.mjs`                   |

## Paquetes transitivos que dejan de aparecer

Estos nombres proceden del lockfile; la ausencia se comprueba también tras npm ci.

```text
@babel/runtime
@base-ui/react
@base-ui/utils
@cloudflare/kv-asset-handler
@cloudflare/unenv-preset
@cloudflare/vite-plugin
@cloudflare/workerd-darwin-64
@cloudflare/workerd-darwin-arm64
@cloudflare/workerd-linux-64
@cloudflare/workerd-linux-arm64
@cloudflare/workerd-windows-64
@cloudflare/workers-types
@cspotcode/source-map-support
@date-fns/tz
@floating-ui/core
@floating-ui/dom
@floating-ui/react-dom
@floating-ui/utils
@hookform/resolvers
@img/colour
@img/sharp-darwin-arm64
@img/sharp-darwin-x64
@img/sharp-freebsd-wasm32
@img/sharp-libvips-darwin-arm64
@img/sharp-libvips-darwin-x64
@img/sharp-libvips-linux-arm
@img/sharp-libvips-linux-arm64
@img/sharp-libvips-linux-ppc64
@img/sharp-libvips-linux-riscv64
@img/sharp-libvips-linux-s390x
@img/sharp-libvips-linux-x64
@img/sharp-libvips-linuxmusl-arm64
@img/sharp-libvips-linuxmusl-x64
@img/sharp-linux-arm
@img/sharp-linux-arm64
@img/sharp-linux-ppc64
@img/sharp-linux-riscv64
@img/sharp-linux-s390x
@img/sharp-linux-x64
@img/sharp-linuxmusl-arm64
@img/sharp-linuxmusl-x64
@img/sharp-wasm32
@img/sharp-webcontainers-wasm32
@img/sharp-win32-arm64
@img/sharp-win32-ia32
@img/sharp-win32-x64
@jridgewell/source-map
@next/env
@next/eslint-plugin-next
@next/swc-darwin-arm64
@next/swc-darwin-x64
@next/swc-linux-arm64-gnu
@next/swc-linux-arm64-musl
@next/swc-linux-x64-gnu
@next/swc-linux-x64-musl
@next/swc-win32-arm64-msvc
@next/swc-win32-x64-msvc
@nodelib/fs.scandir
@nodelib/fs.stat
@nodelib/fs.walk
@nolyfill/is-core-module
@poppinss/colors
@poppinss/dumper
@poppinss/exception
@radix-ui/number
@radix-ui/primitive
@radix-ui/react-accessible-icon
@radix-ui/react-accordion
@radix-ui/react-alert-dialog
@radix-ui/react-arrow
@radix-ui/react-aspect-ratio
@radix-ui/react-avatar
@radix-ui/react-checkbox
@radix-ui/react-collapsible
@radix-ui/react-collection
@radix-ui/react-compose-refs
@radix-ui/react-context
@radix-ui/react-context-menu
@radix-ui/react-dialog
@radix-ui/react-direction
@radix-ui/react-dismissable-layer
@radix-ui/react-dropdown-menu
@radix-ui/react-focus-guards
@radix-ui/react-focus-scope
@radix-ui/react-form
@radix-ui/react-hover-card
@radix-ui/react-id
@radix-ui/react-label
@radix-ui/react-menu
@radix-ui/react-menubar
@radix-ui/react-navigation-menu
@radix-ui/react-one-time-password-field
@radix-ui/react-password-toggle-field
@radix-ui/react-popover
@radix-ui/react-popper
@radix-ui/react-portal
@radix-ui/react-presence
@radix-ui/react-primitive
@radix-ui/react-progress
@radix-ui/react-radio-group
@radix-ui/react-roving-focus
@radix-ui/react-scroll-area
@radix-ui/react-select
@radix-ui/react-separator
@radix-ui/react-slider
@radix-ui/react-slot
@radix-ui/react-switch
@radix-ui/react-tabs
@radix-ui/react-toast
@radix-ui/react-toggle
@radix-ui/react-toggle-group
@radix-ui/react-toolbar
@radix-ui/react-tooltip
@radix-ui/react-use-callback-ref
@radix-ui/react-use-controllable-state
@radix-ui/react-use-effect-event
@radix-ui/react-use-escape-keydown
@radix-ui/react-use-is-hydrated
@radix-ui/react-use-layout-effect
@radix-ui/react-use-previous
@radix-ui/react-use-rect
@radix-ui/react-use-size
@radix-ui/react-visually-hidden
@radix-ui/rect
@reduxjs/toolkit
@resvg/resvg-wasm
@rtsao/scc
@shadcn/react
@shuding/opentype.js
@sindresorhus/is
@speed-highlight/core
@standard-schema/spec
@standard-schema/utils
@swc/helpers
@types/d3-array
@types/d3-color
@types/d3-ease
@types/d3-interpolate
@types/d3-path
@types/d3-scale
@types/d3-shape
@types/d3-time
@types/d3-timer
@types/eslint
@types/eslint-scope
@types/json5
@types/use-sync-external-store
@unpic/core
@unpic/react
@unrs/resolver-binding-android-arm-eabi
@unrs/resolver-binding-android-arm64
@unrs/resolver-binding-darwin-arm64
@unrs/resolver-binding-darwin-x64
@unrs/resolver-binding-freebsd-x64
@unrs/resolver-binding-linux-arm-gnueabihf
@unrs/resolver-binding-linux-arm-musleabihf
@unrs/resolver-binding-linux-arm64-gnu
@unrs/resolver-binding-linux-arm64-musl
@unrs/resolver-binding-linux-ppc64-gnu
@unrs/resolver-binding-linux-riscv64-gnu
@unrs/resolver-binding-linux-riscv64-musl
@unrs/resolver-binding-linux-s390x-gnu
@unrs/resolver-binding-linux-x64-gnu
@unrs/resolver-binding-linux-x64-musl
@unrs/resolver-binding-wasm32-wasi
@unrs/resolver-binding-win32-arm64-msvc
@unrs/resolver-binding-win32-ia32-msvc
@unrs/resolver-binding-win32-x64-msvc
@vercel/og
@vinext/types
@vitejs/plugin-rsc
@webassemblyjs/ast
@webassemblyjs/floating-point-hex-parser
@webassemblyjs/helper-api-error
@webassemblyjs/helper-buffer
@webassemblyjs/helper-numbers
@webassemblyjs/helper-wasm-bytecode
@webassemblyjs/helper-wasm-section
@webassemblyjs/ieee754
@webassemblyjs/leb128
@webassemblyjs/utf8
@webassemblyjs/wasm-edit
@webassemblyjs/wasm-gen
@webassemblyjs/wasm-opt
@webassemblyjs/wasm-parser
@webassemblyjs/wast-printer
@xtuc/ieee754
@xtuc/long
acorn-import-phases
acorn-loose
ajv-keywords
aria-hidden
array.prototype.findlastindex
base64-js
blake3-wasm
braces
bytes
camelize
chrome-trace-event
class-variance-authority
client-only
clsx
cmdk
commander
css-background-parser
css-box-shadow
css-color-keywords
css-gradient-parser
css-to-react-native
d3-array
d3-color
d3-ease
d3-format
d3-interpolate
d3-path
d3-scale
d3-shape
d3-time
d3-time-format
d3-timer
date-fns
decimal.js-light
depd
detect-node-es
embla-carousel
embla-carousel-react
embla-carousel-reactive-utils
emoji-regex-xs
error-stack-parser-es
es-module-lexer
es-toolkit
escape-html
eslint-config-next
eslint-import-resolver-node
eslint-import-resolver-typescript
eslint-module-utils
eslint-plugin-import
estree-walker
eventemitter3
events
fast-glob
fflate
fill-range
get-nonce
glob-to-regexp
hex-rgb
http-errors
iconv-lite
image-size
immer
inherits
input-otp
internmap
is-bun-module
is-number
jest-worker
json-rpc-2.0
kleur
linebreak
loader-runner
merge-stream
merge2
micromatch
mime-db
miniflare
minimist
napi-postinstall
neo-async
next
next-themes
object.groupby
pako
parse-css-color
path-to-regexp
pathe
postcss-value-parser
queue-microtask
radix-ui
raw-body
react-day-picker
react-hook-form
react-redux
react-remove-scroll
react-remove-scroll-bar
react-resizable-panels
react-server-dom-webpack
react-style-singleton
recharts
redux
redux-thunk
reselect
run-parallel
safer-buffer
satori
schema-utils
setprototypeof
sharp
sonner
srvx
stable-hash
statuses
string.prototype.codepointat
strip-bom
strip-literal
styled-jsx
tailwind-merge
terser
terser-webpack-plugin
tiny-inflate
tiny-invariant
to-regex-range
toidentifier
tsconfig-paths
turbo-stream
tw-animate-css
undici
unenv
unicode-trie
unpic
unpipe
unrs-resolver
use-callback-ref
use-sidecar
use-sync-external-store
vaul
victory-vendor
vinext
vite-plugin-commonjs
vite-plugin-dynamic-import
vitefu
watchpack
web-vitals
webpack
webpack-sources
workerd
wrangler
ws
yoga-layout
youch
youch-core
```

Las herramientas Drizzle conservan transitivas de desarrollo @esbuild-kit deprecadas;
no forman parte de la distribución ni reintroducen la plataforma. Su actualización requiere
una revisión separada del generador; no se regeneró SQL para eliminar una advertencia.
