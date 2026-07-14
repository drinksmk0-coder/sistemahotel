@import "tailwindcss" source(none);
@source "../src";
@import "tw-animate-css";

@custom-variant dark (&:is(.dark *));

/*
 * Pousada Real Cruzília — design system.
 * Warm "paper + pine + brass" hotel-ledger aesthetic. All colors are oklch.
 */

@theme inline {
  --radius-sm: calc(var(--radius) - 4px);
  --radius-md: calc(var(--radius) - 2px);
  --radius-lg: var(--radius);
  --radius-xl: calc(var(--radius) + 4px);
  --radius-2xl: calc(var(--radius) + 8px);

  --font-serif: Georgia, "Iowan Old Style", "Palatino Linotype", serif;
  --font-sans:
    -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  --font-mono: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;

  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-popover: var(--popover);
  --color-popover-foreground: var(--popover-foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-destructive: var(--destructive);
  --color-destructive-foreground: var(--destructive-foreground);
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);

  --color-pine: var(--pine);
  --color-pine-dark: var(--pine-dark);
  --color-brass: var(--brass);
  --color-brass-bg: var(--brass-bg);
  --color-brick: var(--brick);
  --color-brick-bg: var(--brick-bg);
  --color-sage: var(--sage);
  --color-sage-bg: var(--sage-bg);
  --color-slate: var(--slate);
  --color-slate-bg: var(--slate-bg);
  --color-paper-2: var(--paper-2);
}

:root {
  --radius: 0.6rem;

  --paper: oklch(0.945 0.014 85);
  --paper-2: oklch(0.905 0.02 85);
  --background: var(--paper);
  --foreground: oklch(0.26 0.02 70);

  --card: oklch(0.985 0.006 85);
  --card-foreground: oklch(0.26 0.02 70);
  --popover: oklch(0.985 0.006 85);
  --popover-foreground: oklch(0.26 0.02 70);

  --pine: oklch(0.42 0.045 162);
  --pine-dark: oklch(0.33 0.038 162);
  --brass: oklch(0.68 0.11 74);
  --brass-bg: oklch(0.93 0.045 82);
  --brick: oklch(0.56 0.14 28);
  --brick-bg: oklch(0.9 0.05 30);
  --sage: oklch(0.56 0.08 155);
  --sage-bg: oklch(0.91 0.03 150);
  --slate: oklch(0.5 0.014 70);
  --slate-bg: oklch(0.9 0.01 80);

  --primary: var(--pine);
  --primary-foreground: oklch(0.97 0.01 85);
  --secondary: var(--paper-2);
  --secondary-foreground: oklch(0.3 0.03 162);
  --muted: oklch(0.92 0.012 85);
  --muted-foreground: oklch(0.44 0.02 70);
  --accent: var(--brass);
  --accent-foreground: oklch(0.28 0.03 74);
  --destructive: var(--brick);
  --destructive-foreground: oklch(0.97 0.01 85);

  --border: oklch(0.84 0.025 85);
  --input: oklch(0.84 0.025 85);
  --ring: oklch(0.68 0.11 74);
}

@layer base {
  * {
    border-color: var(--color-border);
  }
  body {
    background-color: var(--color-background);
    color: var(--color-foreground);
    font-family: var(--font-sans);
    -webkit-font-smoothing: antialiased;
  }
  h1, h2, h3, .font-serif {
    font-family: var(--font-serif);
  }
  ::selection {
    background: var(--brass-bg);
  }
}

@layer components {
  .card-surface {
    background-color: var(--color-card);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    box-shadow: 0 1px 2px rgba(42, 33, 24, 0.06), 0 6px 20px rgba(42, 33, 24, 0.06);
  }
  .section-title {
    font-family: var(--font-serif);
    font-weight: 700;
    letter-spacing: 0.2px;
  }
  .field {
    width: 100%;
    border-radius: var(--radius-md);
    border: 1px solid var(--color-input);
    background-color: var(--color-card);
    padding: 0.55rem 0.7rem;
    font-size: 0.9rem;
    color: var(--color-foreground);
    outline: none;
  }
  .field:focus {
    border-color: var(--color-ring);
    box-shadow: 0 0 0 3px var(--brass-bg);
  }
  .btn-primary {
    border-radius: var(--radius-md);
    background-color: var(--color-pine);
    color: var(--color-primary-foreground);
    font-weight: 600;
    padding: 0.5rem 0.9rem;
    transition: background-color 0.15s;
  }
  .btn-primary:hover {
    background-color: var(--color-pine-dark);
  }
  .btn-ghost {
    border-radius: var(--radius-md);
    border: 1px solid var(--color-border);
    background-color: var(--color-card);
    font-weight: 600;
    padding: 0.5rem 0.9rem;
    transition: background-color 0.15s;
  }
  .btn-ghost:hover {
    background-color: var(--color-muted);
  }
  .stat-card {
    background-color: var(--color-card);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    padding: 1rem 1.1rem;
    box-shadow: 0 1px 2px rgba(42, 33, 24, 0.06);
  }
}

@media print {
  .no-print {
    display: none !important;
  }
  body {
    background: #fff !important;
  }
}

