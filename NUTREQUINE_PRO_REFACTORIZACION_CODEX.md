# Nutrequine Pro | Refactorización profesional del repositorio
**Especificación de trabajo para Codex**  
**Fecha:** 2026-10-09  
**Repositorio:** https://github.com/VicWaltzO/NutrequinePro  
**Raíz de Git:** raíz del repositorio. **Aplicación:** carpeta 'app/'.

## 0. Instrucción ejecutiva
Actúa como ingeniero senior de software encargado de **refactorizar el proyecto actual, no reescribirlo**. Haz el trabajo efectivo en el repositorio: formato, arquitectura, modularización, pruebas, documentación y resolución reproducible de errores locales. El propósito es que un segundo programador pueda entender, revisar, mantener y ampliar Nutrequine Pro sin depender del autor original.

**Invariantes absolutos:**
- Preservar todas las funcionalidades implementadas, reglas comerciales, rutas y experiencia actual de usuario; no realizar un rediseño visual en esta tarea.
- No borrar ni reinicializar bases D1, migraciones aplicadas, datos operativos, credenciales o archivos ajenos al trabajo.
- No alterar lógica financiera o semántica de dominio con el pretexto de «limpiar código».
- No introducir endpoints inseguros, atajos de autenticación ni roles permisivos.
- No forzar pushes ni escribir directamente en 'main'. Trabajar en una rama específica y dejar cambios revisables.
- No declarar que algo funciona si no se ha probado. Si un paso está bloqueado, explicar exactamente por qué.
- Leer y cumplir 'AGENTS.md' y 'app/AGENTS.md' antes de intervenir.

## 1. Estado observado (verificar nuevamente)
En el repositorio se han identificado archivos difíciles de mantener por concentración extrema de instrucciones:
- 'app/app/ui/AdminApp.tsx': alrededor de 28.5 KB distribuidos en 68 líneas; algunas líneas superan los 3,000 caracteres.
- 'app/app/ui/ProductionForms.tsx': alrededor de 13 KB distribuidos en 22 líneas.
- 'app/app/ui/SaleForms.tsx' y 'app/app/ui/shared.tsx': componentes e instrucciones comprimidos.
- 'app/lib/domain.mjs': concentra un volumen significativo de reglas comerciales.
La aplicación **sí tiene separación básica** entre 'app/', 'app/ui/', 'lib/', 'db/' y 'drizzle/'. No afirmes que carece totalmente de arquitectura.

En una ejecución local apareció un error de pila que involucra D1, 'loadState', 'ensureState' y '/api/state'. El texto completo del error no está confirmado. **Reproducir antes de diagnosticar**. No atribuirlo a priori a código comprimido, Cloudflare ni migraciones.

## 2. Fase A: auditoría y línea base
1. Inspeccionar la estructura completa, configuración real y dependencias. Identificar framework, enrutamiento y configuración de ejecución existente. Respetar React, TypeScript, Vinext, Cloudflare Workers, Cloudflare D1/SQLite, Drizzle y scripts propios.
2. Leer 'README.md', 'app/README.md', 'app/docs/ESPECIFICACION_MAESTRA_MVP.md', 'app/docs/ACEPTACION.md' y reglas AGENTS.
3. Identificar rutas de llamadas: interfaz -> API -> autenticación/autorización -> dominio -> persistencia -> D1. Construir un mapa de dependencias, responsabilidad y riesgo.
4. Registrar estado Git (rama, commits, archivos sin seguimiento, cambios del usuario). Jamás sobrescribir trabajo ajeno.
5. Crear rama de trabajo desde la referencia adecuada, sin perder modificaciones legítimas. Si hay cambios no confirmados, detener operaciones que pudieran sobrescribirlos y explicar el plan seguro.
6. Instalar dependencias de modo reproducible desde 'app/' y ejecutar línea base:
   - npm.cmd ci
   - npm.cmd test
   - npm.cmd run check
   - npm.cmd run lint
   - npm.cmd run build
   En Linux utilizar 'npm' en lugar de 'npm.cmd'.
