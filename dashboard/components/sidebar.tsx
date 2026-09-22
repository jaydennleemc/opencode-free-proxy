"use client";

import type { ReactNode } from "react";

export type Tab = "overview" | "activity" | "keys";

export default function Sidebar({
  active,
  onNav,
  admin,
  error,
}: {
  active: Tab;
  onNav: (t: Tab) => void;
  admin: boolean;
  error: boolean;
}) {
  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  const nav: { id: Tab; label: string; icon: ReactNode }[] = [
    {
      id: "overview",
      label: "Overview",
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="7" height="7" rx="1" />
          <rect x="14" y="3" width="7" height="7" rx="1" />
          <rect x="3" y="14" width="7" height="7" rx="1" />
          <rect x="14" y="14" width="7" height="7" rx="1" />
        </svg>
      ),
    },
    {
      id: "activity",
      label: "Activity",
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 12h4l3-9 4 18 3-9h4" />
        </svg>
      ),
    },
    ...(admin
      ? [
          {
            id: "keys" as Tab,
            label: "API Keys",
            icon: (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" />
              </svg>
            ),
          },
        ]
      : []),
  ];

  return (
    <>
      {/* ── Desktop sidebar ── */}
      <aside className="fixed inset-y-0 left-0 hidden w-[260px] border-r border-border-subtle bg-surface md:flex md:flex-col">
        <div className="flex h-16 items-center gap-3 border-b border-border-subtle px-5">
          <span className="relative flex h-2 w-2">
            <span className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-50 ${error ? "bg-red" : "bg-green"}`} />
            <span className={`relative inline-flex h-2 w-2 rounded-full ${error ? "bg-red" : "bg-green"}`} />
          </span>
          <span className="tnum text-xs font-semibold uppercase tracking-[0.15em] text-text">
            opencode proxy
          </span>
        </div>

        <nav className="flex-1 px-3 py-4">
          {nav.map((item) => (
            <button
              key={item.id}
              onClick={() => onNav(item.id)}
              className={`mb-1 flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors duration-150 ${
                active === item.id
                  ? "bg-cyan/10 text-cyan"
                  : "text-muted hover:bg-raised hover:text-text"
              }`}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </nav>

        <div className="border-t border-border-subtle px-5 py-4">
          <button
            onClick={logout}
            className="tnum flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs text-muted transition-colors duration-150 hover:bg-raised hover:text-text"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            Log out
          </button>
        </div>
      </aside>

      {/* ── Mobile bottom nav ── */}
      <nav className="fixed inset-x-0 bottom-0 z-50 flex items-center justify-around border-t border-border-subtle bg-surface/95 backdrop-blur md:hidden">
        {nav.map((item) => (
          <button
            key={item.id}
            onClick={() => onNav(item.id)}
            className={`flex flex-col items-center gap-1 px-4 py-3 text-[10px] transition-colors duration-150 ${
              active === item.id ? "text-cyan" : "text-muted"
            }`}
          >
            {item.icon}
            {item.label}
          </button>
        ))}
        <button
          onClick={logout}
          className="flex flex-col items-center gap-1 px-4 py-3 text-[10px] text-muted"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" y1="12" x2="9" y2="12" />
          </svg>
          Exit
        </button>
      </nav>
    </>
  );
}
