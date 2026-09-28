# Agent Session Persistence API Documentation

**Project:** OriginOS
**Author:** Backend Developer (backend-dev)
**Date:** 2026-03-02
**Version:** 1.0.0

---

## Overview

This document describes the Agent Session Persistence API that provides endpoints for creating, managing, and persisting agent sessions using local file system storage.

---

## API Endpoints

### 1. List Sessions

```http
GET /api/agent/sessions?projectId={projectId}
```

**Query Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `projectId` | string | No | Filter sessions by project ID |

**Request Example:**
```bash
GET /api/agent/sessions?projectId=proj-123
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "sessions": [
      {
        "sessionId": "uuid",
        "projectId": "proj-123",
        "projectName": "My Project",
        "status": "active",
        "createdAt": 1711234567890,
        "updatedAt": 1711234567890,
        "messageCount": 15,
        "summary": "Working on feature X...",
        "agentType": "claude-code"
      }
    ],
    "count": 1
  },
  "timestamp": "2026-03-02T00:00:00.000Z"
}
```

---

### 2. Create Session

```http
POST /api/agent/sessions
```

**Request Body:**
```json
{
  "projectId": "string (required)",
  "projectName": "string (required)",
  "systemPrompt": "string (optional)",
  "agentType": "string (optional, default: 'generic')",
  "projectContext": {
    "ontologyId": "string (optional)",
    "currentFileId": "string (optional)"
  }
}
```

**Response (201 Created):**
```json
{
  "success": true,
  "data": {
    "sessionId": "uuid",
    "createdAt": 1711234567890,
    "updatedAt": 1711234567890,
    "status": "active",
    "messages": [],
    "projectContext": {
      "projectId": "proj-123",
      "projectName": "My Project"
    },
    "systemPrompt": "",
    "agentType": "generic",
    "config": {
      "sessionId": "uuid",
      "systemPrompt": "",
      "agentType": "generic"
    }
  },
  "timestamp": "2026-03-02T00:00:00.000Z"
}
```

---

### 3. Get Session

```http
GET /api/agent/sessions/{sessionId}
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "sessionId": "uuid",
    "createdAt": 1711234567890,
    "updatedAt": 1711234567890,
    "status": "active",
    "messages": [...],
    "projectContext": {
      "projectId": "proj-123",
      "projectName": "My Project"
    },
    "systemPrompt": "You are a helpful assistant...",
    "agentType": "claude-code"
  },
  "timestamp": "2026-03-02T00:00:00.000Z"
}
```

---

### 4. Update Session

```http
PUT /api/agent/sessions/{sessionId}
```

**Request Body:**
```json
{
  "messages": [...],
  "status": "paused | completed | error",
  "projectContext": {
    "currentFileId": "updated-file-id"
  },
  "summary": "Updated summary text"
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": { /* Updated session object */ },
  "timestamp": "2026-03-02T00:00:00.000Z"
}
```

---

### 5. Delete Session

```http
DELETE /api/agent/sessions/{sessionId}
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "deleted": true
  },
  "timestamp": "2026-03-02T00:00:00.000Z"
}
```

---

### 6. Add Message

```http
POST /api/agent/sessions/{sessionId}/messages
```

**Request Body:**
```json
{
  "role": "user | assistant | system | tool",
  "content": "string (required)",
  "toolResults": [
    {
      "toolName": "string",
      "success": true,
      "result": {},
      "error": "string",
      "executionTime": 1234
    }
  ],
  "metadata": {
    "key": "value"
  }
}
```

**Response (201 Created):**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "role": "user",
    "content": "Hello!",
    "timestamp": 1711234567890,
    "toolResults": [],
    "metadata": {}
  },
  "timestamp": "2026-03-02T00:00:00.000Z"
}
```

---

### 7. Get Session Summary

```http
GET /api/agent/sessions/{sessionId}/summary
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "totalMessages": 25,
    "userMessages": 12,
    "assistantMessages": 12,
    "toolCalls": 5,
    "firstMessage": "Hello, I need help with...",
    "lastMessage": "Here's what I found..."
  },
  "timestamp": "2026-03-02T00:00:00.000Z"
}
```

---

### 8. Get Project Statistics

```http
GET /api/agent/sessions/{sessionId}/statistics
```

**Note:** This endpoint gets statistics for the project that owns the specified session.

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "totalSessions": 5,
    "activeSessions": 2,
    "completedSessions": 3,
    "totalMessages": 125,
    "averageMessagesPerSession": 25
  },
  "timestamp": "2026-03-02T00:00:00.000Z"
}
```

