# Backend API Documentation

**Project:** OriginOS - Epic 1 (Stories 1.2 & 1.3)
**Author:** Backend Developer (backend-dev)
**Date:** 2026-03-02
**Version:** 1.0.0

---

## Overview

This document describes the backend APIs and data structures implemented for:
- **Story 1.2: Structured Interview Question Collection**
- **Story 1.3: Initial Ontology Structure Generation**

---

## API Endpoints

### Interview APIs

#### 1. Create Interview
```http
POST /api/interviews
```

**Request Body:**
```json
{
  "projectId": "string (required)",
  "skipOptionalQuestions": "boolean (optional, default: false)"
}
```

**Response (201 Created):**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "projectId": "string",
    "questions": [...],
    "answers": {},
    "currentQuestionIndex": 0,
    "status": "in_progress",
    "createdAt": "ISO-8601",
    "updatedAt": "ISO-8601"
  },
  "timestamp": "ISO-8601"
}
```

---

#### 2. Get Interview by ID
```http
GET /api/interviews/{id}
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": { /* Interview Session object */ },
  "timestamp": "ISO-8601"
}
```

---

#### 3. List Interviews for Project
```http
GET /api/interviews?projectId={projectId}
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": [ /* Array of Interview Sessions */ ],
  "timestamp": "ISO-8601"
}
```

---

#### 4. Submit Answers
```http
PUT /api/interviews/{id}/answers
```

**Request Body:**
```json
{
  "answers": {
    "questionId1": "answer1",
    "questionId2": ["option1", "option2"]
  }
}
```

---

#### 5. Complete Interview
```http
PUT /api/interviews/{id}/complete
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "status": "completed",
    "completedAt": "ISO-8601"
  }
}
```

---

#### 6. Skip Interview
```http
PUT /api/interviews/{id}/skip
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "status": "skipped"
  }
}
```

---

#### 7. Get Interview Progress
```http
GET /api/interviews/{id}/progress
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "interviewId": "uuid",
    "answered": 5,
    "total": 6,
    "percentage": 83
  }
}
```

---

### Ontology APIs

#### 1. Generate Ontology from Interview
```http
POST /api/ontology/generate
```

**Request Body:**
```json
{
  "interviewId": "uuid (required)",
  "projectId": "string (required)"
}
```

**Response (201 Created):**
```json
{
  "success": true,
  "data": {
    "ontology": { /* Ontology object */ },
    "generationTime": 1234, // in milliseconds
    "source": "interview"
  },
  "timestamp": "ISO-8601"
}
```

**Performance Requirement:** Must complete within 5 seconds (5000ms).

---

#### 2. Get Ontology
```http
GET /api/ontology/{id}
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": { /* Ontology object */ },
  "timestamp": "ISO-8601"
}
```

---

#### 3. Update Ontology
```http
PUT /api/ontology/{id}
```

**Request Body:**
```json
{
  "operations": [
    {
      "type": "add | update | delete",
      "entityType": "domain | concept | instance | relation",
      "data": { /* Entity data */ }
    }
  ]
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": { /* Updated Ontology object */ },
  "timestamp": "ISO-8601"
}
```

---

#### 4. Confirm Ontology
```http
POST /api/ontology/{id}/confirm
```

**Request Body:**
```json
{
  "confirmed": true
}
```

---

#### 5. Chat with Ontology
```http
POST /api/ontology/{id}/chat
```

**Request Body:**
```json
{
  "message": "string (required)"
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "message": "AI response text",
    "chatId": "uuid",
    "historyLength": 2
  },
  "timestamp": "ISO-8601"
}
```

---

#### 6. Get Chat History
```http
GET /api/ontology/{id}/chat
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "chatId": "uuid",
    "history": [
      {
        "id": "uuid",
        "timestamp": "ISO-8601",
        "role": "user | assistant | system",
        "content": "string",
        "relatedOntologyChanges": [ /* optional */ ]
      }
    ]
  },
  "timestamp": "ISO-8601"
}
```

---

#### 7. Delete Ontology
```http
DELETE /api/ontology/{id}
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": { "deleted": true },
  "timestamp": "ISO-8601"
}
```

---

## Data Structures

### File System Structure

```
{project-root}/data/
├── interviews/
│   └── {interview-id}.json       # Interview sessions
├── ontology/
│   └── {ontology-id}-ontology.json # Ontology data
├── chats/
│   └── {chat-id}.json            # Chat history
└── projects/
    ├── {project-id}.json         # Project metadata
    └── files/
        └── {file-id}             # Project files
