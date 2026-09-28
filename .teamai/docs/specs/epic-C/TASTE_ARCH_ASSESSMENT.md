# Technical Design: 两层 TASTE 架构评估

**Document ID:** ARCH-TASTE-001
**Date:** 2026-03-15
**Author:** System Architect
**Status:** Final - Delivered to PM and Team Lead
**Addresses:** ARCH-001, ARCH-002, ARCH-003 (from architect inbox)

---

## EXECUTIVE SUMMARY

The two-layer TASTE architecture is technically sound and the C.1 foundation is already implemented. This assessment addresses four specific questions from the team lead:

1. Schema design for two-layer TASTE and merge algorithm
2. pi-agent context-aware loading implementation path
3. Evolution trigger mechanism design
4. Phase priority recommendation: Phase 1.5 (C.5 Project TASTE) vs C.2-C.3

**Key Conclusions:**
- The existing `TASTEProfile` schema in `src/types/taste.ts` already supports both layers. No schema redesign is needed.
- pi-agent integration requires a single new service (`TasteLoader`) and one injection point in `OriginOSAgent`. Complexity is low.
- Evolution trigger should use interaction-count threshold in Phase 1, with a threshold-based batching approach. Avoid real-time triggers initially.
- Priority recommendation: **Phase 1.5 (C.5) before C.2-C.3**. Reasoning explained in section 4.

---

## 1. SCHEMA DESIGN: TWO-LAYER TASTE + MERGE ALGORITHM

### 1.1 Current State Assessment

The schema at `src/types/taste.ts` already correctly handles both layers through the `source` discriminator in `metadata`. The `mergeTASTEProfiles()` factory function is also implemented. No structural redesign is required.

What needs clarification is the **merge semantics** at a field-by-field level.

### 1.2 Confirmed Merge Rules

```
Layer         Storage Path                              Scope
-----------   ----------------------------------------  ---------
User TASTE    data/taste/users/{userId}/profile.json    Global (all sessions)
Project TASTE data/taste/projects/{projectId}/profile.json  Per-project
```

**Field-level merge behavior (Project overrides User):**

| Field | Merge Strategy | Rationale |
|-------|---------------|-----------|
| `experience_topology` | Union (deduplicated array) | Both layers add topological signal; no conflict possible |
| `taste_standards[domain]` | Project domain wins entirely | Project context redefines domain-specific taste |
| `taste_standards` (missing domains) | User value kept | Fill gaps from user-level baseline |
| `tension_position` | Weighted average: Project 0.7, User 0.3 | Project context is the active frame of reference |
| `symbiosis_boundary.delegated_domains` | Union | More delegated = more contextual flexibility |
| `symbiosis_boundary.reserved_domains` | Union | Reservations accumulate; never removed by merge |
| `symbiosis_boundary.contextual_triggers` | Union | Context triggers are additive |
| `metadata.source` | Set to `'merged'` | Identity of the resulting profile |
| `metadata.confidence` | Minimum of the two | Merged profile is only as confident as its weakest layer |
| `metadata.evolution_count` | Sum | Tracks total evolution events across both layers |

### 1.3 Merge Algorithm Specification

```typescript
// Conceptual merge flow (for developer implementation reference)
//
// 1. Load User TASTE from data/taste/users/{userId}/profile.json
// 2. Load Project TASTE from data/taste/projects/{projectId}/profile.json
// 3. If only one exists, return that profile as-is (no merge needed)
// 4. Apply field-level merge rules above
// 5. Set result metadata.source = 'merged'
// 6. Do NOT persist merged result to disk - it is a computed, ephemeral view
//
// TasteLoader.loadTASTE({ userId, projectId? }):
//   - No projectId  →  return UserTASTE directly
//   - ProjectId present, no project file  →  return UserTASTE directly
//   - Both present  →  mergeTASTEProfiles(user, project)
```

**Critical constraint:** The merged profile must NOT be persisted. It is a runtime-computed view. Persisting it would corrupt the two-layer independence.

### 1.4 File Structure (Confirmed)

```
data/
  taste/
    users/
      {userId}/
        profile.json        # User TASTE (persisted by C.1 CultureDetectionService)
        history/
          {timestamp}.json  # Immutable version snapshots
    projects/
      {projectId}/
        profile.json        # Project TASTE (created by C.5 project interview)
        history/
          {timestamp}.json
  culture/
    sessions/
      {sessionId}.json      # Detection session state
```

---

