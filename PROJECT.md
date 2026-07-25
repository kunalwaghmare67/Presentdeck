# Project: PresentDeck Discord Dark Theme Restyling

## Architecture
- Dual-entry Vite React 19 application (`index.html` -> `main.tsx` -> `App.tsx`, `presenting.html` -> `presenting-entry.tsx` -> `PresentingScreen.tsx`).
- Auth context (`AuthContext.tsx` with SHA-256 hashed password verification for users `Kunal`, `Kunal1`, `Aashay`).
- Zustand store (`store.ts`) for decks, slides, tracks, media, workflows.
- Pure CSS with root CSS custom variables in `src/index.css` and component CSS files (`LoginPage.css`, `PPTFlow.css`, `MusicFlow.css`, `PresentationArea.css`, `PhotoArea.css`, `VideoArea.css`, `WorkflowManager.css`, `PresentingScreen.css`).

## Code Layout
- `src/index.css`: Global CSS variables, reset, font, scrollbar, grid layout.
- `src/components/LoginPage.tsx` & `LoginPage.css`: Glassmorphic login card, inputs, labels, submit button, error messages.
- `src/components/PPTFlow.tsx` & `PPTFlow.css`: Left panel (`.col-ppt`, width 260px).
- `src/components/MusicFlow.tsx` & `MusicFlow.css`: Middle panel (`.col-music`, width 280px).
- `src/components/PresentationArea.tsx` & `PresentationArea.css`: Top main area.
- `src/components/PhotoArea.tsx` & `PhotoArea.css`: Bottom-left main panel.
- `src/components/VideoArea.tsx` & `VideoArea.css`: Bottom-right main panel.
- `src/components/WorkflowManager.tsx` & `WorkflowManager.css`: Header action dropdown & modal system.
- `src/components/PresentingScreen.tsx` & `PresentingScreen.css`: Standalone presenter view.

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| E2E | E2E Testing Track | Independent opaque-box test suite for Tiers 1-4 requirements | none | DONE |
| 1 | Login Page Discord Dark Restyling | R1: Restyle login page card, labels, inputs, primary button, links, headings, focus glow, drop shadow, exact hex colors | none | DONE |
| 2 | Main Dashboard Dark Theme Color Pass | R2: Restyle main content background (#313338), sidebar/panels (#2b2d31), borders/dividers (#1e1f22), text (#f2f3f5, #b5bac1), accents (#5865f2, hover #4752c4) across index.css and all component CSS files | M1 | IN_PROGRESS |
| 3 | Final Integration & E2E Verification | Pass 100% E2E test suite (Tiers 1-4) + Tier 5 Adversarial Coverage Hardening | M1, M2, E2E | PLANNED |


## Interface Contracts & Color Tokens
### Discord Hex Palette Reference
- Outer Background: `#313338`
- Centered Modal Card Background: `#2b2d31` or `#313338` (8px radius, max-width ~480px, drop shadow)
- Inputs Background: `#1e1f22`, radius 3px, border 2px solid `#00a8fc` on focus, text `#ffffff`, padding 10px 12px
- Labels: Uppercase, 12px, letter-spacing 0.02em, color `#b5bac1`, bold
- Primary Button ("Log In"): Background `#5865f2` (blurple), hover `#4752c4`, text white bold, radius 3px, full width
- Links ("Forgot your password?", "Register"): `#00a8fc`, underline on hover
- Headings: "Welcome back!" bold white ~24px, subtext "We're so excited to see you again!" `#b5bac1` ~16px
- Dashboard Primary Content Background: `#313338`
- Dashboard Sidebar/Channel List Background: `#2b2d31`
- Dashboard Secondary Panel Background: `#2b2d31`
- Dashboard Borders/Dividers: `#1e1f22`
- Dashboard Primary Text: `#f2f3f5`, Muted Text: `#b5bac1`
- Dashboard Accent/Interactive: `#5865f2`, hover `#4752c4`
