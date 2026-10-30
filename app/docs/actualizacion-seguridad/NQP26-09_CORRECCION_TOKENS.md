# NQP26-09: corrección del emparejamiento de tokens

Fecha: 2026-10-30. Seguimiento del hallazgo P2 de la revisión privada del PR #21.

La comparación ordenada por posición omitía nombres como «María Marta» y
«Marya Marta»: una errata cambiaba el orden de los tokens y se contaban dos
diferencias. El detector compartido ahora descuenta una ocurrencia por cada
token igual y aplica la regla de errata a la única pareja restante. Conserva
las multiplicidades, la igualdad normalizada y el límite de una sola errata.

La prueba de regresión falló con la implementación anterior y pasa con la
corrección. Cubre sustitución, inserción/eliminación, transposición, comparación
en ambos sentidos y tokens repetidos; rechaza dos erratas y cantidades distintas.

Validación completa:

- `npm.cmd run verify`: salida 0; 365 pruebas aprobadas, seis TODO existentes y
  cero fallos; tres chequeos TypeScript, lint, formato, build y auditoría de
  distribución aprobados (cero archivos privados y cero paquetes retirados).
- `npm.cmd run test:e2e` después del build con Chrome: 34/34 aprobadas, cero
  fallos, omisiones o cancelaciones; incluye Clientes y alta rápida de Ventas.
- La prueba nueva falla antes de la corrección y pasa después. `git diff --check`
  sin errores. Logs y evidencias sintéticas locales excluidos del commit.

Entrega en la rama del PR #21, sin fusión ni despliegue.
