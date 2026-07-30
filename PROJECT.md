# Project: PresentDeck Per-Operator Workflow Isolation & Master Override

## Architecture
- Dual-entry Vite React 19 application (`index.html` -> `main.tsx` -> `App.tsx`).
- Auth context (`AuthContext.tsx` with user state, operator roles including 'master' and non-master operators).
- IndexedDB storage (`db.ts`) for saved workflows (`SavedWorkflow` interface).
- Zustand store (`store.ts`) managing workflow loading, saving, renaming, deleting, and active workflow state.
- React UI components (`WorkflowManager.tsx`) managing workflow dropdown, modals, ownership badges, and action buttons.

## Code Layout
- `src/db.ts`: IndexedDB database initialization (`workflows` store), `loadWorkflowsFromDB`, `saveWorkflowToDB`, `deleteWorkflowFromDB`, `renameWorkflowInDB`.
- `src/store.ts`: Zustand store for state management (`savedWorkflows`, `loadWorkflows`, `saveCurrentWorkflow`, `deleteWorkflow`, `renameWorkflow`, `openWorkflow`).
- `src/components/WorkflowManager.tsx` & `WorkflowManager.css`: Workflow management UI modal, listing saved workflows, load/edit/rename/delete buttons, owner badge `👤 username`.
- `src/context/AuthContext.tsx`: Auth state provider storing logged-in user (`username`, `role`).

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| 1 | Data & Store Layer Isolation | R1 & R2: Tag workflows with creator `username`. Update `db.ts` (`loadWorkflowsFromDB`, `saveWorkflowToDB`, etc.) and `store.ts` to filter by username for non-master operators and enforce mutation/load access controls at data layer. | none | IN_PROGRESS |
| 2 | UI Layer Access Control & Master Ownership Labeling | R2 & R3: Update `WorkflowManager.tsx` to scope load/edit/rename/delete UI controls to owner/master, and render operator ownership badge (`👤 username`) for master operator view. | M1 | PLANNED |
| 3 | Final Verification & Forensic Audit | Verification: `npx tsc --noEmit` compiles with zero errors, unit/E2E test suite pass, Forensic Integrity Audit. | M1, M2 | PLANNED |

## Interface Contracts & Requirements Reference
### R1. Separate Storage & Data Layer Isolation Per Operator
- Every saved workflow tagged with `creator` or `username` (operator ID).
- `loadWorkflowsFromDB(username?: string, role?: string)` filters at DB layer: non-master operators receive strictly their own workflows.
- Workflow overwrites scoped by name AND creator username so saving never overwrites another operator's workflow with the same name.

### R2. Strict Mutation & Load Access Control
- Non-master operators blocked from opening, loading, editing, renaming, or deleting another operator's workflow in both `store.ts`/`db.ts` and `WorkflowManager.tsx`.

### R3. Master Operator Full Access & Ownership Labeling
- Master operator (`role === 'master'`) bypasses filters to view, load, edit, rename, and delete all saved workflows.
- Master view clearly displays operator ownership badge (`👤 username`) next to each workflow in the UI.
