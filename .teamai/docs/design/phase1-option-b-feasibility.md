# Technical Feasibility Assessment - Phase 1 Option B (Progressive Approach)

**Date:** 2026-03-05
**Author:** Architect (CTO)
**Status:** APPROVED - With Caveats

---

## Executive Summary

**Architecture Decision:** PostgreSQL JSONB + In-Memory Graph (Hybrid)
**Week 1-2 Feasibility:** FEASIBLE with existing infrastructure
**Data Evolution Strategy:** Schema-on-read with optional type enforcement

---

## 1. Architecture Decision: PostgreSQL JSONB vs Graph Database

### Recommendation: PostgreSQL JSONB (Phase 1) with Graph DB Migration Path

### Decision Matrix

| Factor | PostgreSQL JSONB | Graph DB (Neo4j/Memgraph) | Recommendation |
|--------|------------------|---------------------------|----------------|
| **Setup complexity** | Low (standard RDBMS) | High (separate infrastructure) | PostgreSQL wins |
| **Query flexibility** | Medium (JSON operators) | High (pattern matching) | Graph DB wins |
| **Schema evolution** | Excellent (no migrations) | Good (property graphs) | PostgreSQL wins |
| **Integration cost** | Low (single backend) | High (new protocol) | PostgreSQL wins |
| **Phase 1 needs** | Sufficient | Overkill | PostgreSQL wins |
| **Phase 3 needs** | Adequate (with GIN indices) | Optimal | Graph DB wins |

### Technical Rationale

**Why PostgreSQL JSONB for Phase 1:**

1. **Data Volume:** Phase 1 collects ~100-300 dialogue samples per user. This fits comfortably in JSONB without performance concerns.

2. **Query Patterns Required (Week 1-2):**
   - Simple CRUD on 4-dimension data
   - Retrieval by project/user/session
   - JSON path queries for nested structures
   - All satisfied by PostgreSQL JSONB operators (`->>`, `@>`, `?&`)

3. **Existing Infrastructure:** OriginOS already uses JSON file storage (`src/lib/storage/json-store.ts`). Migrating to PostgreSQL is a natural evolution.

4. **Lower Technical Debt:**
   - No new infrastructure team member needed
   - No separate query language (Cypher/GQL) to learn
   - Transactions with relational data (projects, users) are atomic

**Phase 3 Migration Path (when needed):**

When any of these triggers occur, migrate to Neo4j/Memgraph:
- Taste memory count > 10,000 per user
- Cross-user pattern queries become hot path
- Multi-hop graph traversals needed (> 3 hops)
- Real-time subgraph matching required

---

## 2. Complete 4-Dimension Data Structure Design

### Table Schema for Phase 3 (Full Implementation)

