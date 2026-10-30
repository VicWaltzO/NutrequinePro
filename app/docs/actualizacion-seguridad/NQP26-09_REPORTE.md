# NQP26-09 · Clientes homónimos

2026-10-29, America/Bogota. Desarrollo y validación exclusivamente con datos sintéticos. Base independiente: `origin/main` `fabe5c93e4f15899586f8db30a60939c8c95635a`; rama `codex/nqp26-09-clientes-homonimos`. PR18/19 ya estaban fusionados por acciones anteriores al iniciar esta tarea. El parche de rendimiento 08 se mantiene separado; 09 no incorpora sus cambios ni habilita reservas. Sin merge, despliegue ni operación empresarial.

## Diagnóstico y decisión

Diagnóstico previo y matriz inicial guardados antes del código en esta carpeta. Se leyeron tarea Kit/02_TAREAS/NQP26-09.md, UX-02, los documentos adjuntos, AGENTS, contratos 01/T03 y archivos efectivos. La brecha estaba en los dos formularios y el dominio: detector exacto, casilla tardía en Clientes y ausencia de prueba de los candidatos revisados.

Matcher compartido en `features/clientes/domain/name-matches.mjs`, separado de normalize general. Normaliza acentos, caso, espacios y puntuación como separador para comparar; no modifica nombres guardados. Etiqueta exactitud normalizada o semejanza. La semejanza acepta mismos tokens reordenados o una inserción/eliminación/sustitución/transposición adyacente en un único token alfabético de al menos cinco letras, con igual número de tokens y al menos dos. No compara aproximadamente números, nombres cortos de un token, abreviaturas ni tokens añadidos: frontera conservadora para controlar falsos positivos. Un aviso nunca fusiona ni rechaza automáticamente homónimos confirmados.

Incluye activos, inactivos y retirados; el historial puede explicar una coincidencia y no debe duplicarse inadvertidamente. Solo se excluye el mismo id editado. La clave de revisión ordena por tipo/id e incorpora nombre original solicitado, id editado, id/nombre/estado/tipo de cada candidato. Campo aditivo `duplicate_review`; no es credencial ni autorización criptográfica. El servidor recalcula exactamente ese conjunto y requiere `confirm_duplicate === true` si hay coincidencias. Los clientes anteriores sin coincidencias funcionan igual; si confirman coincidencias deben aportar la revisión nueva. Esta restricción deliberada evita aceptar candidatos que el cliente antiguo no pudo identificar.

La revisión optimista de SQLite cubre la carrera entre lectura y commit, pero no identifica qué vio un formulario anterior: por eso no basta por sí sola. No se añaden tablas, migraciones, permisos ni endpoints. T03 conserva replay canónico y rol vigente; el comando auditado ya contiene la aceptación y los candidatos revisados. Fallo SQL revierte cliente, sedes, vínculos, auditoría y revisión.

## Interfaz

Advertencia compartida inmediatamente bajo Nombre en Clientes y creación rápida de Ventas, nombres reales y etiquetas distintas, consulta de identificación/código/estado/contacto mediante details nativo. La ficha completa existente solo tiene apertura modal, sin deep-link estable; la consulta de lectura en el formulario conserva los datos sin guardar y evita sustituir el modal o abrir edición. No se añade una ruta ficticia.

Casilla sin premarcar, Guardar bloqueado y guarda de submit. Cambiar el nombre borra aceptación incluso si luego se restaura; cambios de candidatos invalidan y limpian revisión. Tras rechazo explícito HTTP 422 se refrescan candidatos sin cerrar formulario. Resultados inciertos (transporte/503/parseo) conservan snapshot, cuerpo y request_id para replay. Cambiar rol mantiene revocación de sesión.

Usa tokens existentes claro/oscuro, label nativo, aria-describedby, status polite y summary de teclado. La advertencia no depende solo de color. Detector Impeccable: `[]`. Capturas sintéticas 1440×1000 y 390×844 en ambos temas, inspeccionadas; se conserva desplazamiento interno del modal. La consulta ampliada puede requerir scroll voluntario. Sin prueba con lector de pantalla o dispositivo físico.