---

## Data Structures

### Agent Session

```typescript
interface AgentSession {
  sessionId: string;
  createdAt: number;        // Unix timestamp (ms)
  updatedAt: number;        // Unix timestamp (ms)
  status: 'active' | 'paused' | 'completed' | 'error';
  messages: AgentMessage[];
  projectContext: ProjectContext;
  systemPrompt: string;
  agentType?: string;
  config: AgentSessionConfig;
  summary?: string;
}
```

### Agent Message

```typescript
interface AgentMessage {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  timestamp: number;        // Unix timestamp (ms)
  toolResults?: ToolExecutionResult[];
  metadata?: Record<string, unknown>;
}
```

### Project Context

```typescript
interface ProjectContext {
  projectId: string;
  projectName: string;
  ontologyId?: string;
  currentFileId?: string;
  workspacePath?: string;
  metadata?: Record<string, unknown>;
}
```

### Session List Item

```typescript
interface SessionListItem {
  sessionId: string;
  projectId: string;
  projectName: string;
  status: SessionStatus;
  createdAt: number;
  updatedAt: number;
  messageCount: number;
  summary?: string;
  agentType?: string;
}
```

---

## File Storage Structure

Session data is stored in JSON files under `{data-root}/sessions/`:

```
{project-root}/data/
└── sessions/
    ├── {session-id}-001.json
    ├── {session-id}-002.json
    └── ...
```

Each session file follows the structure:

```json
{
  "version": "1.0.0",
  "createdAt": "2026-03-02T00:00:00.000Z",
  "updatedAt": "2026-03-02T00:00:00.000Z",
  "data": {
    // AgentSession object
  }
}
```

---

## Error Response Format

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable error message",
    "details": {}
  },
  "timestamp": "2026-03-02T00:00:00.000Z"
}
```

### Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `INVALID_REQUEST` | 400 | Missing or malformed request data |
| `NOT_FOUND` | 404 | Session not found |
| `INTERNAL_ERROR` | 500 | Unexpected server error |

---

## Usage Examples

### Creating a new session

```bash
curl -X POST http://localhost:3000/api/agent/sessions \
  -H "Content-Type: application/json" \
  -d '{
    "projectId": "proj-123",
    "projectName": "My Project",
    "systemPrompt": "You are a helpful coding assistant.",
    "agentType": "claude-code"
  }'
```

### Adding messages to a session

```bash
curl -X POST http://localhost:3000/api/agent/sessions/{sessionId}/messages \
  -H "Content-Type: application/json" \
  -d '{
    "role": "user",
    "content": "Hello, can you help me debug this code?"
  }'
```

### Listing project sessions

```bash
curl http://localhost:3000/api/agent/sessions?projectId=proj-123
```

---

## Implementation Summary

### Files Created

```
src/
├── types/
│   └── agent.ts                          # Agent session types
├── lib/features/agent/
│   ├── session-service.ts                # Session storage service
│   └── index.ts                          # Public exports
└── app/api/agent/sessions/
    ├── route.ts                          # GET / POST (list, create)
    ├── [sessionId]/
    │   ├── route.ts                      # GET / PUT / DELETE
    │   ├── messages/route.ts             # POST (add message)
    │   ├── summary/route.ts              # GET (session summary)
    │   └── statistics/route.ts           # GET (project stats)
```

### Key Features

- ✅ Local file system JSON storage
- ✅ Session CRUD operations
- ✅ Message history persistence
- ✅ Session summary generation
- ✅ Project-level statistics
- ✅ Type-safe TypeScript implementation
- ✅ Compatible with existing storage infrastructure

---

**Document Version:** 1.0.0
**Last Updated:** 2026-03-02