```

---

### Interview Session JSON Schema

```json
{
  "version": "1.0.0",
  "createdAt": "2026-03-02T00:00:00.000Z",
  "updatedAt": "2026-03-02T00:00:00.000Z",
  "data": {
    "id": "uuid",
    "projectId": "string",
    "questions": [
      {
        "id": "question-id",
        "question": "Your work domain is?",
        "type": "text | select | multiselect | textarea",
        "options": ["option1", "option2"],
        "required": true,
        "placeholder": "string",
        "helpText": "string"
      }
    ],
    "answers": {
      "question-id": {
        "questionId": "question-id",
        "answer": "string | string[]",
        "timestamp": 1234567890
      }
    },
    "currentQuestionIndex": 0,
    "status": "not_started | in_progress | completed | skipped",
    "createdAt": "ISO-8601",
    "updatedAt": "ISO-8601",
    "completedAt": "ISO-8601 (optional)"
  }
}
```

---

### Ontology JSON Schema

```json
{
  "version": "1.0.0",
  "createdAt": "2026-03-02T00:00:00.000Z",
  "updatedAt": "2026-03-02T00:00:00.000Z",
  "data": {
    "id": "uuid",
    "projectId": "string",
    "name": "string",
    "domains": [
      {
        "id": "uuid",
        "name": "Domain Name",
        "description": "Description",
        "icon": "emoji (optional)",
        "color": "#hex (optional)",
        "createdAt": "ISO-8601",
        "updatedAt": "ISO-8601"
      }
    ],
    "concepts": [
      {
        "id": "uuid",
        "domainId": "uuid",
        "name": "Concept Name",
        "type": "string",
        "attributes": {},
        "description": "string (optional)",
        "createdAt": "ISO-8601",
        "updatedAt": "ISO-8601"
      }
    ],
    "instances": [
      {
        "id": "uuid",
        "conceptId": "uuid",
        "data": {},
        "createdAt": "ISO-8601",
        "updatedAt": "ISO-8601"
      }
    ],
    "relations": [
      {
        "id": "uuid",
        "sourceId": "uuid",
        "targetId": "uuid",
        "type": "dependency | contains | association | inheritance",
        "metadata": {},
        "createdAt": "ISO-8601"
      }
    ],
    "version": "1.0.0",
    "createdAt": "ISO-8601",
    "updatedAt": "ISO-8601"
  }
}
```

---

### Chat History JSON Schema

```json
{
  "version": "1.0.0",
  "createdAt": "2026-03-02T00:00:00.000Z",
  "updatedAt": "2026-03-02T00:00:00.000Z",
  "data": {
    "id": "uuid",
    "ontologyId": "uuid",
    "projectId": "string",
    "history": [
      {
        "id": "uuid",
        "timestamp": "ISO-8601",
        "role": "user | assistant | system",
        "content": "string",
        "relatedOntologyChanges": [
          {
            "type": "add | update | delete",
            "entityType": "domain | concept | instance | relation",
            "entityId": "uuid",
            "data": {}
          }
        ]
      }
    ],
    "createdAt": "ISO-8601",
    "updatedAt": "ISO-8601"
  }
}
```

---

## Core Interview Questions

### Required Questions

| Question ID | Question | Type | Default Required |
|-------------|----------|------|------------------|
| `work_domain` | 你的工作领域是什么？ | text | ✅ Yes |
| `work_mode` | 你的工作模式是什么？ | select | ✅ Yes |
| `main_tasks` | 主要任务有哪些？ | textarea | ✅ Yes |

### Optional Questions

| Question ID | Question | Type | Default Required |
|-------------|----------|------|------------------|
| `tools_used` | 你经常使用的工具或软件有哪些？ | multiselect | ❌ No |
| `team_size` | 你的团队规模是？ | select | ❌ No |
| `goals` | 你希望 OriginOS 帮助你解决什么问题？ | textarea | ❌ No |

---

## Error Response Format

All APIs return errors in the following format:

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable error message",
    "details": {} // Optional
  },
  "timestamp": "ISO-8601"
}
```

