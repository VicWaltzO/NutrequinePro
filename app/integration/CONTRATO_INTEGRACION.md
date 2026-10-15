# Contrato de integración local — versión documental 1

La API existente sigue sin prefijo `/v1`. Esta documentación no añade endpoints,
entidades empresariales, SSO ni una API del ERP anfitrión. Fijar una versión/commit
de Nutrequine; una incompatibilidad futura exige revisar consumidores y regresiones.
El contrato comercial autoritativo permanece en el backend, no en el portal.

## Proceso, disponibilidad y rutas

Entrada: `node app/server/main.mjs --config RUTA_PRIVADA_ABSOLUTA`, desde cualquier
directorio. Node >=24.18, SQLite incluido. La configuración exige `database`,
`auth_database`, `port`; opcional `frontend_directory`, y el par `tls_key` /
`tls_certificate`. Las rutas son absolutas, existentes y privadas según su función.
No se admiten opciones arbitrarias, bootstrap ni migraciones al iniciar.
El proceso escucha únicamente en `127.0.0.1:port`. Emite `LISTENING` al estar listo;
un fallo de preparación termina con error. No analizar mensajes internos como API.

Sin cookies, `GET /api/auth/session` responde **401** en una instancia lista.
Es una sonda existente que no modifica negocio ni revela inventario, usuarios,
rutas o versiones. Un 200 implica sesión autenticada; no reutilizar cookies para
monitorizar. Un 503, conexión rechazada o timeout no acredita disponibilidad.
No se añade un health endpoint. No usar login como sonda (tiene limitación de intentos).

| Método | Ruta backend            | Respuesta satisfactoria / responsabilidad                                               |
| ------ | ----------------------- | --------------------------------------------------------------------------------------- |
| POST   | `/api/auth/login`       | JSON `{login,password}`; devuelve `{actor,csrf_token,expires_at}` y cookie de sesión.   |
| GET    | `/api/auth/session`     | Sesión actual y CSRF; 401 sin sesión válida.                                            |
| POST   | `/api/auth/logout`      | JSON `{}`, cookie y CSRF; revoca la sesión y borra cookie.                              |
| GET    | `/api/state`            | `{state,actor}`; requiere usuario activo. Contiene datos comerciales privados.          |
| POST   | `/api/command`          | `{type,payload,request_id}`; devuelve `{state,result}`. Autoriza y calcula en servidor. |
| POST   | `/api/auth/credentials` | ADMIN, CSRF y JSON `{user_id,login,password}` para un usuario comercial existente.      |
| POST   | `/api/auth/revoke`      | ADMIN, CSRF y JSON `{user_id}`; revoca sesiones de la identidad existente.              |

En B, anteponer el prefijo publicado a estas rutas solo en el navegador/proxy.
El backend continúa recibiendo las rutas originales. El frontend se compila con
el mismo prefijo; recursos JS/CSS/imágenes y peticiones usan ese montaje.
La navegación interna conserva hashes. Las rutas privadas no reciben fallback SPA.

## Sesión, permisos y CSRF

Cookies `nutrequine_<hash de las rutas de instalación>` administradas por el
navegador: HttpOnly, SameSite=Strict, Path=/api, Max-Age=28800 y Secure cuando el
backend sirve HTTPS real. Tokens opacos de 32 bytes, persistidos como hash; CSRF
de 64 caracteres hexadecimales en memoria del cliente. No se usa almacenamiento
web para credenciales/tokens. La caducidad es absoluta (8 horas); cambios de rol,
actividad, credencial, revocación y logout invalidan accesos conforme al backend.
No compartir archivos de acceso ni cookies con otro módulo.

Toda escritura exige cookie válida, `Origin` exacto, `Content-Type: application/json`
UTF-8 sin compresión y `X-CSRF-Token` de la sesión. Host debe ser exactamente
`127.0.0.1:puerto`, `trustProxy` sigue desactivado. No se aceptan cabeceras como
`X-User-Id`, `X-Authenticated-User-Id` u `oai-authenticated-user-*` para identidad.
Los roles ADMIN/OPERATOR/VIEWER y el actor se consultan en backend; no conceder
privilegios desde menús, rutas o campos enviados por el ERP.

