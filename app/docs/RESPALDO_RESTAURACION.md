# Respaldo y restauración de D1

Procedimiento preparado el 14/10/2026 para la rama
`codex/reestructuracion-arquitectonica`. Ejecutar los comandos desde `app/`.
Preparar este documento no ejecuta una recuperación ni accede a producción.

## Identificar el entorno

D1 local usa el binding `DB` y la identidad de `wrangler.local.json`.
La persistencia es `NUTREQUINE_LOCAL_STATE_DIR` o `.wrangler/state`; SQLite
reside bajo `v3/d1`. La base alojada tiene otro binding administrado por Sites:
el UUID de ceros de la configuración local no identifica producción.

Antes de cualquier cambio de esquema, registrar en un inventario privado fecha
con zona horaria, commit, versión de Node/Wrangler, ruta o identidad de la base,
migraciones aplicadas, recuentos por tabla y responsable. Conservar la revisión
de `settings` y los recuentos de auditoría y operaciones para la comparación.
Nunca guardar registros de clientes, credenciales, dumps o IDs privados en Git.
Las migraciones aplicadas permanecen inmutables.

## Respaldo físico local

Detener con Ctrl+C todos los servidores y procesos que utilicen esa persistencia.
No copiar una base activa: el archivo principal puede depender de WAL/SHM.
Copiar el directorio completo, incluidos archivos auxiliares y ledger, sin mover
ni borrar el original. El destino siguiente queda ignorado por Git; trasladar
otra copia a almacenamiento privado protegido fuera del equipo.

```powershell
$ErrorActionPreference = 'Stop'
$stateRoot = if ($env:NUTREQUINE_LOCAL_STATE_DIR) {
  [IO.Path]::GetFullPath($env:NUTREQUINE_LOCAL_STATE_DIR)
} else {
  [IO.Path]::GetFullPath('.wrangler/state')
}
if (!(Test-Path -LiteralPath $stateRoot -PathType Container)) {
  throw 'No existe la persistencia seleccionada; no iniciar dev para crearla.'
}
$backupRoot = [IO.Path]::GetFullPath(('backups/d1-' + (Get-Date -Format 'yyyyMMdd-HHmmss-fff')))
if (Test-Path -LiteralPath $backupRoot) { throw 'El destino ya existe.' }
if ($backupRoot.StartsWith($stateRoot.TrimEnd('\') + '\', [StringComparison]::OrdinalIgnoreCase)) {
  throw 'El respaldo no puede estar dentro de la persistencia.'
}
New-Item -ItemType Directory -Path $backupRoot | Out-Null
Copy-Item -LiteralPath $stateRoot -Destination (Join-Path $backupRoot 'state') -Recurse -Force
$copyRoot = Join-Path $backupRoot 'state'
$manifest = @(Get-ChildItem -LiteralPath $stateRoot -File -Recurse -Force | ForEach-Object {
  $relative = $_.FullName.Substring($stateRoot.TrimEnd('\').Length + 1)
  $hash = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash
  $copied = Join-Path $copyRoot $relative
  if ((Get-FileHash -LiteralPath $copied -Algorithm SHA256).Hash -ne $hash) {
    throw "Copia inconsistente: $relative"
  }
  [pscustomobject]@{ Path = $relative; SHA256 = $hash; Bytes = $_.Length }
})
if ($manifest.Count -eq 0) { throw 'Persistencia vacía: respaldo inválido.' }
ConvertTo-Json -InputObject @($manifest) | Set-Content -LiteralPath (Join-Path $backupRoot 'manifest.json') -Encoding utf8
git -C .. rev-parse HEAD | Set-Content -LiteralPath (Join-Path $backupRoot 'commit.txt') -Encoding utf8
Write-Output "Respaldo verificado: $backupRoot"
```

Guardar también, en el inventario privado, la configuración efectiva y las
versiones. Un respaldo solo es recuperable si se conserva la identidad local y
un checkout compatible con su esquema. El manifiesto detecta cambios accidentales;
no sustituye controles de acceso o cifrado del almacenamiento.

## Restauración local en una ruta nueva

Usar la misma sesión del respaldo o establecer `$backupRoot` con la ruta elegida.
Mantener el servidor detenido. Recuperar primero con el commit anotado, antes de
probar código nuevo. No aplicar migraciones ni iniciar `dev` hasta validar la copia.