## 2. PI-AGENT CONTEXT-AWARE LOADING MECHANISM

### 2.1 Integration Architecture

The existing `OriginOSAgent` class at `src/lib/integrations/pi-agent/core/agent.ts` has a `systemPrompt` field on `OriginOSAgentConfig` and a `ProjectContext` that already carries `projectId`. This is the natural injection point.

**Proposed architecture (single-responsibility, non-breaking):**

```
New file: src/lib/taste/taste-loader.ts
New file: src/lib/integrations/pi-agent/taste-context.ts

Modification: OriginOSAgent.initialize() - add optional TASTE loading step
```

No new middleware layer is needed. No changes to existing API routes are needed.

### 2.2 Injection Point in OriginOSAgent

The `OriginOSAgentConfig` already carries `projectContext.projectId`. The loading logic:

```
OriginOSAgent.initialize(config):
  1. Build system prompt (existing step)
  2. Load TASTE context (new step, only if userId is available)
     a. TasteLoader.loadTASTE({ userId, projectId? })
     b. If TASTE is null or empty → skip injection (graceful degradation)
     c. If TASTE present → append taste section to system prompt
  3. Initialize underlying Agent (existing step)
```

The TASTE injection is **append-only** to the system prompt. It does not replace the base prompt. This ensures backward compatibility.

### 2.3 TasteLoader Service Contract

```
Location:    src/lib/taste/taste-loader.ts
Depends on:  src/types/taste.ts (TASTEProfile, mergeTASTEProfiles)
             src/lib/storage/ (JsonStore)
Used by:     src/lib/integrations/pi-agent/core/agent.ts

Interface:
  TasteLoader
    loadTASTE(context: { userId: string; projectId?: string }): Promise<TASTEProfile | null>
    loadUserTASTE(userId: string): Promise<TASTEProfile | null>
    loadProjectTASTE(projectId: string): Promise<TASTEProfile | null>
```

### 2.4 System Prompt Injection Contract

```
Location:    src/lib/integrations/pi-agent/taste-context.ts
Purpose:     Convert TASTEProfile to a compact system prompt section
Used by:     OriginOSAgent.initialize()

Interface:
  createTASTESystemPrompt(taste: TASTEProfile): string

Output format (brief, token-efficient):
  ## 用户品味档案
  - 经验领域: [list]
  - 偏好标准: [per-domain summary]
  - 协作风格: [derived label from tension_position]
  - 委托领域: [delegated_domains]
  - 保留领域: [reserved_domains]
```

### 2.5 Performance Consideration

TASTE loading adds one file-read per agent session initialization. Given the JSON file storage strategy and the NFR of CUI response < 500ms, this is acceptable:
- File read: ~1-5ms (local filesystem)
- Merge computation: ~0.1ms
- System prompt append: ~0.1ms
- Total overhead: negligible vs. 500ms budget

No caching layer is needed in Phase 1. If user sessions become long-lived, a session-scoped cache can be added in Phase 2.

---

## 3. EVOLUTION TRIGGER MECHANISM

### 3.1 Phase 1 Scope (Current)

Phase 1 only produces a TASTE profile from an explicit onboarding dialogue (C.1). There is no background evolution in Phase 1. This is correct.

### 3.2 Evolution Trigger Design for Phase 1.5+

The "后台定时启动演进" mentioned in the inbox is a Phase 1.5+ concern. The design recommendation:

#### 3.2.1 Trigger Signal: Interaction Count Threshold

**Recommended trigger:** Interaction-count batch (not real-time, not calendar-based).

```
Trigger condition: (new_interactions_since_last_evolution >= EVOLUTION_THRESHOLD)
Default threshold: 20 interactions
Minimum interval:  24 hours (prevent rapid oscillation)
```

Rationale: Real-time triggers are expensive and create noise from single interactions. Calendar-based triggers (hourly/daily) run even when no relevant data exists. Interaction-count batching concentrates signal and is cheap to implement with a simple counter in `profile.json`.

#### 3.2.2 Trigger Storage

Add to `TASTEProfile`:

```
metadata.pending_evolution_count: number  (increment on each interaction)
metadata.last_evolved_at: string          (ISO 8601, gate minimum interval)
```

These fields are already in `metadata` which is an extensible object. No schema version bump required.

#### 3.2.3 Evolution Execution

