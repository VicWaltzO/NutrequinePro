import { useEffect, useState, useSyncExternalStore } from "react";
import {
  readTheme,
  subscribeTheme,
  changeTheme,
  readView,
  subscribeView,
} from "@/lib/browser-preferences.mjs";
import { nav } from "../navigation";
export function useAdminNavigation() {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("");
  const [client, setClient] = useState("");
  const [site, setSite] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [menu, setMenu] = useState(false);
  const theme = useSyncExternalStore(subscribeTheme, readTheme, () => "light" as const);
  const hash = useSyncExternalStore(subscribeView, readView, () => "dashboard");
  const route = hash.split("/")[0];
  let view = "dashboard";
  if (route === "sites") view = "customers";
  else if (route === "products") view = "config";
  else if (nav.some(([name]) => name === route)) view = route;

  let tab = hash.split("/")[1] ?? "all";
  if (route === "sites") tab = "sites";
  else if (route === "products") tab = "products";
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);
  const toggleTheme = () => changeTheme(theme === "dark" ? "light" : "dark");
  const go = (viewName: string, nextTab = "all") => {
    location.hash = nextTab === "all" ? viewName : `${viewName}/${nextTab}`;
    setQ("");
    setFilter("");
    setClient("");
    setSite("");
    setFrom("");
    setTo("");
    setMenu(false);
  };
  return {
    q,
    setQ,
    filter,
    setFilter,
    client,
    setClient,
    site,
    setSite,
    from,
    setFrom,
    to,
    setTo,
    menu,
    setMenu,
    theme,
    view,
    tab,
    go,
    toggleTheme,
  };
}
