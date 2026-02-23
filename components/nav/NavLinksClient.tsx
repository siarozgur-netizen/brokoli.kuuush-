"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type NavItem = {
  href: string;
  label: string;
  badgeCount?: number;
};

export function NavLinksClient({
  isAuthenticated,
  isAdmin,
  hasMembership,
  pendingApprovals
}: {
  isAuthenticated: boolean;
  isAdmin: boolean;
  hasMembership: boolean;
  pendingApprovals: number;
}) {
  const [pathname, setPathname] = useState("/");
  const [pendingCount, setPendingCount] = useState(pendingApprovals);
  const pathnameRef = useRef(pathname);
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setPathname(window.location.pathname);
  }, []);

  useEffect(() => {
    setPendingCount(pendingApprovals);
  }, [pendingApprovals]);

  useEffect(() => {
    if (!isAuthenticated || !hasMembership) return;

    let stopped = false;
    const fetchPendingCount = async () => {
      try {
        const response = await fetch("/api/settlement-payments/pending-count", { cache: "no-store" });
        const data = (await response.json()) as { pending_count?: number };
        if (!stopped && response.ok) {
          setPendingCount(Number(data.pending_count ?? 0));
        }
      } catch {
        // Keep current count if request fails.
      }
    };

    void fetchPendingCount();
    const timer = setInterval(fetchPendingCount, 6000);

    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [isAuthenticated, hasMembership, pathname]);

  useEffect(() => {
    if (pathnameRef.current === pathname) return;
    pathnameRef.current = pathname;

    if (pendingHref) {
      setProgress(100);
      const doneTimer = setTimeout(() => {
        setPendingHref(null);
        setProgress(0);
      }, 220);
      return () => clearTimeout(doneTimer);
    }
    return;
  }, [pathname, pendingHref]);

  useEffect(() => {
    if (!pendingHref) return;
    setProgress(8);

    const timer = setInterval(() => {
      setProgress((current) => {
        if (current >= 92) return 92;
        const step = current < 50 ? 8 : current < 80 ? 4 : 2;
        return Math.min(92, current + step);
      });
    }, 120);

    return () => clearInterval(timer);
  }, [pendingHref]);

  useEffect(() => {
    if (!pendingHref) {
      setProgress(0);
    }
  }, [pendingHref]);

  const items = useMemo<NavItem[]>(() => {
    if (!isAuthenticated) {
      return [{ href: "/auth", label: "Giris" }];
    }

    const next: NavItem[] = [
      { href: "/", label: "Takvim" },
      {
        href: pendingCount > 0 ? "/defter#pending-approvals" : "/defter",
        label: "Balances / Hesaplasma",
        badgeCount: pendingCount
      },
      { href: "/report", label: "Rapor" }
    ];

    if (hasMembership) next.push({ href: "/team", label: "Takim" });
    if (isAdmin) next.push({ href: "/people", label: "Kisiler" });
    next.push({ href: "/teams", label: "Takimlarim" });

    return next;
  }, [hasMembership, isAdmin, isAuthenticated, pendingCount]);

  return (
    <>
      <div className={`nav-progress-wrap${pendingHref ? " active" : ""}`} aria-hidden>
        <div className="nav-progress" style={{ width: `${progress}%` }} />
        <span className="nav-progress-text">{progress}%</span>
      </div>
      {items.map((item) => {
        const linkPath = item.href.split("#")[0];
        const active = pathname === linkPath;
        const pending = pendingHref === item.href;

        return (
          <a
            key={item.href}
            href={item.href}
            className={`nav-link${active ? " active" : ""}${pending ? " pending" : ""}`}
            aria-current={active ? "page" : undefined}
            aria-busy={pending ? "true" : undefined}
            onClick={(event) => {
              if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
              if (pathname === item.href) return;
              setPendingHref(item.href);
            }}
          >
            <span>{item.label}</span>
            {(item.badgeCount ?? 0) > 0 && <span className="nav-count-badge">{item.badgeCount}</span>}
          </a>
        );
      })}
    </>
  );
}