```
Trigger check location: POST /api/agent/sessions (on session creation)
  - If pending_evolution_count >= threshold AND time_since_last_evolution >= 24h
    → Enqueue background job: EvolutionService.evolve(userId, recentInteractions)
    → Reset pending_evolution_count = 0

Evolution executes asynchronously (non-blocking to user session).
```

#### 3.2.4 Conflict Detection (Human Correction vs. Implicit Signal)

Human explicit correction (user directly corrects a taste statement) must override implicit signals.

```
Signal priority (highest to lowest):
  1. Explicit user correction (via confirmation UI - C.2)
  2. Repeated pattern (same signal in 3+ sessions)
  3. Single implicit signal (single session)

Conflict resolution rule:
  - If explicit correction exists on a field → lock that field from implicit updates
  - Lock duration: 30 days by default
  - Lock storage: metadata.locked_fields: Record<fieldPath, ISO8601_expiry>
```

#### 3.2.5 Evolution Frequency Summary

| Phase | Mechanism | Frequency |
|-------|-----------|-----------|
| Phase 1 | Manual onboarding only | Once (explicit) |
| Phase 1.5 | Interaction-count batch | When threshold reached |
| Phase 2+ | Background scheduler | Daily sweep + threshold |

---

## 4. PRIORITY RECOMMENDATION: PHASE 1.5 (C.5) VS C.2-C.3

### 4.1 What C.2 and C.3 Deliver

- **C.2 (Action Confirmation):** UI for user to review and confirm/reject TASTE before it is applied.
- **C.3 (Trust Learning):** System learns from C.2 confirmations to improve future analysis accuracy.

### 4.2 What Phase 1.5 (C.5) Delivers

- **C.5 (Project TASTE):** Implicit TASTE capture during project creation interview. The two-layer architecture is only exercised once C.5 exists.

### 4.3 Dependency Analysis

```
Two-layer TASTE system value:
  C.1 alone → single-layer TASTE → pi-agent personalization (partial)
  C.1 + C.5 → full two-layer TASTE → context-aware personalization (full value)
  C.1 + C.2 → single-layer with confirmation → better accuracy but still single-layer
  C.1 + C.5 + C.2 → full two-layer + user trust → complete system
```

### 4.4 Recommendation: C.5 First (Phase 1.5)

**Rationale:**

1. **Architectural completeness:** The two-layer architecture was designed to have two layers. C.2/C.3 improve the accuracy of a single-layer system. C.5 activates the full architecture.

2. **User value density:** Project context is the highest-signal moment for taste detection. Users create projects intentionally. The implicit capture is more accurate than the generic onboarding dialogue because the context is concrete.

3. **Technical dependency chain:** C.2/C.3 depend on having a TASTE profile to confirm. C.5 produces a second profile layer that gives C.2 more meaningful choices to confirm.

4. **Implementation readiness:** C.5 infrastructure is ~80% ready. `TasteLoader`, `mergeTASTEProfiles()`, project-scoped API endpoints, and the `ProjectContext` in pi-agent already exist or are specified. The delta is the project interview questions and the Project TASTE storage write path.

5. **Risk profile:** C.2 requires a UI review flow (UX design dependency). C.3 requires a feedback loop and learning model (higher LLM integration complexity). C.5 reuses existing C.1 service patterns.

**Recommended sequence:**

```
Phase 1 (current):  C.1 - User TASTE onboarding (done)
Phase 1.5:          C.5 - Project TASTE (implicit capture during project creation)
                    pi-agent TASTE loading (TasteLoader + injection)
Phase 2:            C.2 - Action confirmation UI
                    C.3 - Trust learning from confirmations
```

---

## 5. IMPLEMENTATION ROADMAP

### 5.1 Phase 1.5 Atomic Task Breakdown

#### Task 1.5-A: TasteLoader Service [1 developer-day]
- Scope: `src/lib/taste/taste-loader.ts`
- Implements: `loadTASTE()`, `loadUserTASTE()`, `loadProjectTASTE()`
- Dependencies: `src/lib/storage/` (JsonStore), `src/types/taste.ts`
- Acceptance: Unit tests pass; loads User TASTE when no projectId; loads merged when projectId exists

#### Task 1.5-B: TASTE System Prompt Injection [0.5 developer-day]
- Scope: `src/lib/integrations/pi-agent/taste-context.ts`
- Implements: `createTASTESystemPrompt(taste)`
- Dependencies: `src/types/taste.ts`
- Acceptance: Returns valid compact prompt string; handles empty arrays gracefully