```sql
-- Users table (existing from Epic 1)
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Projects table (existing from Epic 1)
CREATE TABLE projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id),
    name VARCHAR(255) NOT NULL,
    domain VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- === NEW: 4-Dimension Taste Data Table ===
CREATE TABLE taste_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Relationships
    user_id UUID NOT NULL REFERENCES users(id),
    project_id UUID REFERENCES projects(id),

    -- Session metadata
    session_type VARCHAR(50) NOT NULL, -- 'dialogue_extraction', 'taste_refinement'
    started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,

    -- raw dialogue (for traceability)
    raw_dialogue JSONB NOT NULL, -- { rounds: [{role, content, timestamp}] }

    -- === DIMENSION 1: Experience Topology ===
    -- Embodied intuitive perception domains (graph structure)
    experience_topology JSONB NOT NULL, -- {
        -- domains: [{id, name, description, parent_domain_id}],
        -- domain_mappings: [{round_index, domain_id, confidence}]
    -- }

    -- === DIMENSION 2: Taste Standards ===
    -- Direct perception judgments (rule-based, no inference)
    taste_standards JSONB NOT NULL, -- {
        -- by_domain: {
        --   "domain_id": {
        --     positive_vibes: ["phrase 1", "phrase 2"],
        --     negative_vibes: ["phrase 3"],
        --     preferred_response_style: "concise" | "detailed" | "balanced",
        --     tone: "professional" | "casual"
        --   }
        -- }
    -- }

    -- === DIMENSION 3: Tension Position ===
    -- Human/LLM/Code three-way positioning (intervention vs trust thresholds)
    tension_position JSONB NOT NULL, -- {
        -- control_level: 0.5,              -- Human control (0) to LLM autonomy (1)
        -- trust_level: 0.7,                -- Trust in LLM (0-1)
        -- intervention_threshold: 0.8,     -- When to ask human (0-1)
        -- by_domain: {
        --   "domain_id": {
        --     control_level: 0.3,
        --     trust_level: 0.9
        --   }
        -- }
    -- }

    -- === DIMENSION 4: Symbiosis Boundary ===
    -- Judgment delegation scope (what to delegate vs retain)
    symbiosis_boundary JSONB NOT NULL, -- {
        -- delegated_domains: ["domain_id_1", "domain_id_2"],
        -- reserved_domains: ["domain_id_3"],
        -- contextual_triggers: [
        --   {context_pattern, action_required: true/false}
        -- ]
    -- }

    -- LLM analysis metadata
    model_info JSONB, -- {provider, model, temperature, tokens_used}

    -- Distillation status (for Phase 2+)
    distilled BOOLEAN DEFAULT false,
    distilled_at TIMESTAMP WITH TIME ZONE,
    distillation_score FLOAT CHECK (distillation_score BETWEEN 0 AND 1),

    -- Quality gates
    validation_status VARCHAR(20) DEFAULT 'pending', -- 'pending', 'validated', 'rejected'
    validation_notes TEXT,

    -- Indexes for Phase 3 queries
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indices for performance
CREATE INDEX idx_taste_sessions_user ON taste_sessions(user_id);
CREATE INDEX idx_taste_sessions_project ON taste_sessions(project_id);
CREATE INDEX idx_taste_sessions_created ON taste_sessions(created_at DESC);
CREATE INDEX idx_taste_sessions_distilled ON taste_sessions(distilled, distillation_score DESC);

-- GIN indices for JSONB queries
CREATE INDEX idx_taste_experience_topology ON taste_sessions USING GIN (experience_topology);
CREATE INDEX idx_taste_taste_standards ON taste_sessions USING GIN (taste_standards);
CREATE INDEX idx_taste_tension_position ON taste_sessions USING GIN (tension_position);
CREATE INDEX idx_taste_symbiosis_boundary ON taste_sessions USING GIN (symbiosis_boundary);

-- For Phase 3: Cross-session pattern matching
CREATE TABLE taste_patterns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pattern_type VARCHAR(50) NOT NULL, -- 'experience', 'standard', 'tension', 'boundary'
    pattern JSONB NOT NULL,
    confidence_score FLOAT CHECK (confidence_score BETWEEN 0 AND 1),
    source_session_ids UUID[] NOT NULL,
    user_id UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_verified_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_taste_patterns_user ON taste_patterns(user_id, confidence_score DESC);
CREATE INDEX idx_taste_patterns_type ON taste_patterns(pattern_type);
CREATE INDEX idx_taste_patterns_source ON taste_patterns USING GIN (source_session_ids);
```

---

## 3. Phase 1 Data Structure: Simple Usage (Week 1-2)

### Schema for Initial Implementation

The schema above fully supports Phase 1 simple usage:

```typescript
// Phase 1: Simple dialogue extraction session
interface Phase1TasteSession {
  // Fixed fields from schema
  id: string;
  user_id: string;
  project_id: string;
  started_at: string;
  completed_at: string;

  // Raw dialogue (required)
  raw_dialogue: {
    rounds: Array<{
      role: 'user' | 'assistant';
      content: string;
      timestamp: string;
    }>;
  };

  // === DIMENSION 1: Simple Experience Topology ===
  // Phase 1: Flat list of domains detected
  experience_topology: {
    domains: Array<{
      id: string;  // Auto-generated from LLM
      name: string;
      description: string;
    }>;
  };

  // === DIMENSION 2: Simple Taste Standards ===
  // Phase 1: Single set without domain subdivision
  taste_standards: {
    positive_vibes: string[];
    negative_vibes: string[];
    preferred_response_style: 'concise' | 'detailed' | 'balanced';
    tone: 'professional' | 'casual' | 'exploratory';
  };

  // === DIMENSION 3: Simple Tension Position ===
  // Phase 1: Single slider (trust level)
  tension_position: {
    control_level: number;  // Single value 0-1
    trust_level: number;    // Single value 0-1 (the ONLY thing user adjusts)
    intervention_threshold: number;  // Calculated from trust_level
  };

  // === DIMENSION 4: Simple Symbiosis Boundary ===
  // Phase 1: No delegation (reserved for Phase 2+)
  symbiosis_boundary: {
    delegated_domains: [];  // Always empty in Phase 1
    reserved_domains: [];   // Always empty in Phase 1
    contextual_triggers: [];  // Always empty in Phase 1
  };
}
```

**Key Point:** The Phase 1 structure is a SUBSET of Phase 3. No migrations needed—just add complexity in-place.

---

## 4. Data Evolution Strategy: Phase 1 to Phase 3