### Common Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `INVALID_REQUEST` | 400 | Missing or malformed request data |
| `NOT_FOUND` | 404 | Resource not found |
| `INVALID_STATE` | 400 | Operation not allowed in current state |
| `INTERNAL_ERROR` | 500 | Unexpected server error |

---

## Performance Requirements

| Operation | Requirement | Measurement |
|-----------|-------------|-------------|
| Ontology Generation | < 5 seconds | `generationTime` in response |
| API Response | < 500ms (median) | End-to-end timing |
| File I/O | < 100ms | Local JSON operations |

---

## Claude Code MCP Integration

The ontology generation is designed to integrate with Claude Code MCP for:

1. **Intent Understanding**: Parse natural language interview answers
2. **Ontology Query**: Query and retrieve ontology information
3. **Chat Interface**: Provide AI-assisted ontology editing

**Note on MVP Implementation:**
- Current implementation uses rule-based ontology generation
- Chat interface provides echo/response pattern (placeholder for AI)
- Full Claude Code MCP integration is planned for post-MVP

---

## Implementation Notes

### Architecture Compliance

- ✅ Next.js 14 App Router (API Routes)
- ✅ TypeScript strict mode
- ✅ Local file system storage (JSON)
- ✅ No external databases
- ✅ Proper module directory structure

### Files Created

```
src/
├── app/api/
│   ├── interviews/
│   │   ├── route.ts                    # POST / GET
│   │   ├── [id]/route.ts               # GET / DELETE
│   │   ├── [id]/answers/route.ts       # PUT
│   │   ├── [id]/complete/route.ts      # PUT
│   │   ├── [id]/skip/route.ts          # PUT
│   │   └── [id]/progress/route.ts      # GET
│   └── ontology/
│       ├── generate/route.ts           # POST
│       ├── [id]/route.ts               # GET / PUT / DELETE
│       ├── [id]/confirm/route.ts       # POST
│       └── [id]/chat/route.ts          # POST / GET
├── lib/
│   ├── ontology/
│   │   ├── types.ts                    # Interview & Ontology types
│   │   ├── interview.ts                # Interview service
│   │   ├── ontology-builder.ts         # Ontology generation service
│   │   └── index.ts                    # Public exports
│   └── storage/
│       ├── json-store.ts               # JSON file storage
│       └── index.ts                    # Public exports
└── types/
    ├── api.ts                          # API request/response types
    ├── ontology.ts                     # Ontology types
    └── index.ts                        # Public exports
```

---

## Endpoints Summary

| Category | Endpoint | Method | Purpose |
|----------|----------|--------|---------|
| Interviews | `/api/interviews` | POST | Create interview |
| Interviews | `/api/interviews/{id}` | GET | Get interview |
| Interviews | `/api/interviews?id=xxx` | GET | List interviews |
| Interviews | `/api/interviews/{id}/answers` | PUT | Submit answers |
| Interviews | `/api/interviews/{id}/complete` | PUT | Complete interview |
| Interviews | `/api/interviews/{id}/skip` | PUT | Skip interview |
| Interviews | `/api/interviews/{id}/progress` | GET | Get progress |
| Ontology | `/api/ontology/generate` | POST | Generate from interview |
| Ontology | `/api/ontology/{id}` | GET | Get ontology |
| Ontology | `/api/ontology/{id}` | PUT | Update ontology |
| Ontology | `/api/ontology/{id}` | DELETE | Delete ontology |
| Ontology | `/api/ontology/{id}/confirm` | POST | Confirm ontology |
| Ontology | `/api/ontology/{id}/chat` | POST | Send chat message |
| Ontology | `/api/ontology/{id}/chat` | GET | Get chat history |

---

**Document Version:** 1.0.0
**Last Updated:** 2026-03-02
