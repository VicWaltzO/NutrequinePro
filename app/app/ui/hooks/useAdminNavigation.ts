"use client";
import { useEffect } from "react";
import { useState } from "react";
import { useSyncExternalStore } from "react";
import { readTheme } from "@/lib/browser-preferences.mjs";
import { subscribeTheme } from "@/lib/browser-preferences.mjs";
import { changeTheme } from "@/lib/browser-preferences.mjs";
import { readView } from "@/lib/browser-preferences.mjs";
import { subscribeView } from "@/lib/browser-preferences.mjs";
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
  const view =
    route === "sites"
      ? "customers"
      : route === "products"
        ? "config"
        : nav.some((x) => x[0] === route)
          ? route
          : "dashboard";
  const tab = route === "sites" ? "sites" : route === "products" ? "products" : (hash.split("/")[1] ?? "all");
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);
  const toggleTheme = () => changeTheme(theme === "dark" ? "light" : "dark");
  const go = (v: string, nextTab = "all") => {
    location.hash = nextTab === "all" ? v : `${v}/${nextTab}`;
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
