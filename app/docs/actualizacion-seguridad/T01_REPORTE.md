# T01 — Validación estricta de comandos maestros

Fecha: 23 de octubre de 2026, America/Bogota.

## Base aprobada y condiciones previas

- Destino del PR: **main**, sin fusión automática.
- Base exacta: `b8b2276124c27b9948dac473a21383aaea377ed8` (`origin/main`, merge del PR #7).
- Rama independiente: `codex/t01-validacion-maestros`.
- Se reutilizó el worktree limpio de T00, cambiando a una nueva rama desde main. El nombre físico de la carpeta conserva t00-linea-base; la rama y la base son las indicadas arriba.
- T00 revisada: 207 pruebas generales, 29 E2E, verify y distribución aprobados. Se compararon con main los árboles de aplicación, pruebas, scripts y manifiestos respecto del SHA probado `1a2410708e82bf6493bfa0b1d62a05945cd12806`: sin diferencias.
- No había fallos bloqueantes de T00. Los avisos de dependencias siguen pendientes de evaluación en T14; no se actualizaron paquetes para ocultarlos. La comprobación específica de H01 corresponde a esta tarea y H06 a T03.
- El informe T00 permanece en su PR #8 independiente; no se fusionó como parte de T01. Los cambios locales de la carpeta original y sus borrados de demos se conservaron.
- Node `v24.18.0`, npm `11.16.0`, Windows x64. Se reutilizó la instalación aislada de T00, cuyo package.json y lockfile son idénticos a main.

## Reproducción previa de H01

Antes de cambiar código funcional se añadió la regresión y se ejecutó:

```powershell
node --test --test-name-pattern="T01 H01" tests/master-commands-http.test.mjs
```

Comando lógico de la prueba: el helper añade request_id con randomUUID y realiza la solicitud HTTP real a loopback, con sesión y CSRF válidos:

```json
{
  "type": "CUSTOMER_SAVE",
  "payload": { "name": "H01 sintético", "phone": ["000"], "notes": { "injected": true } }
}
```

El resumen anterior a la corrección fue:

```json
{ "probe": "H01", "status": 200, "phoneArray": true, "notesObject": true, "businessChanged": true }
```

La regresión falló deliberadamente al esperar 422. Evidencia: `h01-before.log`. Después de la corrección, el mismo probe devuelve 422 y `businessChanged:false`. Así se demostró el comportamiento vulnerable primero y su bloqueo después.

## Implementación y frontera de escritura

`app/lib/master-command-contracts.mjs` define listas explícitas de campos y validaciones por comando. `executeCommand` las ejecuta después de comprobar permisos y antes de crear el contexto o invocar el handler. Un error de contrato lanza DomainError y la API existente responde 422 con un mensaje, sin stack, SQL ni detalles de archivos. No se construye ni ejecuta un plan de escritura para el comando inválido.

Los ocho contratos cubren exclusivamente los maestros. Los otros 19 comandos mantienen sus reglas actuales para T02. No se agregaron dependencias ni migraciones y no se modificaron tablas ni datos históricos.

PRODUCT_SAVE e INGREDIENT_SAVE ya exigían ADMIN en el handler. Se incorporaron a la comprobación común de permisos para que el acceso HTTP de OPERATOR se rechace como 403, antes del contrato, sin ampliar ni reducir los roles que podían ejecutarlos. VIEWER sigue sin escribir. Esta tarea no redefine la política comercial de T04.

Referencias verificadas: `app/lib/master-command-contracts.mjs:135` (contrato), `app/lib/execute-command.mjs:65` (validación antes del contexto), `app/shared/domain/permissions.mjs:7` (permisos), `app/tests/master-commands-http.test.mjs:40` (snapshot SQLite), `app/tests/master-commands-http.test.mjs:90` (H01), `app/features/ventas/components/SaleForm.tsx:39` (alta rápida) y `app/tests/local-e2e/sale-form.test.mjs:51` (claves del payload).

## Contratos admitidos

Todo payload debe ser un objeto JSON. Se rechazan campos desconocidos, incluidas propiedades `__proto__`, `constructor` y `prototype`. No se convierten arreglos, objetos o booleanos a textos o números.

Reglas comunes:

- Nombre requerido: cadena no vacía al recortar espacios y de hasta 2.000 caracteres.
- ID: cadena no vacía de hasta 2.000 caracteres, sin espacios ni caracteres de control. Omitir ID crea un maestro cuando el comando lo permite; enviarlo exige que exista. USER_SAVE es una excepción deliberada: crea una identidad comercial nueva con ID explícito, como hacía antes; no promete verificar una identidad corporativa externa.
- `is_active`, `is_sellable` y `confirm_duplicate`: booleanos reales cuando se envían.
- Textos de contacto: cadenas de hasta 2.000 caracteres, con cadena vacía admitida. Null no sustituye a ausencia o texto vacío.
- Dinero: número o cadena decimal no negativa, hasta dos decimales y máximo 10^12 céntimos. Pesos expresados en kg: hasta tres decimales y máximo 10^12 gramos. Se mantienen los parsers y límites de cálculo existentes.
- Enteros de gramos y sacos: número entero o cadena de dígitos, mayor que cero y hasta 10^7.
- Los campos opcionales pueden omitirse; null se admite explícitamente solo para precio base e imagen de producto y para ecos de metadatos históricos que ya contengan ese mismo valor.

| Comando             | Campos de entrada                                                                                                                                                                                                                                   |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CUSTOMER_SAVE       | id, name, is_active, tax_id, contact_name, phone, address, notes, confirm_duplicate, site_ids, new_sites, default_site_id; ecos históricos indicados abajo                                                                                          |
| CUSTOMER_SITES_SAVE | id requerido, site_ids, new_sites, default_site_id                                                                                                                                                                                                  |
| SITE_SAVE           | id, name, is_active; ecos históricos                                                                                                                                                                                                                |
| PRODUCT_SAVE        | id, name, is_active, category, default_sale_price, standard_bag_weight_kg, bags_per_nucleus, commercial_weight_per_nucleus_kg, unit_weight_grams, presentation_unit, weight_policy, stock_entry_mode, is_sellable, image; ecos históricos           |
| INGREDIENT_SAVE     | id, name, is_active, current_price_per_kg requerido; ecos históricos                                                                                                                                                                                |
| CUSTOMER_DELETE     | id requerido y existente                                                                                                                                                                                                                            |
| CONFIG_SAVE         | company_name, default_nucleus_cost y default_packaging_cost requeridos; tax_id, address, phone, contact_email, expense_categories, default_payment_condition, default_payment_method, default_expense_category, currency, timezone, categories_text |
| USER_SAVE           | id, name y role requeridos; is_active; ecos históricos                                                                                                                                                                                              |

Restricciones por comando:

- Sedes: hasta 100 IDs existentes y 100 nombres nuevos por petición; listas vacías válidas. No se repiten IDs ni nombres nuevos normalizados. La principal debe pertenecer a las seleccionadas o señalar un índice válido `new:N`. Se conservan las reglas existentes de sedes inactivas y relaciones históricas.
- Producto: categoría libre como texto no vacío, sin imponer categorías comerciales nuevas. Unidades BAG/BOTTLE/UNIT, peso FIXED/VARIABLE e ingreso NUCLEUS_PRODUCTION/DIRECT_STOCK. Se conservan las restricciones de sacos 25/50 kg, frascos de peso fijo, coherencia de peso por núcleo y presentación con historial. Se conserva la prioridad existente de unit_weight_grams frente al campo legacy standard_bag_weight_kg si llegan ambos.
- Precio base desconocido: ausencia, cadena vacía o null; un producto habilitado para venta sigue necesitando precio según el handler existente. Imagen: null/cadena vacía para retirarla, alias existentes o data URI JPEG/PNG/WebP de hasta 200.024 caracteres, como antes.
- Configuración: categorías de gasto de 1 a 100 textos no vacíos de hasta 2.000 caracteres; se conserva su deduplicación. Condición CASH/CREDIT; método vacío/CASH/TRANSFER/CHECK; categoría predeterminada perteneciente a las categorías efectivas. Se conserva la validación existente de correo.
- Usuario: ADMIN/OPERATOR/VIEWER. Se conservan los controles del último administrador activo y del último acceso administrativo con credenciales.
- Retirada de cliente: ID existente y cliente aún no retirado, conservando la baja lógica actual.

## Compatibilidad y posibles regresiones

Los formularios existentes reenvían registros completos al editar. Se admiten `created_at`, `created_by` y `updated_at` exclusivamente si coinciden con el registro existente; en clientes también code, deleted_at y deleted_by. No se permite introducirlos al crear ni falsificarlos. Los handlers siguen construyendo sus valores explícitamente y no asignan esos ecos al registro.

CONFIG_SAVE admite currency y timezone solo como ecos idénticos de la configuración. `categories_text` se valida como texto de hasta 202.000 caracteres y se ignora al persistir: es un campo del formulario existente; la lista efectiva es expense_categories.

Operaciones previamente toleradas por coerción (por ejemplo, un nombre numérico, un booleano usado como importe, null como contacto o campos ajenos) ahora fallan deliberadamente con 422. Editores externos que envíen metadatos obsoletos deben recargar antes de reintentar. Peticiones con más de 100 elementos deben dividirse; no se truncaron registros existentes.

La semántica de recibos/reintentos permanece intacta: las pruebas de contratos usan request_id nuevos. La comparación de contenido en solicitudes repetidas es T03; no se afirma haber corregido H06.

El fixture SSR de interfaz se ajustó para cruzar una frontera JSON dentro de su VM, sin cambiar la validación de producción. Se retiró su campo date sobrante en CUSTOMER_SAVE. Solo cambió la referencia ADMIN:config/audit, que muestra el payload del fixture; los hashes de las demás vistas permanecieron iguales.

La primera ejecución E2E detectó que el alta rápida de sedes en SaleForm enviaba confirm_duplicate, un campo exclusivo de clientes. Se corrigió esa construcción de payload para enviarlo solo en CUSTOMER_SAVE y se reforzó el E2E para comprobar las claves exactas de ambos comandos. No se cambió la lógica de SALE_SAVE. Se repitieron verify y E2E completos tras el ajuste.

## Pruebas y resultados

Pruebas nuevas: `app/tests/master-commands-http.test.mjs`, usando fetch contra un servidor Fastify real en 127.0.0.1, sesión real y CSRF, SQLite de disco y datos sintéticos. No se depende de React para comprobar el contrato.

La matriz verifica 403 rechazos y 18 operaciones válidas. Antes y después de cada rechazo compara todos los registros de todas las tablas de negocio y PRAGMA data_version mediante una conexión observadora persistente. Eso incluye settings/revisión, auditoría, correcciones y relaciones. Sin cambios en ninguno de esos valores; no se afirma que la base de autenticación no actualice sus propias sesiones.

Cubre: phone arreglo, notes objeto, campos desconocidos, null/tipos incompatibles, límites, IDs inválidos/inexistentes, sedes inválidas, dinero/precisión, presentaciones, inmutabilidad, operaciones válidas y los tres roles. El probe H01 se comprueba por separado.

| Verificación final                     | Resultado                                                                                                  |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| HTTP T01 + referencia de interfaz      | 21 pruebas aprobadas, cero fallidas/omitidas                                                               |
| npm.cmd run verify                     | PASA: 227 pruebas generales, check/check:node/check:client, lint, format:check, build y check:distribution |
| npm.cmd run test:e2e                   | PASA: 29 aprobadas; cero fallidas, canceladas u omitidas                                                   |
| Distribución                           | 2.070 archivos, 69 paquetes de runtime; privateFiles=0 y retiredPackages=0 según el chequeo existente      |
| Formato del informe y git diff --check | PASA; revisión y comprobación documental antes del commit                                                  |

verify final: 404,27 segundos. E2E final: 468,80 segundos.

Durante el desarrollo se detectó un fallo de compatibilidad del fixture VM y se corrigió como se describe arriba; la primera ejecución fallida de verify no se presenta como verde. También se corrigió un diagnóstico de lint sobre la expresión de caracteres de control. Los resultados finales de la tabla corresponden a la versión corregida.

Una repetición E2E posterior al ajuste del alta rápida obtuvo 28 aprobadas y una cancelación por timeout en interfaz corporativa (16.885,47 s de reloj total). Ese resultado no se presentó como aprobación. El caso y la suite completa se repitieron sin cambios de código; se conserva el log cancelado para distinguirlo del resultado final.

## Evidencias y cierre

Logs locales: `C:/Users/vicve/AppData/Local/Temp/nutrequine-t01-b8b2276/`: h01-before.log, contracts-after.log, focused-final.log, verify-initial-fixture-failure.log, e2e-initial-quick-site-failure.log, e2e-environment-timeout.log, corporate-retry.log, verify.log, test-e2e.log y JSON de duración/salida. El manifiesto de hashes se conserva allí como log-hashes.json. Las capturas E2E quedan en app/outputs/frontend-08 del worktree y los fixtures en TEMP, excluidos del commit.

No se usaron bases empresariales, infraestructura ni configuración de producción. No se incluyen credenciales, bases, capturas o builds en el PR.

El commit de T01 se identificará en la entrega y mediante `git log --oneline b8b2276124c27b9948dac473a21383aaea377ed8..codex/t01-validacion-maestros`. No se incrusta el hash propio del documento en su contenido.

Reversión: revertir el commit de código de T01 y sus pruebas asociadas; no hay cambios de esquema o transformaciones de datos que revertir. Las entradas válidas guardadas conservan el formato existente. Los datos inválidos que pudieran existir previamente no se limpian ni reescriben en esta tarea.

H01 se considera corregido para nuevas ejecuciones de CUSTOMER_SAVE solo después de su reproducción previa y de los resultados finales anteriores. La aceptación de T01 no cierra T02, T03 ni el gate T19 y no constituye aprobación de publicación en Internet.