Autenticación prueba identidad; autorización decide si esa identidad puede ejecutar
la operación. Abrir un enlace no autentica. El portal de ejemplo no conoce la
contraseña, no inyecta identidad ni crea usuarios. SSO requiere contrato real del
proveedor, vínculo de actores históricos, revocación y nuevas pruebas antes de
modificar la autenticación. Los roles corporativos propuestos en Tarea 10 no existen.

## Comandos, errores y reintentos

Importes en céntimos enteros, pesos en gramos enteros; conservar snapshots,
relaciones, revisión, historial e identificadores. Los formularios existentes
determinan payloads; el ERP no debe escribir directamente en SQLite ni acoplarse
a tablas internas. No se publican aquí payloads nuevos para funciones inexistentes.

Cada operación lleva `request_id` estable. Su ámbito de idempotencia es el actor
y el registro auditado existente. Una respuesta perdida no justifica generar otro
ID ni cambiar el payload del mismo intento. No hay reintentos automáticos en cliente
o proxy. Tras un conflicto de revisión, recargar y reconciliar; el backend rechaza
la revisión obsoleta sin sobrescribir. No hay transacción distribuida con el ERP.

| HTTP      | Tratamiento                                                                                                 |
| --------- | ----------------------------------------------------------------------------------------------------------- |
| 400       | Solicitud, JSON, UTF-8, ruta o cookie ambiguos; corregir solicitud.                                         |
| 401       | Sesión ausente/expirada; reautenticar conservando formulario e ID cuando corresponde.                       |
| 403       | Origen/CSRF o permiso; no repetir automáticamente ni elevar rol.                                            |
| 404 / 405 | Ruta inexistente o método no permitido; comprobar montaje y versión.                                        |
| 413 / 415 | Tamaño >250000 bytes o formato no admitido; corregir cuerpo.                                                |
| 422       | Validación comercial; mostrar `{error}` y corregir datos/reconciliar revisión.                              |
| 429       | Intentos de acceso limitados; esperar sin bucle de login.                                                   |
| 503       | Servicio/SQLite ocupado; no asumir rollback por un fallo de red, conservar ID y consultar estado.           |
| 502       | Solo proxy de ejemplo: upstream no disponible/respuesta inválida; no implica que un comando no se confirmó. |

Los errores esperados devuelven JSON `{error:string}`; fallos de transporte pueden
no entregar JSON. El cliente distingue estado y no interpreta un HTML como estado
comercial. No registrar contraseñas, cookies, CSRF ni cuerpos comerciales en el ERP.

## Responsabilidades del anfitrión

Gestionar procesos/puertos/versiones, datos y ACL, copias verificadas, ventanas de
actualización, confianza del portal y política de recuperación. Conservar SQL
histórico y las 27 tablas comerciales sin fusionarlas con otras empresas.
No delegar el cálculo comercial al portal. No montar directorios privados como
estáticos, no habilitar CORS abierto y no usar `0.0.0.0`.

En A, el anfitrión configura un enlace local sin credenciales y el módulo conserva
su origen. Las cookies no aíslan por puerto; su nombre depende de las bases, pero
dos aplicaciones del mismo equipo requieren igualmente confianza en ese entorno.
En B, portal y módulo comparten origen: XSS o código malicioso del anfitrión podría
consultar sesión y ejecutar acciones del usuario. Un prefijo o Cookie Path **no es
una frontera de seguridad entre aplicaciones**. Preferir A si no se puede otorgar
esa confianza; para otro perímetro, diseñar orígenes separados y auditar el ERP real.

El ejemplo B fija HTTP loopback en ambos saltos. Valida Host/Origin externos antes
de traducirlos a la autoridad loopback del backend, filtra cookies ajenas al módulo,
remonta Path=/api al prefijo, conserva HttpOnly/SameSite, CSRF y errores, y rechaza
cabeceras de identidad/proxy y rutas ambiguas. No soporta WebSocket/HMR, TLS remoto,
balanceo, CORS, múltiples empresas ni autorización corporativa. No copiarlo como
gateway público ni trasladar automáticamente esta confianza a un proxy de terceros.

Acceso remoto requerirá conocer topología/proveedor, HTTPS, secretos, cabeceras
confiables, política de cookies y revisión independiente. No está aprobado ni
habilitado por esta tarea. No existe dependencia o contrato de Control Granja.
