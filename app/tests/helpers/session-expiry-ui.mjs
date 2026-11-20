// Revocation can be detected by an in-flight global GET before the user refreshes.
// Observe the dialog and dispatch the refresh in one browser task, so a 401 cannot
// make Playwright's pending pointer action wait for a button in an inert workspace.
export async function reachLoginAfterRevocation(page) {
  const path = await page.evaluate(() => {
    if (document.querySelector("dialog.local-login[open]")) return "proactive";
    const refresh = document.querySelector('.topbar button[aria-label="Actualizar datos"]');
    if (!(refresh instanceof HTMLButtonElement) || refresh.disabled || refresh.closest("[inert]"))
      throw new Error("No hay acceso ni actualización disponible después de revocar la sesión.");
    refresh.click();
    return "refresh";
  });
  await page
    .getByRole("dialog", { name: "Autenticación local", exact: true })
    .getByRole("heading", { name: "Iniciar sesión", exact: true })
    .waitFor();
  return path;
}
