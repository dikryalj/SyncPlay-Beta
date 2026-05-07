"use client";

import { useState } from "react";
import Link from "next/link";
import { Music2, Menu, X } from "lucide-react";

export default function Navbar() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header
      className="fixed top-0 left-0 right-0 z-40"
      style={{
        background: "rgba(10,10,15,0.8)",
        backdropFilter: "blur(20px)",
        borderBottom: "1px solid var(--border-subtle)",
      }}
    >
      <div className="container-app flex items-center justify-between h-16">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2.5 group" style={{ textDecoration: "none" }}>
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center transition-all group-hover:scale-110"
            style={{
              background: "linear-gradient(135deg, var(--brand-violet), #4F46E5)",
              boxShadow: "0 0 16px var(--brand-glow)",
            }}
          >
            <Music2 size={16} color="#fff" />
          </div>
          <span
            style={{
              fontFamily: "var(--font-display)",
              fontWeight: 700,
              fontSize: "1.125rem",
              color: "var(--text-primary)",
              letterSpacing: "-0.02em",
            }}
          >
            Sync<span style={{ color: "var(--brand-violet-light)" }}>Play</span>
          </span>
        </Link>

        {/* Nav links - desktop */}
        <nav className="hidden md:flex items-center gap-6">
          {["Features", "How It Works", "Roadmap"].map((item) => (
            <a
              key={item}
              href={`#${item.toLowerCase().replace(/\s+/g, "-")}`}
              style={{
                color: "var(--text-secondary)",
                fontSize: "0.9rem",
                fontWeight: 500,
                textDecoration: "none",
                transition: "color 0.2s",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.color = "var(--text-primary)")}
              onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-secondary)")}
            >
              {item}
            </a>
          ))}
        </nav>

        {/* CTA */}
        <div className="hidden md:flex items-center gap-3">
          <span className="badge badge-cyan">
            <span className="w-1.5 h-1.5 rounded-full animate-live-dot" style={{ background: "var(--brand-cyan)" }} />
            Beta
          </span>
          <Link href="#join" style={{ textDecoration: "none" }}>
            <button className="btn-primary" style={{ padding: "9px 20px", fontSize: "0.875rem" }}>
              Get Started
            </button>
          </Link>
        </div>

        {/* Mobile menu toggle */}
        <button
          className="btn-icon md:hidden"
          onClick={() => setMenuOpen(!menuOpen)}
          aria-label="Toggle menu"
        >
          {menuOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <div
          className="md:hidden animate-fade-up"
          style={{
            background: "var(--bg-surface)",
            borderTop: "1px solid var(--border-subtle)",
          }}
        >
          <div className="container-app flex flex-col gap-1 py-4">
            {["Features", "How It Works", "Roadmap"].map((item) => (
              <a
                key={item}
                href={`#${item.toLowerCase().replace(/\s+/g, "-")}`}
                className="py-3 px-2 rounded-lg"
                style={{
                  color: "var(--text-secondary)",
                  fontSize: "0.95rem",
                  fontWeight: 500,
                  textDecoration: "none",
                  borderBottom: "1px solid var(--border-subtle)",
                }}
                onClick={() => setMenuOpen(false)}
              >
                {item}
              </a>
            ))}
            <div className="pt-2">
              <button className="btn-primary w-full">Get Started</button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
