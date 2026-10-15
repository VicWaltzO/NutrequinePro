# Nutrequine Pro como módulo autónomo

Este módulo es una aplicación local de una empresa: React/Vite, Node/Fastify y
SQLite. No es un SDK de ERP, una biblioteca de entidades ni un servicio público.
Su dominio comercial no necesita modificaciones para ejecutar los dos ejemplos.
No contiene Control Granja, identidad corporativa ni aislamiento multiempresa.

## Empezar desde otro repositorio

Requiere Git, Node **24.18 o superior** y npm para construir. Node incluye SQLite;
no instalar D1, un servicio SQL ni un controlador nativo adicional. Para ejecutar
la distribución solo se requieren Node y un navegador. La instalación de paquetes
puede usar Internet; el arranque de la distribución no descarga recursos.

Desde el repositorio anfitrión, elegir una carpeta nueva (ejemplo PowerShell):

```powershell
git clone https://github.com/VicWaltzO/NutrequinePro.git "modulos/Nutrequine Pro"
cd "modulos/Nutrequine Pro"
git checkout COMMIT_APROBADO
cd app
npm.cmd ci
npm.cmd run verify
npm.cmd run test:e2e
```

Seleccionar un commit aprobado que incluya Tarea 12. En Linux/macOS usar `npm`.
Un clon dentro de otro repositorio sigue siendo un repositorio Git independiente:
el responsable debe elegir submódulo, copia de fuentes sin `.git` o gestión externa
de versiones. No añadir accidentalmente un repositorio anidado como si fueran
archivos ordinarios. Los paquetes npm se instalan en el `app/` de Nutrequine;
no se requiere convertir el ERP en monorepositorio ni compartir sus node_modules.

## Elegir modo y compilar

**A, recomendado:** aplicación independiente enlazada por una URL local configurada.
Conserva servidor, origen, autenticación y almacenamiento propios.

```powershell
npm.cmd run build
```

**B, opcional local:** build para `/modulos/nutrequine/`, servido a través del
proxy de demostración. Es una alternativa que exige confiar en el código del
portal que comparte origen. No es aislamiento entre aplicaciones del mismo origen.

```powershell
npm.cmd run build -- --base-path /modulos/nutrequine/
```

La ruta admite segmentos ASCII en minúsculas, comienza y termina en `/`. Es un
parámetro de compilación, no una opción nueva del backend ni un dato del cliente.
Cambiarla exige recompilar. No mezclar frontend de A con proxy B. Desarrollo Vite
sigue en `/` con `npm.cmd run dev -- --config RUTA_PRIVADA_ABSOLUTA`; el ejemplo
prefijado se comprueba con el build de producción, sin reenviar HMR.

## Crear el paquete

Después del build:

```powershell
npm.cmd run check:distribution
npm.cmd run package:module -- --destination "C:\Entregas\Nutrequine-12"
```

El padre debe existir y el destino debe ser **nuevo, absoluto y externo al
repositorio**. No se sobrescribe ni se mezcla con instalaciones existentes.
Se audita `dist-node/`, se copia a `Nutrequine-12/app/` y se compara su inventario
SHA-256 con el original. `MODULE-MANIFEST.json` incluye rutas relativas, tamaños
y hashes; no incluye rutas privadas, fecha variable ni credenciales. Dos paquetes
del mismo artefacto tienen el mismo manifiesto. No se promete igualdad de metadatos
del sistema de archivos ni una firma criptográfica de procedencia.

El directorio portable contiene frontend compilado, backend compilado, dependencias
de ejecución y licencias, SQL histórico/CLI SQLite, herramientas de provisión y esta
documentación/ejemplo. No copiar el checkout, node_modules de desarrollo, outputs,
bases, acceso.sqlite, configuración, logs o capturas. Node no se incluye en el paquete.
React, React DOM, Lucide, Scheduler y Tailwind conservan sus licencias además de
las dependencias del backend. El ejecutable Node procede de la instalación del operador.

## Preparar una instalación nueva

Ejemplo desde `C:\Entregas\Nutrequine-12` con directorio privado externo:

```powershell
node app/scripts/sqlite-admin.mjs directory --directory "D:\NutrequinePrivado"
node app/scripts/sqlite-admin.mjs init --database "D:\NutrequinePrivado\negocio.sqlite"
node app/scripts/sqlite-admin.mjs verify --database "D:\NutrequinePrivado\negocio.sqlite"
Get-Content -Raw -LiteralPath "D:\NutrequinePrivado\provision.json" | node app/server/admin.mjs --database "D:\NutrequinePrivado\negocio.sqlite" --auth-database "D:\NutrequinePrivado\acceso.sqlite" --mode new
```

