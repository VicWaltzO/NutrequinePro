import { getChatGPTUser } from "../../chatgpt-auth";
import { runCommand } from "../../../lib/store";
import { DomainError } from "../../../lib/domain.mjs";
export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Inicie sesión para registrar operaciones." }, { status: 401 });
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin)
    return Response.json({ error: "Origen inválido." }, { status: 403 });
  try {
    const raw = await request.text();
    if (raw.length > 250000)
      return Response.json({ error: "La operación excede el tamaño permitido." }, { status: 413 });
    const command: unknown = JSON.parse(raw);
    const result = await runCommand(command, user);
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    if (e instanceof DomainError) return Response.json({ error: e.message }, { status: 422 });
    console.error("Command failed", e);
    return Response.json(
      { error: "No se guardó la operación. Sus datos siguen en el formulario; vuelva a intentar." },
      { status: 503 },
    );
  }
}
