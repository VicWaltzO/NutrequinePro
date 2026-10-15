# Nutrequine Pro

El repositorio Git se encuentra en esta carpeta raíz. El código de la aplicación se encuentra en `app/`. Ejecutar los comandos de Git desde la raíz y los comandos de npm desde `app/`.

La arquitectura principal es React/Vite (`app/client/`), Fastify/Node (`app/server/`)
y SQLite local. Los datos y credenciales se preparan explícitamente fuera del código;
seguir `app/docs/INSTALACION_LOCAL.md`. Los informes 01–08 son antecedentes históricos.

Seguir las instrucciones de `app/AGENTS.md` al finalizar cada tarea: verificar el funcionamiento del código, crear un commit descriptivo, ejecutar `git push` hacia GitHub cuando haya permisos, excluir credenciales y datos sensibles, e informar si la sincronización falla.

No realizar pushes de código que presente errores conocidos. No incluir en commits ni pushes las capturas, archivos de despliegue u otros datos locales situados fuera del repositorio de la aplicación.
