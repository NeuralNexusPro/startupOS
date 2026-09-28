# 架构设计 - Story 0.5

**Story:** 会话持久化
**Epic:** Epic 0 - 技术架构实施层
**最后更新:** 2026-03-04

---

## 🔧 技术实现要点

### 会话存储格式

```typescript
// src/lib/integrations/pi-agent/session-store.ts
interface Session {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  messages: AgentMessage[];
  systemPrompt: string;
  model: Model<any>;
  state: AgentState;
}

interface SessionData {
  currentSessionId: string;
  sessions: Session[];
}
```

### 会话持久化实现

```typescript
import { JsonStore } from '@/lib/storage';

const SESSIONS_FILE = 'data/sessions/sessions.json';

export class SessionStore {
  private store = new JsonStore<SessionData>(SESSIONS_FILE, {
    currentSessionId: '',
    sessions: [],
  });

  async saveSession(session: Session): Promise<void> {
    const data = await this.store.read();
    const existingIndex = data.sessions.findIndex(s => s.id === session.id);

    if (existingIndex >= 0) {
      data.sessions[existingIndex] = session;
    } else {
      data.sessions.push(session);
    }

    await this.store.write(data);
  }

  async loadSession(sessionId: string): Promise<Session | null> {
    const data = await this.store.read();
    return data.sessions.find(s => s.id === sessionId) ?? null;
  }

  async listSessions(): Promise<Session[]> {
    const data = await this.store.read();
    return data.sessions.sort((a, b) => b.updatedAt - a.updatedAt);
  }
}
```

### Agent 状态序列化

```typescript
// pi-agent-core 的状态需要序列化，过滤掉不需要持久化的部分
function serializeAgentState(state: AgentState): Partial<AgentState> {
  return {
    systemPrompt: state.systemPrompt,
    model: state.model,
    messages: state.messages,
    tools: state.tools.map(t => ({
      ...t,
      execute: undefined, // 不序列化函数
    })),
  };
}
```
