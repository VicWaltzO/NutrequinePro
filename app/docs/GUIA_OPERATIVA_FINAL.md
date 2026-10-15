# Guía operativa final — Nutrequine Pro local

Esta guía corresponde a React/Vite, Fastify/Node y SQLite de la rama
`codex/reestructuracion-arquitectonica`. El [reporte final](REPORTE_11_VALIDACION_FINAL.md)
y la [matriz de aceptación](MATRIZ_ACEPTACION_FINAL.md) delimitan qué se verificó.
Los reportes 00–08 son antecedentes; la Tarea 09 fija la arquitectura consolidada
y la Tarea 10 propone un ERP futuro que todavía no existe.

## 1. Requisitos y responsabilidades

Usar Node.js 24.18 o superior, npm y Git para preparar el código, y un navegador
moderno para operar. El entorno validado y sus versiones exactas se registran en
el reporte final; otros entornos requieren su propia comprobación. La preparación
de dependencias puede usar Internet. La distribución compilada necesita Node,
recursos incluidos y sus archivos privados, sin npm ni herramientas del agente.

Para repetir también el test TLS sin omisiones, instalar OpenSSL y disponer de
`openssl` en PATH: solo genera el certificado sintético de esa prueba. El servidor
operativo no ejecuta esa CLI. En Windows, las comprobaciones de permisos y memoria
usan Windows PowerShell del sistema. La prueba de navegador utiliza Chrome instalado
o Chromium preparado con Playwright, según la selección declarada.

Seleccionar un directorio privado para datos, configuración y copias, fuera del
repositorio y de la carpeta reemplazable de instalación. No utilizar archivos de
pruebas como base real. El responsable debe custodiar acceso del SO, contraseñas,
respaldos y su recuperación; los permisos de archivo no equivalen a cifrado.

Esta versión escucha únicamente en `127.0.0.1`. No cambiar la escucha, abrir puertos,
habilitar CORS ni anteponer un proxy para exponerla sin otra evaluación. No ofrece
alta disponibilidad, sincronización entre equipos ni acceso multiempresa.

## 2. Preparar una copia limpia y verificar

Desde un directorio nuevo, sin sobrescribir otra instalación:

```powershell
git clone --single-branch --branch codex/reestructuracion-arquitectonica https://github.com/VicWaltzO/NutrequinePro.git NutrequineLocal
Set-Location NutrequineLocal
git rev-parse HEAD
Set-Location app
npm.cmd ci
npm.cmd run verify
```

Git se ejecuta desde la raíz; npm desde `app/`. En otros sistemas usar `npm`.
Cada comando debe terminar con salida cero antes del siguiente paso. `verify`
ejecuta pruebas, TypeScript general/servidor/cliente, ESLint, Prettier, compilación
y auditoría de distribución. El resultado comercial se calcula en backend.

Para probar navegador con datos exclusivamente sintéticos:

```powershell
npx.cmd playwright install chromium
npm.cmd run test:e2e
```

También se puede seleccionar Chrome instalado con
`$env:REGRESSION_BROWSER_CHANNEL='chrome'`. Esto es una herramienta de verificación,
no un requisito del servidor. Ejecutar E2E **después** de finalizar el build y no
en paralelo con comandos que reconstruyan `dist-node/`. Los tests crean bases
temporales privadas; evidencias en `outputs/`, excluidas de Git. Conservar sus logs,
capturas y trazas cuando se investigue un fallo.

La prueba adicional `tests/local-e2e/final-validation.test.mjs` mide consultas,
comandos, concurrencia, memoria y arranque; comprueba teclado y copia fría de acceso.
Puede repetirse aisladamente después del build mediante
`node --test tests/local-e2e/final-validation.test.mjs`. Sus tiempos describen una
muestra sintética pequeña, no un compromiso de rendimiento empresarial.

## 3. Preparar datos y administrador

Las rutas siguientes son ejemplos. Seleccionarlas explícitamente; su directorio
padre debe existir. La CLI crea un directorio privado nuevo y rechaza esquemas o
destinos incompatibles. **No usar `init` sobre una base existente**.

```powershell
npm.cmd run db:admin -- directory --directory "D:\NutrequinePrivado"
npm.cmd run db:admin -- init --database "D:\NutrequinePrivado\negocio.sqlite"
npm.cmd run db:admin -- verify --database "D:\NutrequinePrivado\negocio.sqlite"
```

Preparar mediante el procedimiento seguro del responsable un archivo JSON privado
con `user_id`, `name`, `login` y `password`. No existen contraseñas predeterminadas.
La contraseña exige al menos 15 caracteres y un máximo de 1024 bytes UTF-8. No ponerla
en argumentos, historial de terminal, Git, capturas o registros compartidos.