```powershell
$ErrorActionPreference = 'Stop'
$restoreRoot = [IO.Path]::GetFullPath(('.wrangler/restauracion-' + (Get-Date -Format 'yyyyMMdd-HHmmss-fff')))
if (Test-Path -LiteralPath $restoreRoot) { throw 'La ruta de recuperación ya existe.' }
$copyRoot = Join-Path $backupRoot 'state'
$manifest = @(Get-Content -LiteralPath (Join-Path $backupRoot 'manifest.json') -Raw | ConvertFrom-Json)
if ($manifest.Count -eq 0) { throw 'Manifiesto vacío.' }
foreach ($entry in $manifest) {
  if ((Get-FileHash -LiteralPath (Join-Path $copyRoot $entry.Path) -Algorithm SHA256).Hash -ne $entry.SHA256) {
    throw 'El respaldo no coincide con su manifiesto.'
  }
}
Copy-Item -LiteralPath $copyRoot -Destination $restoreRoot -Recurse -Force
$restoredFiles = @(Get-ChildItem -LiteralPath $restoreRoot -File -Recurse -Force)
if ($restoredFiles.Count -ne $manifest.Count) { throw 'Cantidad de archivos diferente.' }
foreach ($entry in $manifest) {
  if ((Get-FileHash -LiteralPath (Join-Path $restoreRoot $entry.Path) -Algorithm SHA256).Hash -ne $entry.SHA256) {
    throw 'La restauración no coincide con su manifiesto.'
  }
}
node --import ./scripts/sites-env.mjs node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config wrangler.local.json --persist-to "$restoreRoot" --command "PRAGMA quick_check; PRAGMA foreign_key_check; SELECT name FROM sqlite_schema WHERE type='table' ORDER BY name;"
if ($LASTEXITCODE -ne 0) { throw 'Falló la inspección de la base restaurada.' }
```

`quick_check` debe devolver `ok` y `foreign_key_check` ninguna fila. Comparar las
27 tablas de aplicación y sus índices, recuentos, revisión y ledger con el
inventario. Si existe `d1_migrations`, consultar `SELECT name FROM d1_migrations
ORDER BY id`; una base histórica sin ledger requiere el tratamiento documentado
en [la guía de desarrollo](GUIA_DESARROLLO.md), no una importación inicial ciega.
Un código de salida cero por sí solo no verifica los resultados de los PRAGMA.

Después de la validación, seleccionar la copia para el servidor portable:

```powershell
$previousStateDir = $env:NUTREQUINE_LOCAL_STATE_DIR
$env:NUTREQUINE_LOCAL_STATE_DIR = $restoreRoot
npm.cmd run dev
```

Verificar acceso, carga de operaciones y auditoría, inventario y balance;
reiniciar en la misma ruta y confirmar persistencia. `dev` puede preparar
migraciones e inicializar maestros, por eso esta comprobación se hace sobre la
copia ya validada y con código compatible. `npm start` usa la ruta default y no
sirve para este ensayo. La base original permanece disponible.

Para volver, detener el servidor y restablecer la selección anterior:

```powershell
if ($null -eq $previousStateDir) {
  Remove-Item Env:NUTREQUINE_LOCAL_STATE_DIR -ErrorAction SilentlyContinue
} else {
  $env:NUTREQUINE_LOCAL_STATE_DIR = $previousStateDir
}
```

Esto elimina únicamente una variable de entorno, ningún archivo. No sustituir
una base por otra ni borrar una ruta como parte del procedimiento.

## Base alojada y recuperación de producción

Identificar primero la cuenta, base, entorno y mecanismo de acceso reales con
el propietario de Sites. No usar `wrangler.local.json` ni asumir que el acceso
al sitio concede administración D1. Esta tarea no respalda ni restaura producción.

Cuando exista acceso administrativo, preparar una ventana sin escrituras y
guardar en privado un export completo con `wrangler d1 export <BASE_REAL>
--remote --output=<RUTA_PRIVADA.sql>` y la configuración efectiva del entorno.
Comprobar la salida, el tamaño y SHA256; ensayar la importación con `d1 execute
--file` en una base vacía y aislada, nunca sobre una base con operaciones.
El archivo SQL también contiene datos sensibles; almacenarlo fuera del repositorio.
Comparar esquema, ledger y recuentos: no asumir que un export contiene todas las
tablas internas de D1. Véase [importación y exportación oficial de D1](https://developers.cloudflare.com/d1/best-practices/import-export-data/).

En bases compatibles, registrar el bookmark actual con `wrangler d1 time-travel
info <BASE_REAL>` antes del cambio. Time Travel restaura la base en su sitio y
puede cancelar transacciones; usarlo solo con autorización para la recuperación,
escrituras suspendidas y el punto elegido verificado. Recuperar mediante
`wrangler d1 time-travel restore <BASE_REAL> --bookmark=<BOOKMARK_VERIFICADO>`.
Guardar el bookmark previo que permite deshacer la recuperación, validar datos
y desplegar código compatible antes de reabrir escrituras. La retención depende
del plan y debe comprobarse al preparar la ventana. Véase [Time Travel oficial](https://developers.cloudflare.com/d1/reference/time-travel/).

## Criterio para iniciar la reestructuración

Disponer de un respaldo verificado del entorno que se vaya a modificar, una
restauración ensayada en aislamiento, pruebas base registradas y compatibilidad
de código/esquema documentada. Tomar otro respaldo antes de cada migración.
Si falla una comprobación, conservar original, copia y diagnóstico privado y
detener la intervención. Definir con el propietario frecuencia, retención y
responsable de los respaldos reales antes de cambios operativos.