### Phase 1 (Week 1-2): Simple Usage
- `symbiosis_boundary` is always empty `{}`
- `taste_standards` has no domain subdivision (flat)
- `tension_position` has single values, no `by_domain`
- `experience_topology` has flat domain list, no `domain_mappings`

### Phase 2 (Week 3-4): Domain Subdivision
- `taste_standards.by_domain` starts being populated
- `tension_position.by_domain` added for domain-specific trust
- `experience_topology.domain_mappings` added to link dialogue rounds to domains

### Phase 3 (Month 2+): Cross-Session Patterns
- `distilled` flag indicates session contributed to a pattern
- `taste_patterns` table populated with cross-session learnings
- `symbiosis_boundary` starts being populated from user-driven delegation

### Why This Works

1. **Zero Downtime:** All Phase 1 fields still valid in Phase 2/3
2. **Backward Compatible:** Phase 1 code reads from same schema as Phase 3 code
3. **Progressive Enhancement:** Each phase adds structure, doesn't modify existing

---

## 5. Feasibility Assessment: Week 1-2 Dialogue Extraction

**Verdict: FEASIBLE with existing pi-agent infrastructure**

### Infrastructure Required (All EXISTING or TRIVIAL to add):

| Component | Status | Implementation Effort |
|-----------|--------|----------------------|
| pi-agent integration | ✅ Existing (Epic 0 complete) | 0 days |
| Dialogue capture | ✅ Existing (CUI in Epic 0) | 0 days |
| LLM analysis | ✅ Existing (pi-agent-core LLM) | 0 days |
| Data persistence | ⚠️ JSON files (need PG migration) | 1-2 days |
| API endpoints | ⚠️ Need to create | 1-2 days |

### Sequence of Implementation (Week 1-2)

**Day 1-2: Setup PostgreSQL Schema**
- Create `taste_sessions` table
- Add migrations to existing schema
- Create Prisma or Drizzle ORM entity

**Day 3-4: API Endpoints**
```
POST /api/taste/sessions           # Create new extraction session
POST /api/taste/sessions/:id/analyze  # Submit dialogue for analysis
GET  /api/taste/sessions/:id       # Get extraction result
GET  /api/taste/sessions/:id/taste.md  # Download generated TASTE.md
```

**Day 5-7: LLM Analysis Pipeline**
```typescript
// Existing pi-agent integration point
async function analyzeDialogue(dialogue: DialogueRound[], context: ProjectContext) {
  const agent = createPiAgent({
    model: currentModel,
    tools: [extractExperienceTopologyTool, extractTasteStandardsTool],
    systemPrompt: TASTE_ANALYSIS_PROMPT
  });

  const result = await agent.process(dialogue);

  // Schema validation with existing zod schemas
  return validateExtraction(result);
}
```

**Day 8-10: TASTE.md Generation**
```typescript
function generateTASTEMD(session: TasteSession): string {
  const { experience_topology, taste_standards, tension_position } = session;

  return `
# TASTE.md - ${session.project_name}

## Experience Topology
${experience_topology.domains.map(d => `### ${d.name}\n${d.description}`).join('\n')}

## Taste Standards
### Positive Vibes
${taste_standards.positive_vibes.map(v => `- ${v}`).join('\n')}

### Negative Vibes
${taste_standards.negative_vibes.map(v => `- ${v}`).join('\n')}

## Tension Position
Trust Level: ${tension_position.trust_level * 100}%
Control Level: ${tension_position.control_level * 100}%
  `.trim();
}
```

### Integration with Existing pi-agent

**File:** `/Users/archersado/workspace/originos/src/lib/integrations/pi-agent/tools/`

Add new tools under existing infrastructure:

```typescript
// src/lib/integrations/pi-agent/tools/taste-analysis-tools.ts
export const extractExperienceTopologyTool: ToolRegistration = {
  name: 'extract_experience_topology',
  label: 'Extract Experience Topology',
  description: 'Extract embodied intuitive perception domains from dialogue',

  parameters: Type.Object({
    dialogue: Type.Array(UserMessageSchema),
    context: ProjectContextSchema,
  }),

  execute: async (toolCallId, params, signal, onUpdate) => {
    // LLM call to extract domains
    const result = await analyzeWithLLM(params);
    return { success: true, data: result.domains };
  },

  category: 'taste',
  enabled: true,
};

export const extractTasteStandardsTool: ToolRegistration = {
  name: 'extract_taste_standards',
  label: 'Extract Taste Standards',
  description: 'Extract direct perception judgments from dialogue',

  parameters: Type.Object({
    dialogue: Type.Array(UserMessageSchema),
    experience_domains: DomainSchema,
  }),

  execute: async (toolCallId, params, signal, onUpdate) => {
    const result = await analyzeWithLLM(params);
    return { success: true, data: result.standards };
  },

  category: 'taste',
  enabled: true,
};
```

