# Skills API Endpoints

## Overview

The Skills API provides endpoints for managing and accessing Claude Skills in OriginOS. It follows the [Agent Skills Standard](https://www.agentskills.io/) and integrates with the pi-agent framework.

## Endpoints

### GET /api/skills

List all available skills across all sources.

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `source` | string | Filter by source type: `bundled`, `user`, `project` |
| `includeInvisible` | boolean | Include skills with `disableModelInvocation=true` (default: `false`) |
| `includeDiagnostics` | boolean | Include diagnostics in response (default: `true`) |

**Response:**
```json
{
  "success": true,
  "data": {
    "skills": [
      {
        "name": "example-skill",
        "description": "A demonstration skill",
        "source": "project",
        "filePath": "/path/to/SKILL.md",
        "baseDir": "/path/to",
        "disableModelInvocation": false
      }
    ],
    "diagnostics": []
  },
  "meta": {
    "total": 1,
    "sources": {
      "bundled": 0,
      "user": 0,
      "project": 1
    }
  },
  "timestamp": "2026-03-24T00:00:00.000Z"
}
```

### GET /api/skills/:name

Get detailed information about a specific skill.

**Path Parameters:**
- `name`: Skill name (e.g., `example-skill`)

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `includeInvisible` | boolean | Return skill even if `disableModelInvocation=true` (default: `true`) |

**Response:**
```json
{
  "success": true,
  "data": {
    "name": "example-skill",
    "description": "A demonstration skill",
    "source": "project",
    "filePath": "/path/to/SKILL.md",
    "baseDir": "/path/to",
    "disableModelInvocation": false,
    "content": "# Skill Content\n\nThis is the skill markdown content.",
    "frontmatter": {
      "name": "example-skill",
      "description": "A demonstration skill"
    }
  },
  "timestamp": "2026-03-24T00:00:00.000Z"
}
```

### GET /api/skills/:name/content

Get the raw markdown content of a skill.

**Path Parameters:**
- `name`: Skill name

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `includeFrontmatter` | boolean | Include YAML frontmatter in JSON response (default: `false`) |
| `format` | string | Response format: `raw` or `json` (default: `raw`) |

**Response (format=raw):**
Returns raw markdown with `Content-Type: text/markdown`

**Response (format=json):**
```json
{
  "success": true,
  "data": {
    "content": "---\nname: example-skill\ndescription: A demonstration skill\n---\n\n# Skill Content\n\nThis is the skill markdown content.",
    "frontmatter": {
      "name": "example-skill",
      "description": "A demonstration skill"
    }
  },
  "timestamp": "2026-03-24T00:00:00.000Z"
}
```

### POST /api/skills/refresh

Force reload all skills from disk. Useful for development when skills are added/modified.

**Response:**
```json
{
  "success": true,
  "data": {
    "skills": [...],
    "diagnostics": [...]
  },
  "message": "Skills reloaded successfully",
  "meta": {
    "total": 10,
    "sources": { ... },
    "diagnosticsCount": 0
  },
  "timestamp": "2026-03-24T00:00:00.000Z"
}
```

### POST /api/skills/_test

Development endpoint to test skill loading and view diagnostics.

**Response:**
```json
{
  "success": true,
  "data": {
    "totalSkills": 10,
    "diagnosticsCount": 2,
    "errors": 0,
    "warnings": 2,
    "collisions": 0,
    "skillsBySource": {
      "bundled": 5,
      "user": 2,
      "project": 3
    },
    "diagnostics": [...],
    "skillNames": [...]
  }
}
```

## Skill File Format

Skills are defined in markdown files with YAML frontmatter:

```markdown
---
name: my-skill
description: A brief description of what this skill does
disable-model-invocation: false
---

# Skill Title

This is the skill content that will be loaded into the agent's context.

## Usage Instructions

Provide clear instructions for when and how to use this skill.
```

## Skill Sources

### Bundled Skills (`skills/`)
- Shipped with OriginOS
- Lowest precedence (overridden by user/project skills)
- Located at `/skills` in project root

### User Skills (`.claude/skills/`)
- User-installed skills
- Medium precedence
- Located at `/.claude/skills` in the project

### Project Skills (`.originos/skills/`)
- Project-specific skills
- Highest precedence (overrides bundled/user skills)
- Located at `/.originos/skills` in the project

## Validation Rules

### Name Validation
- Maximum 64 characters
- Must match parent directory name (if specified in frontmatter)
- Only lowercase a-z, 0-9, and hyphens
- Cannot start or end with a hyphen
- Cannot contain consecutive hyphens

### Description Validation
- Required field
- Maximum 1024 characters
- Cannot be empty

## Error Codes

| Code | Description |
|------|-------------|
| `NOT_FOUND` | Skill not found |
| `DISABLED` | Skill has `disableModelInvocation` set to true |
| `INVALID_REQUEST` | Invalid parameters |
| `INTERNAL_ERROR` | Server error |

## Usage Examples

### List all skills
```bash
curl http://localhost:3000/api/skills
```

### Filter by source
```bash
curl http://localhost:3000/api/skills?source=project
```

### Get skill details
```bash
curl http://localhost:3000/api/skills/my-skill
```

### Get skill content as markdown
```bash
curl http://localhost:3000/api/skills/my-skill/content
```

### Get skill content as JSON
```bash
curl http://localhost:3000/api/skills/my-skill/content?format=json&includeFrontmatter=true
```

### Refresh skills
```bash
curl -X POST http://localhost:3000/api/skills/refresh
```

## Integration with Agents

The Skills API integrates with the skill framework to:
1. Load skills from multiple locations
2. Parse frontmatter and validation
3. Format skills for agent prompt injection
4. Support skill lifecycle management

The `formatSkillsForPrompt` function generates XML-formatted skill descriptions compatible with Claude's tool use system.
