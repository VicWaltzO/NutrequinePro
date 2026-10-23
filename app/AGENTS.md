# Instrucciones de desarrollo — Nutrequine Pro

Estas reglas se aplican a todas las tareas de desarrollo en este repositorio.

La aplicación operativa es React/Vite en `client/` y Fastify/Node en `server/`.
Las funcionalidades permanecen en `features/`, contratos y utilidades en `shared/`,
y persistencia SQLite en `lib/`. No reintroducir entradas Next, Workers ni identidades
simuladas. Consultar `docs/INSTALACION_LOCAL.md` para preparar bases privadas.
El servidor nunca crea datos o credenciales al arrancar.

## Informes de tareas

Guardar siempre los informes de tareas y auditoría en "docs/actualizacion-seguridad/" dentro de app/, incluidos los informes Txx_REPORTE.md. No usar docs/auditoria-local/ para informes nuevos.

## Al finalizar cada tarea

1. **Verificar el funcionamiento del código.** Revisar el diff y ejecutar las pruebas, la comprobación de tipos, el lint y la compilación que correspondan. El repositorio Git está en la carpeta padre; ejecutar los comandos de Git desde allí. Para cambios de código en esta aplicación, ejecutar los siguientes comandos desde `app/`:

   ```powershell
   npm.cmd test
   npm.cmd run check
   npm.cmd run lint
   npm.cmd run build
   npm.cmd run format:check
   npm.cmd run test:e2e
   ```

   En otros sistemas se puede usar `npm` en lugar de `npm.cmd`. Verificar también los flujos afectados cuando las pruebas automatizadas no los cubran. En cambios exclusivamente de documentación o configuración de Git, revisar el contenido, las exclusiones y `git diff --check`.

   `npm.cmd run verify` reúne pruebas, los tres chequeos TypeScript, lint, formato,
   build completo y auditoría de distribución. Ejecutar E2E después del build;
   preparar Playwright con `npx.cmd playwright install chromium` o seleccionar
   Chrome instalado mediante `REGRESSION_BROWSER_CHANNEL=chrome`.
   Las pruebas y los procedimientos de respaldo/restauración usan datos sintéticos
   externos al código. No incluir bases, configuración privada ni evidencias locales
   en `dist-node/`; los scripts reemplazan únicamente los directorios de build.

2. **Crear un commit descriptivo.** Incluir únicamente los archivos de la tarea, revisar lo preparado con `git diff --cached` y describir el cambio y su propósito. Respetar los cambios previos del usuario.

3. **Sincronizar con GitHub mediante `git push`**, siempre que existan un remoto correcto, autenticación y permisos de escritura. Usar la rama actual y su upstream; en el primer push establecerlo con `git push -u origin <rama>`. No usar push forzado ni sobrescribir trabajo remoto.

4. **Excluir credenciales y datos sensibles.** No incluir claves, tokens, contraseñas, archivos `.env`, claves privadas, bases de datos locales, volcados, datos personales de usuarios o clientes, ni registros o capturas que contengan información sensible. Revisar tanto los archivos preparados como los commits que se enviarán. `.gitignore` no protege archivos ya versionados; si se detecta información sensible en el historial que se enviaría, detener el push y comunicarlo.

5. **Informar del resultado.** Indicar las verificaciones realizadas, el commit creado y si GitHub quedó sincronizado. Si el push falla, informar la causa, conservar el commit local y explicar qué falta para sincronizar. No afirmar que hubo sincronización sin comprobarla.

**No realizar pushes de código con errores conocidos.** Si falla una verificación o no puede comprobarse el funcionamiento del código modificado, corregirlo y volver a verificar antes de hacer push. Si el bloqueo no puede resolverse, informar y dejar los cambios locales sin sincronizar.
