# Respaldo y restauración SQLite local

Usar Node 24.18+ y directorios privados fuera del código y de la instalación.
Seleccionar siempre rutas explícitas. La CLI rechaza sobrescrituras, esquemas
desconocidos, hashes alterados y destinos inseguros; no inicializa una base ausente
cuando se esperaba abrirla.

## Inspección y respaldo comercial

Desde `app/`, detener escrituras antes del respaldo operativo. La API SQLite de
backup soporta una instantánea consistente activa, incluido WAL, pero en journal
convencional puede bloquear commits. No copiar manualmente el archivo principal
de una base activa.

```powershell
npm.cmd run db:admin -- inspect --database "D:\NutrequinePrivado\negocio.sqlite"
npm.cmd run db:admin -- verify --database "D:\NutrequinePrivado\negocio.sqlite"
npm.cmd run db:admin -- backup --database "D:\NutrequinePrivado\negocio.sqlite" --destination "D:\NutrequinePrivado\respaldo-nuevo.sqlite"
npm.cmd run db:admin -- verify-backup --backup "D:\NutrequinePrivado\respaldo-nuevo.sqlite"
```

Conservar la copia y su archivo `.manifest.json`. El manifiesto registra versión,
hash de SQL, integridad, relaciones, recuentos y contenido. SHA-256 detecta cambios
accidentales; no reemplaza permisos, cifrado ni autorización del responsable.

Registrar en un inventario privado fecha/zona horaria, commit, versión Node/SQLite,
ruta seleccionada, responsable y resultado. No publicar ese inventario ni sus datos.
Conservar también una copia protegida fuera del equipo y comprobar su recuperación.

## Restaurar en un destino nuevo

Detener el servidor y conservar intacta la base original. Verificar antes la copia
y seleccionar una ruta nueva en un directorio privado existente.

```powershell
npm.cmd run db:admin -- restore --backup "D:\NutrequinePrivado\respaldo-nuevo.sqlite" --destination "D:\NutrequinePrivado\negocio-recuperado.sqlite"
npm.cmd run db:admin -- verify --database "D:\NutrequinePrivado\negocio-recuperado.sqlite"
```

La autenticación está vinculada a la ruta canónica del negocio. Seleccionar la
copia restaurada con el archivo de acceso anterior debe impedir el arranque.
Para recuperar en una ruta nueva, el responsable debe provisionar un archivo de
acceso nuevo con `link --authorize-link`, vinculado al mismo ADMIN histórico activo,
mediante el [procedimiento de instalación](INSTALACION_LOCAL.md). Gestionar después
las credenciales de los demás usuarios por la API ADMIN autorizada. Este paso
conserva IDs y roles comerciales y requiere autorización del responsable local.

Actualizar explícitamente ambas rutas en la configuración privada; iniciar con
una versión compatible, iniciar sesión y comparar operaciones, revisión, auditoría,
céntimos, gramos y saldos. Conservar intactos negocio y acceso originales.
L15 usa la CLI distribuida, comprueba el rechazo por vinculación incorrecta,
provisiona acceso nuevo por stdin y exige igualdad del estado comercial completo.
La validación final amplía L15 con un registro posterior a la recuperación y otro
reinicio, comprobando persistencia y que el archivo comercial original no cambió.

## Migraciones y adopción autorizada

El arranque no ejecuta migraciones. Tras inspeccionar y respaldar una copia
histórica autorizada, con servidor detenido:

```powershell
npm.cmd run db:admin -- migrate --database "D:\NutrequinePrivado\copia-historica.sqlite" --apply --adopt
npm.cmd run db:admin -- verify --database "D:\NutrequinePrivado\copia-historica.sqlite"
```

`--adopt` reconoce únicamente esquema y metadatos históricos conocidos.
`--initialize-empty` permite preparar un archivo existente vacío seleccionado
explícitamente; no usarlo sobre una base parcial o desconocida. `init` crea una
base nueva. Las migraciones SQL aplicadas y su journal permanecen inmutables.

## Credenciales y configuración

La base de acceso es independiente y su esquema no es el comercial: **no pasarla
a la CLI de respaldo comercial**. Guardar credenciales y configuración como
material privado con permisos y un procedimiento de copia consistente propio.
Para una copia física, detener todos los procesos que utilicen autenticación y
preservar sus archivos auxiliares si existen; verificar hashes y permisos del
conjunto. Eliminar una cuenta o reinicializar acceso no sustituye su recuperación.
Un ensayo organizacional completo de recuperación de credenciales sigue pendiente.

La Tarea 11 prueba una copia física cerrada, sin auxiliares activos, con SHA-256 e
integridad SQLite, y el acceso de dos credenciales sintéticas usando esa copia
contra el negocio en su misma ruta original. No modifica el vínculo canónico ni
demuestra recuperación completa de todas las cuentas reales al trasladar el negocio.
Consultar la [guía operativa final](GUIA_OPERATIVA_FINAL.md) y el
[reporte de validación](REPORTE_11_VALIDACION_FINAL.md) para alcance y evidencia.

La restauración comercial conserva IDs; una base de acceso debe corresponder
a esos usuarios. No usar un administrador de pruebas o una identidad simulada.
La provisión y vinculación autorizada se describen en [instalación](INSTALACION_LOCAL.md).

## Distribución sin herramientas de desarrollo

La distribución incluye `scripts/sqlite-admin.mjs` y sus módulos. Desde una
instalación preparada se puede ejecutar, sin npm ni paquetes de desarrollo:

```powershell
node C:\NutrequineLocal\app\scripts\sqlite-admin.mjs verify --database "D:\NutrequinePrivado\negocio.sqlite"
```

Los procedimientos anteriores de plataforma quedan recuperables en Git en
`a229671` y los reportes históricos. No son requisitos del sistema actual.
No se ha migrado ni recuperado ninguna base real durante la Tarea 09.