```powershell
Get-Content -Raw -LiteralPath "D:\NutrequinePrivado\provision.json" | npm.cmd run auth:prepare -- --database "D:\NutrequinePrivado\negocio.sqlite" --auth-database "D:\NutrequinePrivado\acceso.sqlite" --mode new
```

El modo `new` requiere un negocio vacío y crea únicamente el administrador explícito;
no introduce maestros ficticios. La configuración funcional se hace después por la
interfaz. Para una base histórica existe `link --authorize-link`, con autorización
del responsable, ID de un ADMIN histórico activo y destino de autenticación nuevo.
No se usa para eludir comprobaciones de identidad. Ver [instalación](INSTALACION_LOCAL.md).

## 4. Instalar, iniciar y detener

La compilación completa genera `dist-node/` con backend, frontend en `public-client/`,
dependencias operativas, herramientas SQLite, SQL histórico y licencias. Copiarla a
una carpeta nueva como `C:\NutrequineInstalado\app`, conservando la carpeta contenedora.
No copiar `node_modules` del checkout, datos, `.env`, fuentes privadas ni evidencias.
Para comprobar el artefacto antes de copiar: `npm.cmd run check:distribution`.

Crear una configuración privada con rutas absolutas:

```json
{
  "database": "D:\\NutrequinePrivado\\negocio.sqlite",
  "auth_database": "D:\\NutrequinePrivado\\acceso.sqlite",
  "port": 4317,
  "frontend_directory": "C:\\NutrequineInstalado\\app\\public-client"
}
```

Guardar como `D:\NutrequinePrivado\servidor.json` con permisos privados y ejecutar:

```powershell
node C:\NutrequineInstalado\app\server\main.mjs --config "D:\NutrequinePrivado\servidor.json"
```

El evento `LISTENING` confirma escucha. Abrir `http://127.0.0.1:4317`; no sustituir
por `localhost`, otra IP o un puerto distinto. El arranque exige ambas bases
preparadas; no crea datos, usuarios ni migraciones silenciosamente. Cliente y API
comparten origen. Las cookies las gestiona el navegador; no manipularlas ni guardar
tokens o contraseñas en almacenamiento web.

Cerrar sesión con **Salir** revoca esa sesión; no detiene el servidor. Para detener
el proceso utilizar Ctrl+C en su terminal, esperar la salida y confirmar que no hay
otro proceso de esa instalación. Conservar errores de cierre. En Windows los tests
ejercitan también terminación forzada del proceso y reapertura; no usarla como
procedimiento operativo normal si se puede cerrar ordenadamente.

Reiniciar con el mismo comando y configuración. Los datos y sesiones aún vigentes
persisten; sesiones expiradas/revocadas requieren autenticación. Desde el checkout,
`npm.cmd start -- --config RUTA_ABSOLUTA` usa el build; para desarrollar usar
`npm.cmd run dev -- --config RUTA_ABSOLUTA` con otras bases sintéticas. No operar
una base de negocio mediante el servidor de desarrollo.

## 5. Respaldo comercial

Detener el servidor y cualquier otro escritor. No copiar a mano una base activa,
especialmente si hay WAL. Elegir un destino nuevo y conservar el original:

```powershell
node C:\NutrequineInstalado\app\scripts\sqlite-admin.mjs verify --database "D:\NutrequinePrivado\negocio.sqlite"
node C:\NutrequineInstalado\app\scripts\sqlite-admin.mjs backup --database "D:\NutrequinePrivado\negocio.sqlite" --destination "D:\NutrequinePrivado\respaldo-001.sqlite"
node C:\NutrequineInstalado\app\scripts\sqlite-admin.mjs verify-backup --backup "D:\NutrequinePrivado\respaldo-001.sqlite"
```

Conservar el respaldo y su `.manifest.json` juntos, con controles de acceso y una
copia protegida fuera del equipo. Registrar fecha/zona, versión/commit, responsable
y resultado en inventario privado. El manifiesto verifica integridad y contenido;
no sustituye cifrado ni protege de un administrador que pueda alterar ambos archivos.
Nunca eliminar una copia o diagnóstico para ocultar un fallo.

## 6. Proteger autenticación y configuración

`acceso.sqlite` contiene hashes, sesiones y eventos de seguridad en un esquema
distinto: **no admite la CLI de respaldo comercial**. Protegerlo y proteger también
configuración, material TLS si se utiliza, manifiestos y las claves de cualquier
cifrado externo aprobado.

Una copia física requiere detener todos sus usuarios, comprobar cierre de conexiones
y conocer si existen auxiliares `-wal`, `-shm` o `-journal`. Si existen, no copiar
solo el archivo principal: conservar el conjunto y solicitar diagnóstico antes de
certificarlo. Con archivos cerrados y sin auxiliares, seleccionar un destino privado
nuevo, copiar sin sobrescribir, comparar SHA-256 y verificar SQLite de solo lectura.
Ver [procedimiento detallado](RESPALDO_RESTAURACION.md).

