# Colaboración en Nutrequine Pro

Git vive en esta carpeta y la aplicación en `app/`. Leer ambos `AGENTS.md`,
la [arquitectura](app/docs/ARQUITECTURA.md), la
[guía de desarrollo](app/docs/GUIA_DESARROLLO.md) y los escenarios de aceptación.
Las reglas comerciales requieren trazabilidad y deben conservar datos históricos.

## Ramas y coordinación

Cada desarrollador trabaja en una rama `codex/<cambio-concreto>` independiente de
`main`. Acordar funcionalidades distintas (por ejemplo ventas y producción) para
reducir conflictos. Avisar antes de modificar contratos de `shared/types`, núcleo
de dominio, persistencia, configuración o migraciones que afecten al otro trabajo.

Revisar `git status` antes de comenzar. Si existen cambios de otra persona,
preservarlos y usar un checkout separado cuando sea necesario. No usar `reset
--hard`, `clean`, borrados o stashes de cambios ajenos para conseguir una carpeta
limpia. No realizar push directo a `main` ni push forzado.

## Convenciones y commits

- Implementar dentro de `features/<funcionalidad>`; usar `shared` solo para piezas
  reutilizables. Dominio puro sin React, HTTP ni controladores SQLite; persistencia sin presentación.
- Mantener TypeScript estricto y contratos explícitos. No duplicar cálculos de
  céntimos, gramos, deuda o stock en los formularios.
- Ejecutar Prettier; separar formato masivo de cambios funcionales.
- Git conserva LF para código y documentación compartidos mediante `.gitattributes`.
- Crear commits pequeños y descriptivos en español. Explicar propósito y efecto;
  separar correcciones de bugs de refactorizaciones sin cambio comercial.
- Preparar rutas específicas con `git add`, revisar `git diff --cached --check`
  y el diff. No agregar capturas, paquetes de despliegue, bases, credenciales ni
  datos personales. Los cambios previos del usuario quedan fuera de la tarea.
- No editar migraciones históricas. Una evolución necesaria requiere una nueva
  migración, prueba aislada y revisión del impacto sobre datos existentes.

Desde `app/`, antes de enviar código:

```powershell
npm.cmd run format
npm.cmd run verify
npm.cmd run test:e2e
```

Después, desde la raíz, crear el commit revisado y ejecutar
`git push -u origin codex/<rama>` en el primer envío. Si falla un check, corregirlo
antes del push; si la sincronización falla, conservar los commits y comunicarlo.

## Pull requests y revisión

Abrir un PR hacia `main`, preferiblemente borrador mientras falte revisión.
Describir el problema, comportamiento resultante, módulos afectados, pruebas
ejecutadas y límites reales. Incluir un ejemplo antes/después si hay un cambio
funcional; no declarar pruebas no ejecutadas. En una refactorización confirmar
preservación de reglas, diseño, rutas, historia y datos.

La otra persona revisa permisos, precisión monetaria, crédito sin doble caja,
stock sin doble descuento, snapshots, idempotencia, rollback y concurrencia según
el cambio. GitHub Actions ejecuta `verify` con el lockfile en Node 24. Esperar
checks satisfactorios y revisión antes de fusionar. El workflow implementa el
control; la obligatoriedad mediante protección de `main` depende de configurar
las reglas del repositorio en GitHub y no se cambia automáticamente.

## Conflictos

Con el trabajo propio guardado en commits, obtener cambios remotos y fusionar
`origin/main` en la rama propia. Resolver por responsabilidad y significado;
no aceptar en bloque una versión que suprima validaciones o historial. Coordinar
conflictos en contratos compartidos y migraciones con el autor del otro cambio.
Ejecutar nuevamente `verify` y los flujos afectados antes de enviar la resolución.

Cada desarrollador debe usar su propia base local. Compartir código y migraciones,
no SQLite ni registros de clientes. El despliegue del sitio requiere una tarea
explícita y conserva el mecanismo existente de publicación y acceso.
