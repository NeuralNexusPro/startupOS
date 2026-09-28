# Phase 1 Technical Feasibility Assessment
## Architect + Developer Joint Review - 2026-03-05

---

## 📊 Executive Summary

**Bottom Line:** Phase 1 Option BProgressive Approach is **FEASIBLE** with scope adjustments.

| Assessment Result | Details |
|------------------|---------|
| **Week 1-2 Feasibility** | ✅ FEASIBLE (4-5 days dev effort) |
| **Week 3-4 Scope** | ⚠️ Reduce from 4 features to 3 |
| **Data Infrastructure** | ⚠️ PostgreSQL NOT in current codebase - file-based JSON used instead |
| **Architecture** | ✅ Phase 1 structure subset of Phase 3 - zero migration needed |

---

## 🔍 Critical Finding: PostgreSQL Discrepancy

### Architect's Assumption
- PostgreSQL is available for Phase 1
- JSONB columns sufficient for taste data
- Five-table schema design provided

### Developer's Discovery
- **PostgreSQL is NOT implemented in current codebase**
- Current storage is **file-based JSON** (`src/lib/storage/json-store.ts`)
- Pattern follows interview/ontology storage in `data/` directory

### Resolution
**Decision: Use file-based JSON for Phase 1, add PostgreSQL in Phase 2 when needed**

**Reasoning:**
- No migration risk
- Follows existing patterns (interviews, ontologies)
- Simpler implementation (Week 1-2 effort reduced)
- PostgreSQL can be added later when complex queries are needed

---

## 🏗️ Architect's Assessment

### 1. Complete 4-Dimension Data Structure

**Architecture Decision:**

| Phase | Storage | Reason |
|-------|---------|--------|
| Phase 1 | PostgreSQL JSONB* or File JSON | Sufficient for < 10k memories |
| Phase 3 | Neo4j/Memgraph (optional) | Multi-hop queries, cross-user patterns |

*Note: Current codebase uses file-based JSON

**Five Table Schema (PostgreSQL JSONB format):**

```sql
CREATE TABLE taste_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  project_id UUID NOT NULL,
  status VARCHAR(50) NOT NULL,
  started_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP
);

CREATE TABLE taste_dialogue_turns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES taste_sessions(id),
  round_number INTEGER NOT NULL,
  role VARCHAR(20) NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE taste_experience_topology (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES taste_sessions(id),
  domains JSONB NOT NULL,
  evidence_sources JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE taste_standards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES taste_sessions(id),
  domain VARCHAR(100) NOT NULL,
  positive_vibes JSONB NOT NULL,
  negative_vibes JSONB NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE taste_manifest (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  version VARCHAR(20) DEFAULT '1.0.0',
  experience_topology JSONB,
  taste_standards JSONB,
  tension_position JSONB,
  symbiosis_boundary JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### 2. Week 1-2 Feasibility

**Answer: FEASIBLE** (with infrastructure dependency)

| Component | Status | Effort |
|-----------|--------|--------|
| pi-agent integration | Existing (Epic 0) | 0 days |
| Dialogue capture | Existing (CUI) | 0 days |
| LLM analysis | Existing | 0 days |
| PostgreSQL setup | Not started | +2 days* |
| API endpoints | Needed | +2 days |

*Using file-based JSON reduces to 0 days

### 3. Data Evolution: Phase 1 → Phase 3

**No migration needed** - Phase 1 is subset of Phase 3:

```typescript
// Phase 1: Simple structure
{
  taste_standards: {
    "code-review": {
      positive_vibes: ["constructive"],
      negative_vibes: ["nitpicking"]
    }
  }
}

