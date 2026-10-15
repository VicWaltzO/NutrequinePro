# Instalación y ejecución local

Requiere Node.js **24.18 o superior**, npm, Git y un navegador moderno. Usar una
cuenta del sistema operativo controlada. Los datos deben quedar en un directorio
privado fuera del checkout y de la carpeta reemplazable de instalación.
La preparación de paquetes y navegador de pruebas puede descargar archivos;
el servidor y el cliente compilados operan por loopback sin descargas al arrancar.

## Preparar código y herramientas

Desde la raíz del repositorio:

```powershell
git switch main
git pull --ff-only origin main
cd app
npm.cmd ci
npm.cmd run verify
```

En Linux/macOS usar `npm`. Las rutas siguientes son ejemplos que debe seleccionar
el responsable de la instalación; no apuntan a bases operativas predeterminadas.
Los comandos rechazan destinos existentes o inseguros en lugar de sobrescribirlos.

## Inicio rápido de demostración en Windows 11

Instalar previamente Git, Google Chrome y Node.js **24.18 o superior** (incluye npm).
Abrir PowerShell normal; no hace falta ejecutarlo como administrador. Estos bloques
son compatibles con Windows PowerShell 5.1 y PowerShell 7. La instalación descarga
dependencias; la aplicación compilada funciona después por loopback.

### 1. Descargar y compilar desde main

Usar una carpeta nueva; `git clone` no sobrescribe un clon existente:

```powershell
$ErrorActionPreference = 'Stop'
$codigo = Join-Path ([Environment]::GetFolderPath('MyDocuments')) 'NutrequinePro'
git clone --branch main https://github.com/VicWaltzO/NutrequinePro.git $codigo
if ($LASTEXITCODE -ne 0) { throw 'No se pudo clonar. No continúe.' }
Set-Location -LiteralPath (Join-Path $codigo 'app')
npm.cmd ci
if ($LASTEXITCODE -ne 0) { throw 'Falló la instalación de dependencias.' }
npm.cmd run build
if ($LASTEXITCODE -ne 0) { throw 'Falló la compilación.' }
```

### 2. Crear una base de demostración y su administrador

Continuar en la misma ventana, dentro de `app/`. Se crea una instalación **nueva**
en LocalAppData; no apunta a bases empresariales. Si el directorio ya existe,
detenerse y usar las instrucciones de reinicio, sin volver a ejecutar init/new.

```powershell
$ErrorActionPreference = 'Stop'
$datos = Join-Path $env:LOCALAPPDATA 'NutrequinePro-Demo'
if (Test-Path -LiteralPath $datos) { throw 'La demostración ya existe. Use las instrucciones de reinicio.' }
node scripts/sqlite-admin.mjs directory --directory $datos
if ($LASTEXITCODE -ne 0) { throw 'No se pudo crear el directorio privado.' }
$base = Join-Path $datos 'negocio.sqlite'
$acceso = Join-Path $datos 'acceso.sqlite'
node scripts/sqlite-admin.mjs init --database $base
if ($LASTEXITCODE -ne 0) { throw 'No se pudo preparar SQLite.' }
$secreto = Read-Host 'Elija una contraseña de al menos 15 caracteres para admin.local' -AsSecureString
$credencial = [System.Management.Automation.PSCredential]::new('admin.local', $secreto)
$encodingAnterior = $OutputEncoding
try {
    $OutputEncoding = [System.Text.UTF8Encoding]::new($false)
    $provision = @{
        user_id = [guid]::NewGuid().ToString()
        name = 'Administrador de demostración'
        login = 'admin.local'
        password = $credencial.GetNetworkCredential().Password
    } | ConvertTo-Json -Compress
    $provision | node server/admin.mts --database $base --auth-database $acceso --mode new
    if ($LASTEXITCODE -ne 0) { throw 'No se creó el administrador. Conserve el intento para diagnóstico; no use otra base por accidente.' }
} finally {
    $provision = $null
    $credencial = $null
    $secreto = $null
    $OutputEncoding = $encodingAnterior
}
$config = Join-Path $datos 'servidor.json'
$ajustes = @{
    database = $base
    auth_database = $acceso
    port = 4317
    frontend_directory = (Join-Path (Get-Location).Path 'dist-node/public-client')
} | ConvertTo-Json
[IO.File]::WriteAllText($config, $ajustes, [Text.UTF8Encoding]::new($false))
Write-Host 'Administrador: admin.local. La contraseña es la que acaba de elegir.'
```