7. Registrar resultados **antes** de modificar código, incluyendo pruebas que ya fallaban. Si no se puede ejecutar una verificación, consignar el motivo.
8. Entregar diagnóstico inicial en 'app/docs/REFACTORIZACION_AUDITORIA.md' con riesgos y orden propuesto.

No te limites a la auditoría: continúa con la implementación de las fases siguientes cuando el entorno lo permita.

## 3. Fase B: formato y convenciones
- Instalar y configurar, solo si procede, Prettier como dependencia de desarrollo fijada en el lockfile, con scripts 'format' y 'format:check'; establecer reglas consistentes de sangría, comillas, espacios, JSX y longitud de línea orientativa de 100–120 caracteres.
- No formatear librerías de terceros, ficheros generados, carpetas de build, 'node_modules', 'dist' ni migraciones SQL históricas aplicadas.
- Evitar múltiples sentencias en una línea y expresiones JSX monolíticas. Usar nombres inteligibles y manejo explícito de errores.
- Separar los commits exclusivamente de formato de los commits con cambios de estructura o lógica. No mezclar ambos en diffs gigantes.
- Mantener o mejorar las reglas de ESLint; no silenciar errores mediante excepciones masivas. Respetar el tratamiento deliberado de componentes vendorizados.
- Verificar test, check, lint y build tras el formateo. Comparar comportamiento, no solo el aspecto del código.

## 4. Fase C: arquitectura modular orientada a funcionalidades
Adoptar **modularidad por funcionalidades** donde simplifique el mantenimiento. La estructura siguiente es orientativa; primero investigar las rutas reales para no romper el framework.

~~~text
app/
  app/                         # Enrutamiento y API existente
  features/
    ventas/
      components/
      hooks/
      domain/
    cobranza/
    produccion/
    inventario/
    clientes/
    gastos/
    balance/
    configuracion/
  shared/
    ui/
    lib/
    types/
  lib/                         # Infraestructura y núcleo transversal necesarios
  db/
  drizzle/
  tests/
  docs/
~~~

Criterios:
- Mantener las rutas públicas y contratos API existentes.
- Separar vistas, formularios, lógica de presentación, estado e interacciones, casos de uso, invariantes de dominio, autorización y persistencia.
- Evitar dependencias circulares y módulos que importen internamente la UI para calcular negocio.
- El módulo de dominio no debe depender de componentes React ni del navegador.
- Centralizar reglas compartidas; **no duplicarlas** en frontend y backend con resultados divergentes. El servidor conserva la autoridad para validar y recalcular.
- No introducir capas ceremoniales, microservicios, repositorios genéricos innecesarios o librerías por moda.
- Documentar la dirección permitida de dependencias; facilitar que dos personas trabajen en features distintas.

### 4.1 Componentes prioritarios
- Refactorizar 'app/app/ui/AdminApp.tsx': dejar un shell/orquestador entendible y mover cada vista, modal y bloque de interacción a su módulo razonable.
- Refactorizar 'ProductionForms.tsx', 'SaleForms.tsx', 'shared.tsx' y formularios relacionados. Extraer subcomponentes lógicos y utilidades sin alterar los campos, validaciones o flujo actual.
- Revisar 'app/lib/domain.mjs' para extraer reglas por responsabilidad solo cuando pueda demostrarse equivalencia mediante pruebas; conservar un origen de verdad de cálculos, estados y autorizaciones.
- Revisar 'app/lib/persistence.mjs' y 'app/lib/store.ts' para definir responsabilidades nítidas sin perder transacciones atómicas, control de revisión optimista e idempotencia.
- No imponer conversión total de archivos '.mjs' a TypeScript durante esta fase si incrementa el riesgo. Mejoras incrementales, justificadas y verificadas.

## 5. Preservación expresa de reglas comerciales
Tomar como fuente de verdad la **especificación maestra y la matriz de aceptación del repositorio**, no esta lista abreviada.