// Phase 3: Same structure, more domains + patterns
{
  taste_standards: {
    "code-review": {
      positive_vibes: ["constructive", "explanatory"],
      negative_vibes: ["nitpicking", "dismissive"]
    },
    "architecture-design": { ... }
  },
  cross_session_patterns: [...] // New in Phase 3
}
```

### 4. Integration with Existing pi-agent

**New Tools to Create** at `src/lib/integrations/pi-agent/tools/taste-analysis-tools.ts`:
- `extractExperienceTopologyTool`
- `extractTasteStandardsTool`

---

## 💻 Developer's Assessment

### 1. Week 1-2 Implementation Feasibility

**Answer: YES** - with proper task breakdown

**Task Breakdown:**

| Week | Tasks | Days |
|------|-------|------|
| Week 1 | Culture Detection Service + Database Layer + API Layer | 5 |
| Week 2 | Pi-Agent Integration + TASTE Draft Generation + Testing | 5 |

**Total: 10 days** (fits in 2-week sprint with buffer)

### 2. API Design

**4 Endpoints:**

1. `POST /api/culture/detection/start` - Start detection session
2. `POST /api/culture/detection/:sessionId/message` - Send dialogue message
3. `POST /api/culture/detection/:sessionId/analyze` - Trigger LLM analysis
4. `GET /api/culture/detection/:sessionId/taste-draft` - Get TASTE profile

**Sample API Response:**
```typescript
{
  sessionId: "culture-xxx",
  projectId: "proj-xxx",
  currentRound: 3,
  maxRounds: 3,
  status: "completed",
  tasteDraft: {
    summary: {
      experience_topology: ["code-review", "architecture-design"],
      taste_standards: {
        "code-review": {
          positive_vibes: ["constructive feedback"],
          negative_vibes: ["nitpicking formatting"]
        }
      }
    }
  }
}
```

### 3. State Management

**Service Layer:**
```typescript
export class CultureSessionService {
  async startDetection(request: StartCultureDetectionRequest)
  async addMessage(sessionId: string, content: string)
  async analyzeCulture(sessionId: string)
  async getTasteDraft(sessionId: string)
}
```

**Storage Structure (file-based):**
```
data/
  culture/
    {sessionId}.json        // Detection session
  taste/
    {projectId}/
      draft.json            // Latest TASTE draft
      history/
        {timestamp}.json    // Historical drafts
```

### 4. Week 3-4 Scope Assessment

**Answer: NO** - Cannot complete all 4 features in 2 weeks

**Reality Assessment:**

| Feature | Effort | Priority |
|---------|--------|----------|
| 1. Action Confirmation | 2-3 days | P1 |
| 2. Taste Collection | 3-4 days | P2 |
| 3. Trust Learning | 2-3 days | P1 |
| 4. Integration Testing | 2-3 days | **Defer to Phase 2** |

**Total: 9-13 days** - Exceeds 2 weeks

**Recommended Priority & Scope Reduction:**

**Execute in Phase 1:**
1. ✅ Action confirmation (intercept + modal) - **Week 3, Days 1-3**
2. ✅ Trust counter + threshold modal - **Week 3, Days 4-5**
3. ✅ Explicit taste feedback (user-provided) - **Week 4, Days 1-2**

**Defer to Phase 2:**
4. ❓ Implicit taste collection (automated extraction)
5. ❓ Full integration test suite

**Revised Week 3-4 Schedule:**
```
Week 3:
  Days 1-3: Action confirmation
  Days 4-5: Trust counter + threshold

Week 4:
  Days 1-2: Explicit taste feedback
  Days 3-4: Bug fixes & refinement
  Day 5: Smoke tests
