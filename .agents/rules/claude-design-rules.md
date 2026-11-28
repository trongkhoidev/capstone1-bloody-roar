<!-- CLAUDE_DESIGN_RULES_START -->
# Bloody-Roar Claude Design System Rules

Whenever implementing or styling components in `apps/web`:
1. Use the CSS variables defined in `apps/web/src/styles/claude-design.css` (`:root` / `.br` and the dark block):
   - `--bg`, `--surface`, `--surface-2`, `--sunk`, `--line`, `--line-2`
   - `--ink`, `--ink-2`, `--ink-3`, `--link`, `--link-h`
   - `--brand` = `--link` (#1D5FBF / #7AA8FF): data accent, links, focus ring, unread badges. Not used for chrome or large areas.
   - `--cta` / `--cta-ink` (#111316 on #FFFFFF, inverted in dark): primary buttons only. One primary button per region.
   - `--gold`, `--gold-bg`, `--gold-line`: money (rewards, escrow amounts) only.
   - `--tag-bg`, `--tag-ink`, `--tag-line`: skill tags.
   - `--ok`, `--ok-bg`, `--warn`, `--warn-bg`, `--bad`, `--bad-bg`, `--attn`, `--attn-bg`: status only. Red (`--bad`) means error or lost money, never branding.
   - No new hard-coded colors. Palette rationale: `docs/design/ledger-palette-and-copy.md` ("achromatic ledger", taste-skill).
2. Fonts:
   - Body font: `Geist, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`
   - Numeric / Code font: `Geist Mono, ui-monospace, Menlo, Consolas, monospace` with class `mono` (tabular numbers). Use it for every amount, count, ID and hash.
3. Layout Structure:
   - Navbar height: 56px (`.top`), surface background with a 1px bottom border, no colored top border.
   - Navbar controls are 36px high: `.btn` for the "Post a bounty" CTA, `.ibtn` icon buttons (with `.n` count badge) for messages and notifications, compact account pill. Search is capped at 380px.
   - Left navigation: `.lnav` (sticky sidebar with section headers `.lab`)
   - Content area: `.cols` grid with main column and 300px right sidebar
   - Bounty card: `.sum` layout with 112px left stats column (reward, status badge, applications, views) and a right column (muted category line `.s-top`, `.s-title`, 2-line `.s-ex`, `.s-meta` with tags and client).
   - Stat strips use `.tiles` / `.tile` (`.lab` label, `.v mono` value).
   - Lists page with `.pager`: "Showing x–y of N", Prev / Next (`.pages`) and a per-page `.seg` (15 / 30 / 50). Cursor-based, no API change.
4. Reference designs: Check `docs/claude-design/` for the HTML, classes, and interaction states of all 35 screens (`34_Bounty_detail.html` is a static page without the design runtime). `design-tokens.css` mirrors the ledger tokens in the app CSS and is embedded verbatim in every screen; when you change it, replace the embedded copy (raw and JSON-escaped) in each HTML too. Where a screen and this file disagree, this file wins.
<!-- CLAUDE_DESIGN_RULES_END -->
