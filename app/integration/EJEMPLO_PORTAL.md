# Portal anfitrión mínimo

`portal.mjs` muestra una navegación genérica, no un ERP. No incorpora empresas,
usuarios corporativos, Control Granja, formularios comerciales nuevos ni SSO.
Funciona con Node, sin instalar paquetes ni descargar recursos. La página contiene
un enlace accesible; la autenticación ocurre en Nutrequine real.

## A — enlace, opción prioritaria

Preparar y arrancar la distribución raíz según [README](README.md), por ejemplo
en 4317. En otra terminal, desde el paquete:

```powershell
node app/integration/portal.mjs --mode A --module-url http://127.0.0.1:4317/ --port 4400
```

Abrir `http://127.0.0.1:4400/` y pulsar **Abrir Nutrequine Pro**. El navegador pasa
al origen 4317; login, sesión y operaciones se resuelven allí. El portal no recibe
cookies ni datos de Nutrequine, no implementa un proxy en A y no tiene API propia.
Una navegación corporativa real puede usar un enlace normal configurable, sin
iframe, credenciales en URL ni cabeceras de identidad. El ejemplo admite únicamente
HTTP 127.0.0.1 con puerto explícito. Un ERP remoto puede tener políticas de navegación
y Fetch Metadata diferentes: no se declara comprobado ni autorizado ese caso.

## B — montaje por proxy local

Construir la variante prefijada y preparar el paquete nuevo:

```powershell
npm.cmd run build -- --base-path /modulos/nutrequine/
npm.cmd run package:module -- --destination "C:\Entregas\Nutrequine-prefijo"
```

Arrancar su backend en 4317 con `frontend_directory` apuntando al `public-client`
de **esa misma entrega**. En otra terminal:

```powershell
node C:\Entregas\Nutrequine-prefijo\app\integration\portal.mjs --mode B --module-url http://127.0.0.1:4317/ --port 4400 --prefix /modulos/nutrequine/
```

Abrir el portal en 4400 y su enlace. Frontend, recursos y API del navegador usan
`http://127.0.0.1:4400/modulos/nutrequine/`. El proxy retira el prefijo antes del
salto a 4317. No abrir directamente el backend de un build prefijado: sus recursos
esperan el montaje publicado. La API interna sí conserva sus rutas originales.
No existe fallback a `/api` raíz del portal. Los puertos deben ser diferentes.

El proxy permite solo Host/origen exactos de 4400 y se vincula a 127.0.0.1.
Las escrituras exigen Origin de 4400 antes de transformarlo al origen interno 4317;
CSRF se transmite sin alterarlo ni fabricarlo. Cookies Nutrequine pasan al backend
y las demás se filtran; la respuesta cambia solo Path al prefijo y conserva atributos.
Los dos saltos tienen límites de tiempo/tamaño, no hay reintento de comandos y el
backend mantiene su propia validación Host/Origin/CSRF y roles. `/server/*`, bases,
configuración y rutas codificadas/traversal no se publican.

No interponer otro proxy que vuelva a escribir Origin/cookies sin auditarlo. Las
restricciones y el riesgo del origen compartido están en el [contrato](CONTRATO_INTEGRACION.md).
Las cookies y el código del ERP no se convierten en autorización Nutrequine.

## Verificar y mantener

La suite `npm run test:e2e` conserva los recorridos previos y añade ejemplos reales
A/B, login/formulario, escenario comercial portable, sesión/CSRF, aislamiento de
rutas privadas, persistencia/reinicio y reemplazo de código con datos externos.
Se ejecuta después de `npm run build`; la prueba B genera su frontend prefijado
en una carpeta temporal independiente, sin sustituir el build A de otras pruebas.
Usa Playwright y exclusivamente bases sintéticas. Logs/PNG quedan en outputs,
nunca en el paquete o en Git. La prueba por navegador no certifica firewall del SO.

Para detener el portal, Ctrl+C. Detener también Nutrequine y seguir el procedimiento
de actualización del README; reiniciar el portal con URL/prefijo correspondientes.
El ERP definitivo deberá decidir cómo supervisar procesos, ofrecer el enlace,
aprobar el origen compartido y eventualmente federar identidad. Este ejemplo no
resuelve esas decisiones por un sistema anfitrión todavía desconocido.