#### Task 1.5-C: OriginOSAgent TASTE Loading Integration [0.5 developer-day]
- Scope: `src/lib/integrations/pi-agent/core/agent.ts` - modify `initialize()`
- Change: Add optional TasteLoader call after system prompt build, before Agent init
- Dependencies: Task 1.5-A, Task 1.5-B
- Acceptance: Agent behaves identically when no TASTE exists; injects prompt section when TASTE exists

#### Task 1.5-D: Project Interview API [2 developer-days]
- Scope: `src/app/api/project/create/` (new routes)
- Implements: start, question, answer, complete endpoints (mirrors C.1 pattern)
- Dependencies: `CultureSessionService` pattern from C.1
- Acceptance: 4-turn interview produces Project TASTE Profile at `data/taste/projects/{projectId}/profile.json`

#### Task 1.5-E: Integration Tests [1 developer-day]
- Scope: `src/lib/taste/__tests__/`, `src/lib/integrations/pi-agent/__tests__/`
- Tests: TasteLoader merge behavior, edge cases (one layer missing), pi-agent injection
- Acceptance: 100% branch coverage on TasteLoader, merge function tested with all conflict scenarios

### 5.2 Effort Summary

| Task | Effort | Priority |
|------|--------|----------|
| 1.5-A TasteLoader | 1 day | Critical |
| 1.5-B Prompt Injection | 0.5 day | Critical |
| 1.5-C Agent Integration | 0.5 day | Critical |
| 1.5-D Project Interview API | 2 days | High |
| 1.5-E Integration Tests | 1 day | High |
| **Total** | **5 developer-days** | - |

---

## 6. TECHNICAL RISKS

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|-----------|
| LLM extraction accuracy < 60% (C.1 Phase 1 uses keyword matching) | High | Medium | Ship C.5 first; real LLM analysis scheduled for C.2/C.3 gate; accuracy improves with more data |
| User perceives project interview as taste interrogation | High | Low-Medium | Question design must frame as "project setup", not "about you". PM to validate wording. |
| Merged profile creates unexpected pi-agent behavior | Medium | Low | Merged profile is ephemeral; fallback to User TASTE if merge fails; agent behavior tested with both layers |
| Conflict between Project TASTE and User TASTE (explicit user correction domain) | Low | Low | Fusion rules defined; Project wins by design; user override via C.2 (Phase 2) |
| `locked_fields` evolution lock mechanism adds schema complexity | Low | Low | Only needed in Phase 2 when C.2 is live; do not add in Phase 1.5 |

---

## 7. SUCCESS METRICS

| Metric | Target | Measurement |
|--------|--------|-------------|
| TasteLoader latency | < 10ms | Unit test benchmark |
| TASTE injection overhead on session init | < 50ms | Integration test |
| Project TASTE generation success rate | > 90% | API response status monitoring |
| Two-layer merge correctness | 100% | Unit tests covering all conflict scenarios |
| pi-agent system prompt token increase | < 200 tokens | Prompt output length check |

---

## 8. FILES REQUIRING CREATION (Phase 1.5)

```
src/lib/taste/taste-loader.ts              (new)
src/lib/taste/taste-loader.test.ts         (new)
src/lib/integrations/pi-agent/taste-context.ts   (new)
src/app/api/project/create/start/route.ts  (new)
src/app/api/project/create/[sessionId]/question/route.ts  (new)
src/app/api/project/create/[sessionId]/answer/route.ts    (new)
src/app/api/project/create/[sessionId]/complete/route.ts  (new)
```

```
src/lib/integrations/pi-agent/core/agent.ts   (modify: add TASTE loading in initialize())
```

---

## 9. REFERENCES

- `src/types/taste.ts` - TASTEProfile schema and mergeTASTEProfiles()
- `src/lib/features/culture/services/CultureDetectionService.ts` - C.1 detection service pattern to replicate for C.5
- `src/lib/integrations/pi-agent/core/agent.ts` - injection point
- `src/lib/integrations/pi-agent/system/prompt.ts` - system prompt construction
- `src/lib/integrations/pi-agent/system/config.ts` - ProjectContext (carries projectId)
- `docs/specs/epic-C/story-C.1/api-design.md` - C.1 API spec
- `docs/specs/epic-C/story-C.1/architecture-review.md` - prior architecture review (2026-03-12)

---

**Architect:** System Architect
**Delivered:** 2026-03-15
**Next action:** PM to decide Phase 1.5 scope based on this assessment, then assign 1.5-A, 1.5-B, 1.5-C to Developer.
