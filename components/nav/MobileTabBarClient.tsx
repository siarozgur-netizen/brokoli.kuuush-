"use client";

import { useEffect, useState } from "react";

const ITEMS = [
  { href: "/", label: "Takvim", icon: "📅" },
  { href: "/defter", label: "Defter", icon: "📒" },
  { href: "/report", label: "Rapor", icon: "📊" },
  { href: "/team", label: "Takim", icon: "👥" }
];

export function MobileTabBarClient() {
  const [pathname, setPathname] = useState("/");
  const [pendingHref, setPendingHref] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setPathname(window.location.pathname);
    }
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setPathname(window.location.pathname);
    }
    setPendingHref(null);
  }, [pathname]);

  return (
    <nav className="mobile-tabbar" aria-label="Mobil alt menu">
      {ITEMS.map((item) => {
        const active = pathname === item.href;
        const pending = pendingHref === item.href;
        return (
          <a
            key={item.href}
            href={item.href}
            className={`mobile-tab${active ? " active" : ""}${pending ? " pending" : ""}`}
            aria-current={active ? "page" : undefined}
            aria-busy={pending ? "true" : undefined}
            onClick={(event) => {
              if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
              if (pathname === item.href) return;
              setPendingHref(item.href);
            }}
          >
            <span className="mobile-tab-icon" aria-hidden>{item.icon}</span>
            <span className="mobile-tab-label">
              {item.label}
              {pending && <span className="mobile-tab-dot" aria-hidden />}
            </span>
          </a>
        );
      })}
    </nav>
  );
}