```

### 5. Data Structure Decision

**Answer: File-based JSON is SUFFICIENT for Phase 1**

**TASTE Draft Schema:**
```typescript
{
  version: "1.0.0",
  createdAt: "2026-03-05T10:10:00Z",
  data: {
    projectId: "proj-xxx",
    sourceSessionId: "culture-xxx",
    version: 1,
    summary: {
      experience_topology: ["code-review", "architecture-design"],
      taste_standards: {
        "code-review": {
          positive_vibes: ["constructive feedback"],
          negative_vibes: ["nitpicking formatting"]
        }
      },
      tension_position: {
        control_level: 0.6,
        trust_level: 0.5,
        intervention_threshold: 0.7
      },
      symbiosis_boundary: {
        delegated_domains: ["code-generation", "documentation"],
        reserved_domains: ["security-reviews", "deployments"],
        contextual_triggers: ["critical-bug", "production-issue"]
      }
    },
    memory_stats: {
      total_memories: 0,
      high_confidence_count: 0,
      avg_confidence: 0
    },
    trust_score: {
      successful_actions: 0,
      total_actions: 0,
      user_confirms: 0
    }
  }
}
```

**Migration Strategy (Future):**
1. JSON files → PostgreSQL bulk import
2. Schema version tracking
3. Backward-compatible JSON export for portability

---

## 🎯 Consolidated Recommendations

### For PM: Phase 1 Scope Finalization

**Week 1-2: Cultural Detection + TASTE Draft**
- ✅ Feasible with 10 days effort
- ✅ Use file-based JSON (follows existing patterns)
- ⚠️ LLM prompt tuning may require iteration

**Week 3-4: 3 Features (not 4)**
1. ✅ Action confirmation (Week 3, Days 1-3)
2. ✅ Trust learning (Week 3, Days 4-5)
3. ✅ Explicit taste collection (Week 4, Days 1-2)
4. ❌ Defer: Implicit collection + full testing (Phase 2)

### For Architect: Data Infrastructure

**Decision: Use file-based JSON for Phase 1**

**Migration Path to PostgreSQL (Phase 2-3):**
```
Phase 1: File-based JSON (data/culture/, data/taste/)
   ↓
Phase 2: Add PostgreSQL adapter (keep both running)
   ↓
Phase 3: Migrate to PostgreSQL (Neo4j optional for complex queries)
```

**Rationale:**
- Follows existing interview/ontology patterns
- No infrastructure setup needed
- Seamless integration with existing codebase
- Migration strategy when complex queries needed

### For Developer: Implementation Priority

**Week 1-2 Files to Create:**
```
src/lib/features/culture/
  index.ts
  culture-session-service.ts
  culture-detection-service.ts
  types.ts
  __tests__/

src/app/api/culture/
  detection/route.ts
  detection/[sessionId]/route.ts
  detection/[sessionId]/message/route.ts
  detection/[sessionId]/analyze/route.ts
  detection/[sessionId]/taste-draft/route.ts
```

**Week 3-4 Priority Order:**
1. Action confirmation (middleware + modal)
2. Trust counter + threshold modal
3. Explicit taste feedback (forms + storage)

---

## 📋 Next Steps for PM

With technical feasibility confirmed, PM should:

1. **Update Phase 1 Requirements**
   - Apply 3-feature scope reduction (defer implicit collection + full testing)
   - Specify file-based JSON storage (not PostgreSQL)
   - Include Week 1-2 API end detailed specs

2. **Coordinate with UX Designer**
   - Confirm 3-feature UI scope
   - Align with revised Week 3-4 timeline

3. **Final Decision Document**
   - Submit Team Leader for formal approval
   - Include architect + developer feasibility sign-off

---

## ⚠️ Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|-----|-----------|--------|-----------|
| LLM prompt tuning requires > 2 days | Medium | Medium | Start with 2-round detection, iterate |
| File-based JSON doesn't scale | Low | High | Migration path to PostgreSQL designed |
| 3-weeks insufficient for features | Low | High | Scope reduction recommended |

---

## ✅ Sign-Off

| Role | Assessment | Status |
|-----|-----------|--------|
| Architect | Week 1-2 FEASIBLE, 3-dim schema design complete | ✅ |
| Developer | Week 1-2 YES, Week 3-4 scope reduce to 3 features | ✅ |
| PM | Technical validation received, updating requirements | ⏳ |

---

**Assessment Date:** 2026-03-05
**Next Milestone:** PM updates requirements by 2026-03-06
**Status:** Ready for Phase 1 Launch (pending PM requirements update)
