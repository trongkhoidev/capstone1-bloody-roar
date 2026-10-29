<!-- CLAUDE_DESIGN_RULES_START -->
# Bloody-Roar Claude Design System Rules

Whenever implementing or styling components in `apps/web`:
1. Use the CSS variables defined in `.br` and `.br.dark`:
   - `--bg`, `--surface`, `--surface-2`, `--sunk`, `--line`, `--line-2`
   - `--ink`, `--ink-2`, `--ink-3`, `--brand` (#C21F3A / #F2555A)
   - `--cta`, `--cta-ink`, `--link`, `--gold`, `--gold-bg`, `--gold-line`
   - `--tag-bg`, `--tag-ink`, `--tag-line`, `--ok`, `--ok-bg`, `--warn`, `--warn-bg`, `--bad`, `--bad-bg`
2. Fonts:
   - Body font: `Geist, ui-sans-serif, system-ui, -apple-system, sans-serif`
   - Numeric / Code font: `Geist Mono, ui-monospace, Menlo, Consolas, monospace` with class `mono`
3. Layout Structure:
   - Navbar height: 56px (`.top`) with 3px brand border-top
   - Left navigation: `.lnav` (sticky sidebar with section headers `.lab`)
   - Content area: `.cols` grid with main column and 300px right sidebar
   - Bounty card: `.sum` layout with 112px left stats column and flexible right content column
4. Reference designs: Check `docs/claude-design/` for the exact HTML, classes, and interaction states of all 34 screens.
<!-- CLAUDE_DESIGN_RULES_END -->
