# QA Verification Report: Epic OS Agent Dialog Functionality

**Task ID:** #2
**Date:** 2026-03-15
**QA Engineer:** QA Engineer Agent
**Priority:** Critical
**Environment:** http://localhost:3000/desktop

---

## Executive Summary

The Agent dialog feature is **NOT WORKING** on the `/desktop` route. All 5 Agent icons in the Dock visually respond to clicks (green dot appears, icon becomes active), but no Agent dialog window opens. This is a **Critical regression** — the feature is non-functional for end users on this route.

**Acceptance Criteria Status:**
- [ ] FAIL - All 5 Agent icons click correctly (icons respond visually but windows do not appear)
- [ ] FAIL - Agent dialog windows render correctly (windows never render)
- [ ] FAIL - Multiple Agent windows run simultaneously (feature completely broken)
- [ ] FAIL - Close functionality works (cannot test, no windows open)

---

## Test Execution Results

### Test 1: PM Agent Icon Click
- **Action:** Clicked clipboard icon (产品经理) in Dock
- **Expected:** Agent dialog window opens with PM agent name, message list, input box, send button, status indicator
- **Actual:** Green dot appears under PM icon. Label "产品经理" briefly shown at bottom-right. NO dialog window rendered.
- **Result:** FAIL

### Test 2: Other Agent Icons
- **Status:** Not executed (primary issue blocks all agent icon tests)
- **Risk Assessment:** Same failure pattern expected for all 5 agents based on root cause analysis

### Test 3: Multi-Agent Windows
- **Status:** Blocked by Test 1 failure

### Test 4: Close Agent Dialog
- **Status:** Blocked by Test 1 failure

---

## Root Cause Analysis

### Primary Bug: Architecture Mismatch - Two Disconnected Window Systems

**Severity:** Critical
**Type:** Integration / Architecture Defect

The `/desktop` page uses two completely separate window rendering systems that are not connected:

#### System A: AppWindow System (used by Dock)
- **Store:** `appWindowStore`
- **Hook:** `useAppWindowManager`
- **Renderer:** `AppWindowContainer`
- **Where Dock writes:** Dock calls `openWindow()` from `useAppWindowManager` which writes to `appWindowStore`
- **WHERE IT RENDERS:** `AppWindowContainer` is only mounted in `src/app/page.tsx` (the home page `/`)

#### System B: AgentLauncher System (used by Desktop)
- **Store:** `agentLauncherStore`
- **Hook:** `useAgentLauncher`
- **Renderer:** `AgentDialog` components mapped in `Desktop.tsx`
- **WHERE IT RENDERS:** Inside `Desktop.tsx` via `openAgentIds.map((agentId) => <AgentDialog .../>)`
- **WHO WRITES TO IT:** Nobody — `Dock` never calls `openAgent()` from `agentLauncherStore`

**The disconnect:** When a user clicks a Dock icon:
1. Dock calls `openWindow()` → writes to `appWindowStore` ✓
2. `AppWindowContainer` reads from `appWindowStore` — but it is NOT mounted in `/desktop` ✗
3. `Desktop.tsx` renders `AgentDialog` from `agentLauncherStore` — but Dock never writes to it ✗
4. Result: Nothing renders

### Evidence

**Console logs confirming the issue:**
```
[Dock] Window opened with id: window-agent-pm-1   ← Dock wrote to appWindowStore
[AppWindowContainer] ...                           ← ABSENT: container never logs, never mounted
```

**File references:**
- `src/components/os/Desktop.tsx` line 211: Renders `AgentDialog` from `agentLauncherStore`
- `src/components/os/dock/index.tsx` line 125: Calls `openWindow()` from `appWindowStore`
- `src/app/page.tsx` line 610: `AppWindowContainer` only mounted here (not in `/desktop`)
- `src/app/desktop/page.tsx`: Only renders `<Desktop />`, no `AppWindowContainer`

### Secondary Issues Observed

1. **React prop mismatch warning:** `aria-describedby` prop mismatch between server and client on `DockIcon` (SSR/CSR hydration issue with `@dnd-kit/core`)
2. **`AgentDialog` send button bug** (`src/components/os/agent-host/AgentDialog.tsx` line 86): Uses `document.querySelector` to find input instead of React ref — will break when multiple dialogs are open simultaneously

---

## Proposed Fix Options

### Option 1 (Recommended): Add AppWindowContainer to Desktop.tsx
Add `<AppWindowContainer />` to `Desktop.tsx` and remove the unused `AgentDialog` rendering from `agentLauncherStore`. This consolidates on the AppWindow architecture.

**Files to modify:**
- `src/components/os/Desktop.tsx`: Add `import AppWindowContainer from '@/components/os/window/AppWindowContainer'` and render `<AppWindowContainer />` in the JSX

**Risk:** Low — AppWindow system is already proven working on `/` route

### Option 2: Make Dock write to agentLauncherStore instead
Modify Dock's `handleIconClick` to call `openAgent(appId)` from `agentLauncherStore` instead of `openWindow()` from `appWindowStore`.

**Risk:** Medium — requires ensuring agentLauncherStore drives the same rich window UX

### Option 3: Bridge the two stores
Add a side-effect in `appWindowStore` that mirrors opens to `agentLauncherStore`.

**Risk:** High — creates tight coupling between unrelated stores, increases complexity

**Recommendation:** Option 1. The AppWindow system is the more capable and complete system (supports minimize, maximize, resize, z-ordering, portal rendering). The `AgentDialog` system in `Desktop.tsx` appears to be a legacy approach. Consolidating on `AppWindowContainer` is the correct architectural direction.

---

## Additional Recommendations

1. **Clean up agentLauncherStore dependency in Desktop.tsx** — after fix, remove the dead code (lines 77-89, 211-218 in Desktop.tsx)
2. **Fix AgentDialog send button** — use React `useRef` instead of `document.querySelector`
3. **Fix DndContext hydration warning** — investigate `aria-describedby` mismatch in DockIcon
4. **Add `/desktop` route to E2E test suite** — this regression would have been caught immediately

---

## Bug Record

**Bug ID:** BUG-OS-001
**Component:** Desktop > Dock > AgentDialog
**Severity:** Critical (P1)
**Status:** Open
**Assignee:** Developer
**Summary:** Clicking Agent icons in Dock on `/desktop` route opens no dialog window due to missing `AppWindowContainer` in Desktop component

---

*Report generated by QA Engineer Agent on 2026-03-15*