La contraseña pasa por stdin y no se escribe en un archivo, argumentos o Git.
UTF-8 explícito evita alterar contraseñas con acentos en PowerShell 5.1.
La configuración no lleva BOM y hereda los permisos del directorio privado.
No hay contraseña predeterminada. Si la provisión falla, conservar los archivos
parciales y el diagnóstico; no borrar bases ni repetir new sobre una existente.

### 3. Ejecutar y abrir Google Chrome

```powershell
npm.cmd start -- --config $config
```

Dejar esa terminal abierta. Tras el mensaje LISTENING, abrir Google Chrome y pegar
**http://127.0.0.1:4317/**. Entrar como **admin.local** con la contraseña elegida.
No usar localhost ni una dirección LAN. Si el puerto está ocupado, no detener otro
servicio: elegir un puerto libre en el JSON privado y usarlo también en la URL.

La base nueva empieza sin clientes, ventas ni fórmulas inventadas. Para guardar
datos sintéticos con los formularios reales: **Clientes → Nuevo cliente**, nombre
**Cliente demostración**, Guardar. En **Gastos → Registrar gasto**, registrar
**Gasto de demostración**, categoría Otros y **Monto pagado S/** de **0.01**
(un céntimo), con la fecha actual.
Las vistas y navegación están disponibles; producción/ventas requieren configurar
sus productos, sedes e insumos mediante los flujos existentes. No se cargan bases
de terceros ni se activa un modo de usuario simulado.

### 4. Reiniciar sin perder datos

Ctrl+C en la terminal del servidor y esperar a que termine. En una nueva ventana:

```powershell
$codigo = Join-Path ([Environment]::GetFolderPath('MyDocuments')) 'NutrequinePro'
Set-Location -LiteralPath (Join-Path $codigo 'app')
$config = Join-Path $env:LOCALAPPDATA 'NutrequinePro-Demo/servidor.json'
npm.cmd start -- --config $config
```

Recargar Chrome y comprobar el cliente y el gasto. No repetir clone, init ni new.
Los datos/configuración están fuera del repositorio, pero conviene conservar el
clon en su ruta: el JSON apunta a su frontend compilado. Respaldar antes de cualquier
actualización; no copiar datos privados al código ni a dist-node.

Comprobación del procedimiento (15 de octubre de 2026): Windows PowerShell 5.1,
Chrome, provisión new sobre una base vacía y contraseña aleatoria con acento;
nueve vistas accesibles, cliente y gasto de un céntimo guardados por formulario,
estado idéntico tras reiniciar el proceso, sesión recuperada y logout con 401.
La prueba usó un directorio temporal privado y un puerto loopback libre en lugar
del nombre/puerto de ejemplo. No solicitó recursos externos durante la navegación.
Las evidencias y bases sintéticas se conservaron fuera de los archivos publicados.

## Crear una instalación nueva

La CLI crea el último nivel del directorio con permisos privados. Su padre debe
existir. Seleccionar una ruta nueva; no cambiar permisos de un directorio ajeno.

```powershell
npm.cmd run db:admin -- directory --directory "D:\NutrequinePrivado"
npm.cmd run db:admin -- init --database "D:\NutrequinePrivado\negocio.sqlite"
npm.cmd run db:admin -- verify --database "D:\NutrequinePrivado\negocio.sqlite"
```

`init` prepara las tablas sin crear identidades ni registros comerciales. No es
un paso para abrir una base existente. Para adoptar una copia histórica autorizada,
inspeccionar y respaldar primero, detener el servidor y seguir el procedimiento
de [base de datos](RESPALDO_RESTAURACION.md). No importar datos reales en pruebas.

Crear mediante el procedimiento seguro de la organización un archivo privado
JSON con `user_id`, `name`, `login` y `password`. La contraseña necesita al menos
15 caracteres y hasta 1024 bytes UTF-8. Nunca escribirla en argumentos, Git,
capturas o logs. Enviar ese archivo exclusivamente por stdin:

```powershell
$encodingAnterior = $OutputEncoding
try {
    $OutputEncoding = [System.Text.UTF8Encoding]::new($false)
    Get-Content -Raw -Encoding UTF8 -LiteralPath "D:\NutrequinePrivado\provision.json" | npm.cmd run auth:prepare -- --database "D:\NutrequinePrivado\negocio.sqlite" --auth-database "D:\NutrequinePrivado\acceso.sqlite" --mode new
    if ($LASTEXITCODE -ne 0) { throw 'Falló la provisión del administrador.' }
} finally {
    $OutputEncoding = $encodingAnterior
}
```

El modo `new` requiere un negocio vacío; no crea maestros ficticios ni usuarios
predeterminados. `link` es para vincular un ADMIN histórico activo con autorización
expresa del responsable, conservando su ID; exige `--authorize-link`. La base de
acceso de destino debe ser nueva. No usar el modo new para recuperar una cuenta.
La gestión posterior de credenciales y revocación usa la API ADMIN autenticada
descrita en el [reporte 07](REPORTE_07_BACKEND_NODE.md).

Crear `D:\NutrequinePrivado\servidor.json` con permisos privados:

```json
{
  "database": "D:\\NutrequinePrivado\\negocio.sqlite",
  "auth_database": "D:\\NutrequinePrivado\\acceso.sqlite",
  "port": 4317,
  "frontend_directory": "C:\\NutrequineLocal\\app\\public-client"
}
```

## Compilar y ejecutar

```powershell
npm.cmd run build
```

Copiar el contenido de `dist-node/` a una nueva carpeta de instalación, por ejemplo
`C:\NutrequineLocal\app`. Conservar la carpeta contenedora y la subcarpeta app;
el control de datos privados excluye ese árbol de código completo. La distribución
contiene dependencias de runtime, recursos, SQL histórico, avisos y herramientas
administrativas. No necesita node_modules del checkout ni herramientas de desarrollo.

```powershell
node C:\NutrequineLocal\app\server\main.mjs --config "D:\NutrequinePrivado\servidor.json"
```

Acceder a `http://127.0.0.1:4317`. Se admite exactamente ese Host/origen y el
servidor escucha exclusivamente en loopback. No sustituir por una dirección LAN
ni abrir CORS. Cliente, API y cookies comparten origen; CSRF permanece en memoria.
Salir desde el panel revoca la sesión. Ctrl+C cierra el proceso; reiniciar con
la misma configuración conserva datos y sesiones vigentes.

Desde el checkout, `npm.cmd start -- --config RUTA_PRIVADA_ABSOLUTA` inicia el
servidor compilado. `npm.cmd run dev -- --config RUTA_PRIVADA_ABSOLUTA` usa Vite
como middleware de Fastify con HMR bajo el mismo origen. En desarrollo se ignora
`frontend_directory`. La base y credenciales deben existir antes del arranque.
Las opciones TLS `tls_certificate`/`tls_key` siguen disponibles; no desactivar
validaciones de certificados para operar.

## Pruebas y recuperación

```powershell
npm.cmd test
npm.cmd run check
npm.cmd run lint
npm.cmd run format:check
npm.cmd run build
npx.cmd playwright install chromium
npm.cmd run test:e2e
```

La instalación de Chromium es preparación de desarrollo, no una dependencia de
operación. Para usar Chrome instalado, establecer `REGRESSION_BROWSER_CHANNEL=chrome`.
Los E2E crean bases y contraseñas sintéticas aisladas. Capturas, trazas y logs son
locales ignorados. No ejecutar esta batería contra bases o credenciales reales.

Consultar [respaldo y restauración](RESPALDO_RESTAURACION.md),
[arquitectura](ARQUITECTURA.md) y [desarrollo](GUIA_DESARROLLO.md). No sustituir una
base por una copia sin verificar su manifiesto, relaciones e historial; no copiar
manualmente una base activa ni inicializar silenciosamente una ruta ausente.