El ensayo final comprueba una copia fría con dos credenciales sintéticas y el mismo
negocio en su ruta canónica original. Esto no certifica recuperación de todas las
cuentas reales, pérdida completa del equipo ni traslado de negocio a otra ruta.
No editar el campo de vinculación de autenticación para hacer que una copia arranque.

## 7. Restaurar negocio en una ruta nueva

Con el servidor detenido y el original preservado:

```powershell
node C:\NutrequineInstalado\app\scripts\sqlite-admin.mjs restore --backup "D:\NutrequinePrivado\respaldo-001.sqlite" --destination "D:\NutrequinePrivado\negocio-recuperado.sqlite"
node C:\NutrequineInstalado\app\scripts\sqlite-admin.mjs verify --database "D:\NutrequinePrivado\negocio-recuperado.sqlite"
```

La base de autenticación está vinculada a la ruta comercial canónica. El acceso
anterior debe rechazarse para esa ruta nueva. Provisionar acceso nuevo, con permiso
del responsable y el **mismo ID histórico de ADMIN activo**, enviando un archivo
privado de provisión por stdin:

```powershell
Get-Content -Raw -LiteralPath "D:\NutrequinePrivado\provision-recuperacion.json" | node C:\NutrequineInstalado\app\server\admin.mjs --database "D:\NutrequinePrivado\negocio-recuperado.sqlite" --auth-database "D:\NutrequinePrivado\acceso-recuperado.sqlite" --mode link --authorize-link
```

Seleccionar explícitamente ambas rutas recuperadas en una configuración privada
nueva, iniciar y autenticar. Comparar IDs, revisión, fórmulas, auditoría, stock,
pagos y saldos antes de habilitar escrituras. Registrar una operación sintética en
el ensayo de recuperación, reiniciar y comprobar su permanencia. En operación real,
las operaciones de verificación deben acordarse con el responsable, sin insertar
clientes ficticios en producción. Recuperar las credenciales de otros usuarios por
la API ADMIN autorizada descrita en [backend local](REPORTE_07_BACKEND_NODE.md).

No sobrescribir originales ni mezclar una base de acceso de otra instalación. La
recuperación comercial y la recuperación organizacional completa de credenciales
son garantías distintas; esta última sigue pendiente de un procedimiento y ensayo
organizacional aprobados.

## 8. Diagnóstico y mantenimiento

| Síntoma                     | Comprobación y respuesta                                                                                                                         |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| No aparece `LISTENING`      | Revisar Node, rutas absolutas, permisos privados, preparación de esquema/acceso y puerto. Conservar salida; no inicializar otra base como atajo. |
| 401                         | Sesión ausente/expirada/revocada; autenticar y conservar formulario/request_id cuando la interfaz lo permita.                                    |
| 403                         | Confirmar mismo origen, CSRF y rol actual; no desactivar controles ni repetir automáticamente el comando.                                        |
| 400 / 413 / 415             | Revisar formato JSON, tamaño y tipo; no aumentar límites para ocultar una solicitud incorrecta.                                                  |
| 422 o conflicto de revisión | Corregir validación comercial o recargar datos; inspeccionar resultado antes de reintentar manualmente.                                          |
| 429                         | Respetar la espera de protección de login; investigar intentos repetidos.                                                                        |
| 503 / bloqueo SQLite        | Buscar otro escritor, copia o proceso; resolver bloqueo y conservar request_id para reintento idempotente. No borrar archivos de journal.        |
| Esquema incompatible        | Inspeccionar y respaldar; ejecutar migración explícita autorizada solo sobre el archivo seleccionado. No regenerar SQL histórico.                |
| Archivo público ausente     | Verificar build completo y `frontend_directory`; no servir la raíz del checkout para encontrar archivos.                                         |
| Lentitud                    | Registrar tamaño, concurrencia, tiempos, memoria y locks con datos sintéticos. El store carga estado completo; no asumir capacidad corporativa.  |

Diagnósticos del servidor informan categoría e ID de petición sin cuerpos ni secretos.
Relacionarlos con hora y operación; no publicar configuración, cookies, bases o
trazas privadas. El navegador puede mostrar rechazos 401/403 esperados durante login,
expiración y pruebas negativas; distinguirlos de errores JavaScript y fallos de red.

Para actualizar código: conservar versión y copias verificadas, revisar cambios,
preparar y verificar una distribución nueva, detener, sustituir solo instalación y
reanudar con archivos privados compatibles. Las migraciones se ejecutan explícitamente
tras respaldo y aprobación. Para revertir, comprobar compatibilidad de esquema;
retroceder binarios no deshace datos ni autoriza restaurar sobre el original.

No ejecutar `npm audit fix --force`, herramientas de generación sobre migraciones
históricas ni servidores auxiliares de administración como solución automática.
Revisar avisos de dependencias según su exposición real y repetir las verificaciones
relevantes tras cualquier corrección.