Solo cambia la huella `modal:customer`: de `348b75d2a8f17136a0dcef58983776c6e2df2fcd4d6ea4eeb29b378e52d032cf` a `2424c7047a09e3e5801d176a58d92d7db3d5e555c0051817207b94e599ff7c38`. Comparación de todas las huellas y DOM frente a main: único contenedor para Nombre; otras vistas conservadas. No se alteran timeouts.

## Evidencia ejecutada e incidencias

- Rojo inicial del matcher: módulo aún inexistente, salida 1, conservado.
- Dirigidas-01: 46 aprobadas/1 fallida; fallo de limpieza por segunda conexión SQLite aún abierta. Corregido el orden de cierre del fixture.
- Dirigidas-02: fallo de fixture HTTP que intentaba volver a crear auth.sqlite; ahora usa el endpoint administrativo existente para vincular al operador.
- Dirigidas-03: el cambio de rol devolvía 401 por revocar sesión; se inicia sesión nueva de VIEWER para comprobar el 403. Sin cambios a permisos.
- HTTP-04: 1/1 aprobada, dos actores y servidores/conexiones, boolean inválido, stale review, retry, 409 cuerpo incompatible, rol antes de replay y no escrituras tras rechazos.
- Dirigidas-05: 8/8 aprobadas, matcher, SSR, memoria/SQLite, dos conexiones y rollback. Estas pruebas forman parte de verify, no se suman como evidencia adicional.
- UI-01: 1/1 aprobada; Clientes/alta rápida, exactos y similares, exclusión/consulta, teclado, cuatro vistas, candidato concurrente rechazado sin efectos, confirmación renovada, y respuesta perdida después del commit con replay idéntico y una sola ficha. No acredita operación con datos reales.
- Check TypeScript inicial aprobado tras completar npm ci; un intento previo no inició porque npm ci aún no había instalado tsc. Lint detectó dos ternarios anidados en matcher, sustituidos por retornos explícitos. No se relajan reglas.

## Revisión independiente

Revisión sin contexto de implementación de todos los archivos modificados/no versionados por un segundo agente. Encontró P1 en recarga incondicional tras fallo de CUSTOMER_SAVE: perder respuesta de alta confirmada podía cambiar revisión y request_id, provocando otra ficha. Se limitó refresco a rechazo 422 y se añadió ensayo de pérdida posterior al commit. Revisión del delta corregido: sin P0–P2 restantes. Revisor ejecutó nueve pruebas dirigidas y diff --check; no ejecutó verify/build/E2E ni navegador. El E2E se ejecutó en el agente principal. No es aprobación formal de GitHub ni aceptación empresarial.

## Regresión y entrega

Verify-01 aprobó 364 pruebas, seis todo, tres TypeScript y lint; se detuvo por formato del test HTTP después de ajustar la sesión VIEWER. Se aplicó Prettier sin cambiar lógica ni reglas. Verify-02 completo: salida 0, 364 aprobadas, seis todo I14–I19, cero fallidas/omitidas/canceladas. Tres TypeScript, lint, formato, build y auditoría correctos: 2079 archivos, 69 paquetes runtime, cero privados/retirados. Las nueve pruebas nuevas forman parte del total; no se suman aparte.

E2E completo después de ese build final: salida 0, 34/34 aprobadas, cero fallidas/omitidas/canceladas/todo. Incluye los 33 controles anteriores y el nuevo ensayo D09. Capturas finales plegadas revisadas en cuatro vistas: aviso y confirmación visibles bajo Nombre a 390 px; consultas ampliables sin perder formulario. CI se verifica después de publicar el commit. No se imputan resultados de otro SHA. Matriz D09-01–24 distingue evidencia y pendientes. Informes, logs y capturas locales se conservan en 03_REPORTES/04_EVIDENCIAS fuera de Git; solo resúmenes seguros y pruebas sintéticas se versionan. PR en borrador hacia main verificado, sin fusión ni despliegue.