El archivo `provision.json` debe crearlo el responsable con permisos privados:
objeto con `user_id`, `name`, `login`, `password`; contraseña de al menos 15 caracteres,
máximo 1024 bytes UTF-8. No hay credencial predeterminada. Introducirla por stdin,
nunca como argumento, en Git ni en el portal. La aplicación vacía no crea maestros
comerciales ficticios. Las pruebas usan bases y credenciales sintéticas separadas.

Seleccionar un directorio privado nuevo cuyo padre exista. La CLI aplica/verifica
ACL de Windows o permisos Unix 0700/0600; no reutilizar un directorio compartido.
Crear allí `servidor.json`, también privado:

```json
{
  "database": "D:\\NutrequinePrivado\\negocio.sqlite",
  "auth_database": "D:\\NutrequinePrivado\\acceso.sqlite",
  "port": 4317,
  "frontend_directory": "C:\\Entregas\\Nutrequine-12\\app\\public-client"
}
```

```powershell
node app/server/main.mjs --config "D:\NutrequinePrivado\servidor.json"
```

Abrir `http://127.0.0.1:4317/` para A. Para B seguir el [portal](EJEMPLO_PORTAL.md).
El puerto no tiene valor implícito: se elige en el JSON; no usar `localhost` ni
habilitar LAN. El arranque exige bases preparadas y acceso válido; no migra ni
inicializa silenciosamente. El usuario mantiene los roles ADMIN/OPERATOR/VIEWER.

## Detener, respaldar y actualizar

Ctrl+C solicita cierre. Esperar que termine antes de reemplazar archivos. Conservar
siempre bases, configuración y claves fuera de **todo el contenedor** del módulo
y del repositorio anfitrión. No mover la base comercial: las credenciales están
vinculadas a su ruta canónica exacta. No editar ese vínculo para eludir controles.

Con el servicio detenido y desde una distribución compatible:

```powershell
node app/scripts/sqlite-admin.mjs backup --database "D:\NutrequinePrivado\negocio.sqlite" --destination "D:\NutrequinePrivado\respaldo-nuevo.sqlite"
node app/scripts/sqlite-admin.mjs verify-backup --backup "D:\NutrequinePrivado\respaldo-nuevo.sqlite"
```

Para ensayar una recuperación, elegir un destino de negocio nuevo, verificarlo y
seleccionar un archivo de acceso nuevo. Con autorización expresa del responsable:

```powershell
node app/scripts/sqlite-admin.mjs restore --backup "D:\NutrequinePrivado\respaldo-nuevo.sqlite" --destination "D:\NutrequinePrivado\recuperado.sqlite"
node app/scripts/sqlite-admin.mjs verify --database "D:\NutrequinePrivado\recuperado.sqlite"
Get-Content -Raw -LiteralPath "D:\NutrequinePrivado\vinculacion.json" | node app/server/admin.mjs --database "D:\NutrequinePrivado\recuperado.sqlite" --auth-database "D:\NutrequinePrivado\acceso-recuperado.sqlite" --mode link --authorize-link
```

`vinculacion.json` contiene el `user_id` de un ADMIN histórico activo, `login` y
una contraseña nueva, siempre por stdin. Actualizar el JSON privado para ambas
rutas recuperadas. El ADMIN deberá preparar los demás accesos autorizados mediante
la API existente; las sesiones del archivo anterior no se transfieren al nuevo.
No ejecutar `new` sobre un negocio histórico ni editar identificadores/vínculos.

El respaldo comercial no incorpora la base de autenticación. Conservar una copia
fría de acceso/configuración según la política del responsable, sin WAL/journal
pendientes, permisos privados y validación; no compartirla entre módulos. Restaurar
el negocio a otra ruta requiere el procedimiento autorizado de vinculación y
recuperación de accesos; no es copiar dos archivos a cualquier ruta.

Construir y auditar una entrega nueva; detener el proceso, conservar la entrega
anterior y seleccionar la nueva ruta `frontend_directory` en la configuración
privada. Iniciar la nueva entrada con las **mismas rutas de datos**. Para reemplazar
en el mismo directorio, retirar primero el código anterior completo, conservándolo
para rollback, e instalar el paquete limpio; nunca superponer archivos ni borrar
el directorio privado. Verificar login, consulta y una operación autorizada.

Antes de una versión con migraciones, inspeccionar y respaldar; aplicar únicamente
las migraciones aprobadas mediante la CLI. El servidor se niega a arrancar si
faltan. Un rollback de código solo es válido si el esquema y los formatos siguen
siendo compatibles; no prometer downgrade automático. Tarea 12 prueba reemplazo
del mismo esquema con artefactos reproducibles, no una futura migración desconocida.

Consultar [contrato](CONTRATO_INTEGRACION.md) y [portal mínimo](EJEMPLO_PORTAL.md).
