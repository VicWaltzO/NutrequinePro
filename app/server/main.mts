import { createLocalServer } from "./application.mts";
import { readConfig } from "./config.mts";

try {
  const args = process.argv.slice(2);
  if (args.length !== 2 || args[0] !== "--config")
    throw new Error("Uso: node server/main.mts --config RUTA_ABSOLUTA_PRIVADA");
  const app = await createLocalServer(readConfig(args[1]), {
    diagnostic: (event) => console.error(JSON.stringify(event)),
  });
  const address = await app.start();
  console.log(JSON.stringify({ event: "LISTENING", address }));
  let stopping = false;
  for (const signal of ["SIGINT", "SIGTERM"] as const)
    process.on(signal, () => {
      if (stopping) return;
      stopping = true;
      const deadline = setTimeout(() => {
        console.error("Cierre incompleto.");
        process.exit(1);
      }, 15000);
      void app.close().then(
        () => {
          clearTimeout(deadline);
        },
        () => {
          clearTimeout(deadline);
          process.exitCode = 1;
        },
      );
    });
} catch {
  console.error(
    "No se pudo iniciar el backend. Revise runtime, configuración privada, preparación de bases, credenciales y puerto.",
  );
  process.exitCode = 1;
}