### Producción
Preservar fórmulas/versiones, núcleos y pesos, BASE, entradas de stock, costos teóricos versus cobros reales, descuentos por ingrediente, gastos extraordinarios, conciliaciones, rectificaciones, cierres y anulaciones auditadas.

### Ventas
Preservar precio de lista y precio acordado, contado/crédito, pagos parciales en contado, ventas futuras con stock insuficiente y su vinculación a producción planificada, entrega total como acción diferenciada, devoluciones, rectificaciones, estados e historial.

### Cobranza y saldo a favor
- Una venta puede recibir varios pagos, sin duplicar ingresos.
- Los excedentes se registran como saldo a favor y su aplicación posterior **no genera otro ingreso de caja**.
- Mantener aplicaciones/reversiones auditadas y consistencia con el saldo de cada venta.
- Preservar idempotencia en reintentos y protección ante concurrencia.

### Inventario y gastos
- No descontar stock dos veces al reservar y entregar.
- Conciliar sacos y kilos físicos contra las operaciones comerciales.
- Conservar entradas, salidas, correcciones, relaciones con producción y gastos sin doble contabilización.
- Mantener balances comerciales rotulados como estimados cuando corresponde, sin inventar contabilidad formal.

### Integridad y acceso
- Importes internos en **céntimos enteros** y pesos en **gramos enteros**; proteger redondeos, límites y cálculos.
- Autorización y comprobación de rol en servidor, no solo botones ocultos en UI.
- Operaciones registradas con motivos y trazabilidad, sin destrucción de historial.
- Transacciones atómicas, verificación de revisiones y ausencia de duplicados por reintento.
- Mantener los límites funcionales documentados; no inventar políticas de reembolso, proveedores ni entregas parciales.

## 6. Fase D: diagnosticar y reparar ejecución local D1
Investigar reproduciblemente el error observado en acceso a D1:
1. Levantar la aplicación con 'npm.cmd run dev' desde 'app/'.
2. Obtener excepción completa, no solo la traza truncada.
3. Verificar versión de Node (mínimo 22.13), dependencias, configuración local de Vinext/Vite y bindings de Cloudflare.
4. Inspeccionar 'app/scripts/run-framework.mjs', 'prepare-local-db.mjs', 'local-bindings.mjs', configuración de Wrangler y rutas '/api/state' y '/api/command'.
5. Confirmar que CLI de migraciones y servidor utilicen la **misma identidad de base y misma carpeta persistente**.
6. Confirmar presencia del binding 'DB', aplicación de migraciones y compatibilidad entre driver y runtime.
7. Hacer pruebas sobre una base de desarrollo **aislada** y documentada si se requiere limpiar el entorno. No borrar 'app/.wrangler/state/' ni reejecutar SQL inicial sobre datos existentes.
8. Aplicar la corrección mínima comprobable. Preservar el perfil 'managed-linux' y la ejecución alojada además del perfil local portátil.
9. Probar carga de panel, petición GET '/api/state', envío autorizado de una operación, persistencia tras recargar, y reinicio del servidor.

Si el error no es reproducible, indicar expresamente la limitación y agregar diagnósticos no sensibles que ayuden a reproducirlo.

## 7. Fase E: calidad, seguridad y pruebas
- Corregir errores de TypeScript y ESLint atribuibles al código propio; nunca «resolverlos» desactivando reglas globalmente o con 'any' indiscriminado.
- Eliminar importaciones no usadas, código muerto y duplicación comprobada.
- Conservar contratos y mensajes útiles al usuario; mejorar captura de errores sin filtrar datos privados.
- Ejecutar los escenarios existentes de 'app/docs/ACEPTACION.md'. Ampliar pruebas en zonas cambiadas: cálculos, autorizaciones, pagos, excedentes, devoluciones, inventario, transacciones y concurrencia.
- Incluir pruebas de integración D1 cuando sea posible; usar fixture/DB aislada, nunca producción.
- No modificar una prueba para «hacer pasar» una regresión. Resolver primero la causa.
- Mantener las rutas y el diseño visual existentes. La landing pública premium es **otro proyecto/fase**.
- Prohibido cargar secretos, archivos '.env', SQLite local, archivos de despliegue, capturas privadas o datos de clientes a Git.