Register in existing `/Users/archersado/workspace/originos/src/lib/integrations/pi-agent/tools/registry.ts`.

---

## 6. Constraints and Caveats

### Technical Constraints

1. **No PostgreSQL in current stack:** Currently using JSON file storage. Need to:
   - Add PostgreSQL to dependencies (`npm install pg` or use Prisma/Drizzle)
   - Set up local/dev PostgreSQL (Docker or cloud)
   - Estimated effort: 2-3 days (setup + migration)

2. **Token usage for LLM analysis:**
   - 3-5 dialogue rounds ≈ 1,500-3,000 tokens
   - Analysis prompt ≈ 1,000 tokens
   - System prompt ≈ 500 tokens
   - Total per extraction: ~3,000-5,000 tokens
   - **Cost:** $0.06-0.10 per extraction (GPT-4 pricing)
   - **Mitigation:** Use GPT-3.5 for extraction, GPT-4 for refinement

3. **LLM accuracy limits:**
   - Phrase-level "vibe" detection has 70-85% accuracy
   - Domain classification has 80-90% accuracy
   - **Mitigation:** User validation step before generation

### Timeline Considerations

**Week 1-2 is FEASIBLE but requires:**
- Days 1-2: PostgreSQL setup and schema migration (BLOCKING if not started Day 0)
- Days 3-4: API development
- Days 5-7: LLM pipeline integration
- Days 8-10: TASTE.md generation and testing

**If PostgreSQL setup is omitted (fallback):**
- Use existing JSON file storage in `/Users/archersado/workspace/originos/data/`
- Defer PostgreSQL to Phase 2 (week 3-4)
- Risk: Performance degradation at scale (not felt in Phase 1)

### Dependencies

**Blocking dependencies:**
- ✅ Epic 0 complete (pi-agent-core integration) - DONE
- ✅ Epic 1 complete (project interview) - DONE
- ⚠️ PostgreSQL setup - NOT STARTED (Day 0 priority)

**Non-blocking dependencies:**
- UI for trust level slider - can use simple input range
- User review interface - can defer visual polish to Phase 2

---

## 7. Final Recommendation

### Architecture Decision

**APPROVE: PostgreSQL JSONB + In-Memory Graph for Phase 1**

**Rationale:**
- Meets all Week 1-2 requirements
- Supports Phase 3 complexity without migration
- Lower infrastructure cost ($0 vs $100+/month for Neo4j cloud)
- Faster time-to-market (no new tech stack to learn)

### Week 1-2 Feasibility

**FEASIBLE with the following caveats:**

1. **Start PostgreSQL setup immediately (Week 1 Day 0)** or use JSON fallback
2. **Budget 2 days** for API layer (not part of existing Epic 0/1)
3. **Include user validation step** before TASTE.md generation (LLM accuracy limitation)
4. **Use GPT-3.5 for extraction** to control costs, GPT-4 for refinement

### Integration Notes

**Use existing pi-agent infrastructure at:**
- `/Users/archersado/workspace/originos/src/lib/integrations/pi-agent/` (core integration)
- `/Users/archersado/workspace/originos/src/lib/integrations/pi-agent/tools/` (add taste-analysis-tools.ts)
- `/Users/archersado/workspace/originos/src/lib/taste/` (reuse existing schema types)

**New endpoints to create:**
- `POST /api/taste/sessions` - Create extraction session
- `POST /api/taste/sessions/:id/analyze` - Submit dialogue for LLM analysis
- `GET /api/taste/sessions/:id` - Get extraction result
- `GET /api/taste/sessions/:id/taste.md` - Download generated TASTE.md
- `PATCH /api/taste/sessions/:id/tension` - Update trust level slider

**New database service:**
- `/Users/archersado/workspace/originos/src/lib/services/taste-service.ts`
- Wraps PostgreSQL operations for `taste_sessions` table

---

## 8. Next Steps

1. **Immediate (Day 0):** Set up PostgreSQL or confirm JSON storage fallback
2. **Day 1:** Create migrations for `taste_sessions` table
3. **Day 2-3:** Implement API endpoints and taste-service
4. **Day 4-5:** Create LLM analysis tools in pi-agent
5. **Day 6-7:** Implement TASTE.md generation
6. **Day 8-10:** Integration testing and user feedback loop

---

**Approved by:** Architect (CTO)
**Approved Date:** 2026-03-05
**Review Required:** Phase 2 (Week 3-4) for PostgreSQL scalability