## 8. Fase F: documentación y colaboración
Crear/actualizar:
- 'app/docs/ARQUITECTURA.md': árbol real, funciones de módulos, diagrama de flujo de datos, límites, dependencias y decisiones de arquitectura.
- 'app/docs/GUIA_DESARROLLO.md': requisitos, instalación Windows, comandos de tests/format/check/build, ejecución local, D1, problemas frecuentes.
- 'app/docs/REFACTORIZACION_RESULTADOS.md': línea base, antes/después, rutas migradas, pruebas, errores pendientes y justificación de cambios.
- 'CONTRIBUTING.md': convención de ramas, commits, PR, revisión, protección de secretos y resolución de conflictos.
- README donde corresponda, sin contradecir el método real de arranque ('npm.cmd run dev' prepara la DB local si así sigue siendo).

Pensar en el practicante que se incorporará: un nuevo colaborador debe encontrar rápidamente cómo cambiar una regla de ventas sin revisar toda la aplicación. Evitar documentación inventada.

## 9. Flujo de cambios y control de riesgos
1. Crear rama de refactorización, por ejemplo 'refactor/modularizacion-profesional'. No modificar directamente 'main'.
2. Ejecutar fases en pequeños cambios reversibles con commits descriptivos.
3. Revisar 'git diff --check' y las pruebas después de cada bloque significativo.
4. No forzar 'git push'. No sobrescribir trabajo remoto; inspeccionar estado antes de publicar.
5. Seguir las reglas de 'AGENTS.md'; **si una validación fracasa, no publicar código con fallos conocidos**.
6. Dejar un pull request (si tienes permisos y el entorno lo permite) para revisión humana. No fusionarlo automáticamente.
7. Si una decisión requiere cambiar una regla comercial, esquema aplicado o datos existentes, detener solo esa intervención y pedir aprobación explícita; continuar con las partes independientes y seguras.

## 10. Criterios objetivos de aceptación
Considera terminada la tarea solamente si:
- Los archivos afectados son legibles, con componentes organizados y sin líneas desmesuradas.
- Un colaborador puede localizar ventas, cobranza, producción e inventario sin revisar un componente monolítico.
- El diseño y comportamiento de usuario siguen equivalentes.
- Las reglas del negocio documentadas tienen pruebas de regresión.
- Tipos, lint, tests, formateo y compilación pasan, o se documentan limitaciones preexistentes y **no se publican cambios defectuosos**.
- La ejecución local funciona y se comprobó D1, o queda un diagnóstico reproducible y honesto del bloqueo.
- No se han perdido datos ni alterado migraciones históricas.
- Hay documentación real de arquitectura y un PR/branch que se pueda revisar.

## 11. Informe final en español
Entregar:
1. Diagnóstico inicial con errores medidos.
2. Estructura final y decisiones adoptadas.
3. Lista de archivos refactorizados y compromisos asumidos.
4. Diferencias observables antes/después.
5. Resultados de 'test', 'check', 'lint', 'build', formato y arranque local; indicar «no ejecutado» cuando corresponda.
6. Causa raíz y solución del error D1, o razón por la que no pudo reproducirse.
7. Cambios que afectan comportamiento, aunque sean intencionales.
8. Rama, commits, enlace al PR y estado de push **solo si efectivamente existen**.
9. Instrucciones exactas para ejecutar en Windows.
10. Deuda técnica restante y riesgos.

**Orden de prioridad:** preservar integridad comercial y datos > corregir defectos de ejecución > cubrir regresiones > hacer el código legible > modularizar con criterio > documentar y habilitar colaboración.

**Comienza por auditar y después implementa, sin reemplazar esta tarea por una lista de sugerencias.**
