# 测试文档 - Story 1.3: 初始本体结构生成

**Story:** 初始本体结构生成 (ARC-187)
**版本:** 1.0
**最后更新:** 2026-03-02

---

## 🎯 测试目标

验证系统能够根据收集的访谈答案生成初始本体结构，包含项目本体模型、实体定义、关系映射和层次结构。

---

## 📋 需求概要

**用户故事:** 用户完成访谈后，系统自动生成项目的初始本体结构，通过可视化方式展示给用户，供用户确认和调整。

## 验收标准 (AC)

- AC1: 根据访谈答案生成初始本体结构
- AC2: 本体包含实体、属性、关系定义
- AC3: 支持本体结构的可视化展示
- AC4: 支持用户对本体进行编辑和调整
- AC5: 导出本体结构为标准格式（JSON/RDF/GraphML）

---

## 📊 测试策略

### 测试层级

```
┌─────────────────────────────────┐
│  E2E 测试 (End-to-End)          │  访谈→生成→可视化
└────────────┬────────────────────┘
             ↓
┌─────────────────────────────────┐
│  集成测试 (Integration)         │  答案→解析→生成
└────────────┬────────────────────┘
             ↓
┌─────────────────────────────────┐
│  单元测试 (Unit)                │  解析器/生成器/验证器
└─────────────────────────────────┘
```

### 测试覆盖率目标

| 测试类型 | 覆盖率目标 | 测试用例数 |
|---------|-----------|-----------|
| 单元测试 | > 85% | 15 |
| 集成测试 | > 70% | 5 |
| E2E 测试 | 关键路径 100% | 5 |
| 验证测试 | 100% | 4 |

### 测试矩阵（功能维 × 状态维 × 场景维）

| 维度 | 类别 | 覆盖项 |
|-----|------|--------|
| **功能维** | 本体组件 | 实体、属性、关系、约束、层次 |
| **状态维** | 生成状态 | 初始化、解析中、生成中、完成、错误 |
| **场景维** | 项目类型 | Web应用、移动应用、桌面应用、API服务、混合 |

---

## 🧪 单元测试

### 测试框架

- **框架:** Vitest
- **断言库:** Vitest (内置)
- **Mock 库:** Vitest (内置)

---

### TC-03-001: 答案解析器测试

**测试文件:** `src/features/ontology/generators/__tests__/answerParser.test.ts`

**测试目标:** 验证访谈答案被正确解析为本体元素

**用例类别:** 功能测试 / 解析器
**优先级:** 🔴 P0 (Critical)

**测试代码:**
```typescript
import { describe, it, expect } from 'vitest';
import { parseAnswersToOntology, InterviewAnswer } from '../answerParser';

describe('Answer Parser', () => {
  const mockAnswers: InterviewAnswer = {
    projectName: 'OriginOS',
    projectType: 'Web应用',
    techStack: ['React', 'TypeScript'],
    teamSize: '5-10人',
    businessDomain: '软件开发',
    targetUsers: ['开发者', '项目管理者'],
  };

  it('should parse project name as main entity', () => {
    const ontology = parseAnswersToOntology(mockAnswers);

    expect(ontology.entities).toContainEqual({
      id: expect.stringContaining('project'),
      name: 'OriginOS',
      type: 'Project',
      isRoot: true,
    });
  });

  it('should parse tech stack as technology entities', () => {
    const ontology = parseAnswersToOntology(mockAnswers);

    const techEntities = ontology.entities.filter(
      e => e.type === 'Technology'
    );

    expect(techEntities).toHaveLength(2);
    expect(techEntities).toContainEqual(
      expect.objectContaining({ name: 'React' })
    );
    expect(techEntities).toContainEqual(
      expect.objectContaining({ name: 'TypeScript' })
    );
  });

  it('should parse target users as user entities', () => {
    const ontology = parseAnswersToOntology(mockAnswers);

    const userEntities = ontology.entities.filter(
      e => e.type === 'User'
    );

    expect(userEntities).toHaveLength(2);
    expect(userEntities).toContainEqual(
      expect.objectContaining({ name: '开发者' })
    );
  });

  it('should create relationships between entities', () => {
    const ontology = parseAnswersToOntology(mockAnswers);

    expect(ontology.relationships).toContainEqual({
      id: expect.any(String),
      source: expect.any(String),
      target: expect.any(String),
      type: 'uses',
    });
  });

  it('should extract business domain as entity attribute', () => {
    const ontology = parseAnswersToOntology(mockAnswers);

    const projectEntity = ontology.entities.find(e => e.type === 'Project');

    expect(projectEntity?.attributes).toHaveProperty('domain', '软件开发');
  });
});
```

**覆盖的验收标准:** AC1, AC2

---

### TC-03-002: 实体生成器测试

**测试文件:** `src/features/ontology/generators/__tests__/entityGenerator.test.ts`

**测试目标:** 验证实体正确生成

**用例类别:** 功能测试 / 生成器
**优先级:** 🔴 P0 (Critical)

**测试代码:**
```typescript
import { describe, it, expect } from 'vitest';
import { generateEntity, Entity } from '../entityGenerator';

describe('Entity Generator', () => {
  it('should generate entity with required properties', () => {
    const entity = generateEntity({
      name: 'User',
      type: 'Actor',
    });

    expect(entity).toHaveProperty('id');
    expect(entity).toHaveProperty('name', 'User');
    expect(entity).toHaveProperty('type', 'Actor');
    expect(entity).toHaveProperty('createdAt');
  });

  it('should generate unique IDs for entities', () => {
    const entity1 = generateEntity({ name: 'Entity1', type: 'Test' });
    const entity2 = generateEntity({ name: 'Entity2', type: 'Test' });

    expect(entity1.id).not.toBe(entity2.id);
  });

  it('should add attributes to entity', () => {
    const entity = generateEntity({
      name: 'TestEntity',
      type: 'Test',
      attributes: {
        name: { type: 'string', required: true },
        age: { type: 'number', optional: true },
      },
    });

    expect(entity.attributes).toHaveProperty('name');
    expect(entity.attributes.name.type).toBe('string');
    expect(entity.attributes).toHaveProperty('age');
  });

  it('should generate entity with inheritance', () => {
    const entity = generateEntity({
      name: 'AdminUser',
      type: 'User',
      extends: 'User',
    });

    expect(entity.extends).toBe('User');
  });

  it('should generate entity with constraints', () => {
    const entity = generateEntity({
      name: 'Product',
      type: 'Resource',
      constraints: {
        uniqueness: ['sku', 'id'],
        validation: { price: 'positive' },
      },
    });

    expect(entity.constraints).toHaveProperty('uniqueness');
    expect(entity.constraints.uniqueness).toContain('sku');
  });
});
```

**覆盖的验收标准:** AC1, AC2

---

### TC-03-003: 关系生成器测试

**测试文件:** `src/features/ontology/generators/__tests__/relationshipGenerator.test.ts`

**测试目标:** 验证关系正确生成

**用例类别:** 功能测试 / 生成器
**优先级:** 🔴 P0 (Critical)

**测试代码:**
```typescript
import { describe, it, expect } from 'vitest';
import {
  generateRelationship,
  RelationshipType,
  Cardinality,
} from '../relationshipGenerator';

describe('Relationship Generator', () => {
  it('should generate relationship with required properties', () => {
    const relationship = generateRelationship({
      source: 'user-1',
      target: 'order-1',
      type: RelationshipType.PlaceOrder,
    });

    expect(relationship).toHaveProperty('id');
    expect(relationship.source).toBe('user-1');
    expect(relationship.target).toBe('order-1');
    expect(relationship.type).toBe('places');
  });

  it('should support different relationship types', () => {
    const types = [
      { type: RelationshipType.Association, expected: 'associated_with' },
      { type: RelationshipType.Aggregation, expected: 'contains' },
      { type: RelationshipType.Composition, expected: 'composed_of' },
      { type: RelationshipType.Dependency, expected: 'depends_on' },
      { type: RelationshipType.Inheritance, expected: 'is_a' },
    ];

    types.forEach(({ type, expected }) => {
      const relationship = generateRelationship({
        source: 'a',
        target: 'b',
        type,
      });

      expect(relationship.type).toBe(expected);
    });
  });

  it('should support cardinality definition', () => {
    const relationship = generateRelationship({
      source: 'user',
      target: 'order',
      type: RelationshipType.Association,
      cardinality: {
        source: Cardinality.One,
        target: Cardinality.Many,
      },
    });

    expect(relationship.cardinality).toEqual({
      source: '1',
      target: '0..n',
    });
  });

  it('should support bidirectional relationships', () => {
    const relationship = generateRelationship({
      source: 'user',
      target: 'team',
      type: RelationshipType.Membership,
      bidirectional: true,
    });

    expect(relationship.bidirectional).toBe(true);
    expect(relationship.inverseName).toBe('has_members');
  });

  it('should add properties to relationship', () => {
    const relationship = generateRelationship({
      source: 'user',
      target: 'order',
      type: RelationshipType.PlaceOrder,
      properties: {
        date: 'datetime',
        status: 'enum:pending,completed,cancelled',
      },
    });

    expect(relationship.properties).toHaveProperty('date');
    expect(relationship.properties).toHaveProperty('status');
  });
});
```

**覆盖的验收标准:** AC2

---

### TC-03-004: 本体验证器测试

**测试文件:** `src/features/ontology/validators/__tests__/ontologyValidator.test.ts`

**测试目标:** 验证生成的本体满足规则和约束

**用例类别:** 功能测试 / 验证器
**优先级:** 🔴 P0 (Critical)

**测试代码:**
```typescript
import { describe, it, expect } from 'vitest';
import { validateOntology, Ontology, ValidationError } from '../ontologyValidator';

describe('Ontology Validator', () => {
  const validOntology: Ontology = {
    id: 'test-ontology',
    name: 'Test Ontology',
    entities: [
      {
        id: 'user-1',
        name: 'User',
        type: 'Actor',
        attributes: { id: { type: 'string', required: true } },
      },
    ],
    relationships: [],
    constraints: [],
  };

  it('should validate ontology with valid structure', () => {
    const result = validateOntology(validOntology);

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should detect entities with missing required properties', () => {
    const invalidOntology: Ontology = {
      ...validOntology,
      entities: [
        {
          id: 'user-1',
          // Missing name
          type: 'Actor',
        } as any,
      ],
    };

    const result = validateOntology(invalidOntology);

    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({
        field: 'entity.name',
        message: expect.stringContaining('required'),
      })
    );
  });

  it('should detect circular relationships', () => {
    const circularOntology: Ontology = {
      ...validOntology,
      relationships: [
        { id: 'r1', source: 'a', target: 'b', type: 'depends_on' },
        { id: 'r2', source: 'b', target: 'c', type: 'depends_on' },
        { id: 'r3', source: 'c', target: 'a', type: 'depends_on' },
      ],
    };

    const result = validateOntology(circularOntology);

    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({
        type: 'circular_dependency',
      })
    );
  });

  it('should detect dangling relationships (non-existent entities)', () => {
    const danglingOntology: Ontology = {
      ...validOntology,
      relationships: [
        {
          id: 'r1',
          source: 'user-1',
          target: 'nonexistent-entity',
          type: 'uses',
        },
      ],
    };

    const result = validateOntology(danglingOntology);

    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({
        type: 'entity_not_found',
        targetId: 'nonexistent-entity',
      })
    );
  });

  it('should validate constraint definitions', () => {
    const ontologyWithInvalidConstraint: Ontology = {
      ...validOntology,
      constraints: [
        {
          id: 'c1',
          type: 'uniqueness',
          target: 'user-1',
          fields: ['id', 'email'],
        },
      ],
    };

    const result = validateOntology(ontologyWithInvalidConstraint);

    expect(result.valid).toBe(false);
    // Should detect that 'email' field doesn't exist on user entity
  });
});
```

**覆盖的验收标准:** AC2

---

### TC-03-005: Web应用本体模板测试

**测试文件:** `src/features/ontology/templates/__tests__/webAppTemplate.test.ts`

**测试目标:** 验证Web应用的预制本体模板

**用例类别:** 功能测试 / 模板
**优先级:** 🟡 P1 (High)

**测试代码:**
```typescript
import { describe, it, expect } from 'vitest';
import { getWebAppTemplate } from '../webAppTemplate';

describe('Web App Template', () => {
  it('should include standard entities for web app', () => {
    const template = getWebAppTemplate();

    const entityNames = template.entities.map(e => e.name);

    expect(entityNames).toContain('User');
    expect(entityNames).toContain('Session');
    expect(entityNames).toContain('APIEndpoint');
    expect(entityNames).toContain('Page');
  });

  it('should include authentication relationships', () => {
    const template = getWebAppTemplate();

    const authRelationship = template.relationships.find(
      r => r.type === 'authenticates'
    );

    expect(authRelationship).toBeDefined();
    expect(authRelationship?.source).toBe('Session');
    expect(authRelationship?.target).toBe('User');
  });

  it('should include CRUD operation entities', () => {
    const template = getWebAppTemplate();

    const crudEntities = template.entities.filter(
      e => e.type === 'Controller' || e.type === 'Service'
    );

    expect(crudEntities.length).toBeGreaterThan(0);
  });

  it('should include frontend components', () => {
    const template = getWebAppTemplate();

    const componentNames = template.entities
      .filter(e => e.type === 'Component')
      .map(e => e.name);

    expect(componentNames).toContainExpect.arrayContaining([
      expect.stringMatching(/Button|Form|Modal|Page/i),
    ]);
  });

  it('should include API endpoint relationships', () => {
    const template = getWebAppTemplate();

    const apiRelationships = template.relationships.filter(
      r => r.type === 'calls' || r.type === 'exposes'
    );

    expect(apiRelationships.length).toBeGreaterThan(0);
  });
});
```

---

### TC-03-006: 移动应用本体模板测试

**测试文件:** `src/features/ontology/templates/__tests__/mobileAppTemplate.test.ts`

**测试目标:** 验证移动应用的预制本体模板

**用例类别:** 功能测试 / 模板
**优先级:** 🟡 P1 (High)

**测试代码:**
```typescript
import { describe, it, expect } from 'vitest';
import { getMobileAppTemplate } from '../mobileAppTemplate';

describe('Mobile App Template', () => {
  it('should include mobile-specific entities', () => {
    const template = getMobileAppTemplate();

    const entityNames = template.entities.map(e => e.name);

    expect(entityNames).toContain('Screen');
    expect(entityNames).toContain('Navigation');
    expect(entityNames).toContain('Device');
    expect(entityNames).toContain('PushNotification');
  });

  it('should include permission entities', () => {
    const template = getMobileAppTemplate();

    const permissions = template.entities.filter(
      e => e.type === 'Permission'
    );

    expect(permissions.length).toBeGreaterThan(0);
    expect(permissions).toContainEqual(
      expect.objectContaining({ name: expect.stringContaining(/camera|storage|location/i) })
    );
  });

  it('should include screen navigation relationships', () => {
    const template = getMobileAppTemplate();

    const navRelationship = template.relationships.find(
      r => r.type === 'navigates_to'
    );

    expect(navRelationship).toBeDefined();
  });

  it('should include platform-specific attributes', () => {
    const template = getMobileAppTemplate();

    const screenEntity = template.entities.find(
      e => e.name === 'Screen'
    );

    expect(screenEntity?.attributes).toHaveProperty('platform');
    expect(screenEntity?.attributes).toHaveProperty('orientation');
  });
});
```

---

### TC-03-007: 本体层次结构生成测试

**测试文件:** `src/features/ontology/generators/__tests__/hierarchyGenerator.test.ts`

**测试目标:** 验证本体层次结构正确生成

**用例类别:** 功能测试 / 层次生成
**优先级:** 🟡 P1 (High)

**测试代码:**
```typescript
import { describe, it, expect } from 'vitest';
import { generateHierarchy, Ontology } from '../hierarchyGenerator';

describe('Hierarchy Generator', () => {
  const ontology: Ontology = {
    id: 'test',
    name: 'Test',
    entities: [
      { id: 'user', name: 'User', type: 'Actor' },
      { id: 'admin', name: 'Admin', type: 'User', extends: 'User' },
      { id: 'super-admin', name: 'SuperAdmin', type: 'User', extends: 'admin' },
    ],
    relationships: [],
    constraints: [],
  };

  it('should build hierarchy from inheritance relationships', () => {
    const hierarchy = generateHierarchy(ontology);

    expect(hierarchy['user']).toBeDefined();
    expect(hierarchy['user'].children).toContain('admin');
    expect(hierarchy['admin'].children).toContain('super-admin');
  });

  it('should calculate depth of each entity', () => {
    const hierarchy = generateHierarchy(ontology);

    expect(hierarchy['user'].depth).toBe(0);
    expect(hierarchy['admin'].depth).toBe(1);
    expect(hierarchy['super-admin'].depth).toBe(2);
  });

  it('should detect and handle circular inheritance', () => {
    const circularOntology: Ontology = {
      ...ontology,
      entities: [
        { id: 'a', name: 'A', type: 'Test', extends: 'b' },
        { id: 'b', name: 'B', type: 'Test', extends: 'c' },
        { id: 'c', name: 'C', type: 'Test', extends: 'a' },
      ],
    };

    const result = () => generateHierarchy(circularOntology);

    expect(result).toThrow(/circular.*inheritance/i);
  });

  it('should support multiple inheritance', () => {
    const multiInheritOntology: Ontology = {
      ...ontology,
      entities: [
        { id: 'user', name: 'User', type: 'Actor' },
        { id: 'admin', name: 'Admin', type: 'User', extends: ['User', 'Moderator'] },
        { id: 'moderator', name: 'Moderator', type: 'User' },
      ],
    };

    const hierarchy = generateHierarchy(multiInheritOntology);

    expect(hierarchy['admin'].parents).toContain('user');
    expect(hierarchy['admin'].parents).toContain('moderator');
  });
});
```

---

### TC-03-008: 本体完整度评分测试

**测试文件:** `src/features/ontology/analyzers/__tests__/completenessAnalyzer.test.ts`

**测试目标:** 验证本体的完整度评分

**用例类别:** 功能测试 / 分析器
**优先级:** 🟡 P1 (High)

**测试代码:**
```typescript
import { describe, it, expect } from 'vitest';
import { calculateCompleteness, Ontology } from '../completenessAnalyzer';

describe('Completeness Analyzer', () => {
  it('should calculate high completeness for well-defined ontology', () => {
    const completeOntology: Ontology = {
      id: 'test',
      name: 'Complete',
      entities: [
        {
          id: 'user',
          name: 'User',
          type: 'Actor',
          attributes: {
            id: { type: 'string', required: true },
            name: { type: 'string', required: true },
            email: { type: 'string', unique: true },
          },
        },
      ],
      relationships: [
        { id: 'r1', source: 'user', target: 'order', type: 'places' },
      ],
      constraints: [],
    };

    const score = calculateCompleteness(completeOntology);

    expect(score.overall).toBeGreaterThan(70);
    expect(score.entityScore).toBeGreaterThan(70);
    expect(score.relationshipScore).toBeGreaterThan(70);
  });

  it('should penalize missing attributes', () => {
    const minimalOntology: Ontology = {
      id: 'test',
      name: 'Minimal',
      entities: [
        { id: 'user', name: 'User', type: 'Actor' },
      ],
      relationships: [],
      constraints: [],
    };

    const score = calculateCompleteness(minimalOntology);

    expect(score.entityScore).toBeLessThan(50);
  });

  it('should penalize missing relationships', () => {
    const noRelationsOntology: Ontology = {
      id: 'test',
      name: 'No Relations',
      entities: Array.from({ length: 10 }, (_, i) => ({
        id: `entity-${i}`,
        name: `Entity${i}`,
        type: 'Test',
      })),
      relationships: [],
      constraints: [],
    };

    const score = calculateCompleteness(noRelationsOntology);

    expect(score.relationshipScore).toBeLessThan(20);
  });

  it('should provide detailed feedback', () => {
    const ontology: Ontology = {
      id: 'test',
      name: 'Test',
      entities: [{ id: 'user', name: 'User', type: 'Actor' }],
      relationships: [],
      constraints: [],
    };

    const score = calculateCompleteness(ontology);

    expect(score.feedback).toContainEqual(
      expect.objectContaining({
        type: 'suggestion',
        category: expect.any(String),
        message: expect.any(String),
      })
    );
  });
});
```

---

### TC-03-009: JSON导出器测试

**测试文件:** `src/features/ontology/exporters/__tests__/jsonExporter.test.ts`

**测试目标:** 验证本体导出为JSON格式

**用例类别:** 功能测试 / 导出器
**优先级:** 🟡 P1 (High)

**测试代码:**
```typescript
import { describe, it, expect } from 'vitest';
import { exportAsJSON, Ontology } from '../jsonExporter';

describe('JSON Exporter', () => {
  const ontology: Ontology = {
    id: 'test-ontology',
    name: 'Test Ontology',
    version: '1.0.0',
    entities: [
      {
        id: 'user-1',
        name: 'User',
        type: 'Actor',
        attributes: {
          id: { type: 'string', required: true },
          name: { type: 'string', required: true },
        },
      },
    ],
    relationships: [
      {
        id: 'r1',
        source: 'user-1',
        target: 'order-1',
        type: 'places',
      },
    ],
    constraints: [],
  };

  it('should export ontology as valid JSON', () => {
    const exported = exportAsJSON(ontology);

    expect(() => JSON.parse(exported)).not.toThrow();
  });

  it('should include all ontology properties', () => {
    const exported = exportAsJSON(ontology);
    const parsed = JSON.parse(exported);

    expect(parsed.id).toBe(ontology.id);
    expect(parsed.name).toBe(ontology.name);
    expect(parsed.version).toBe('1.0.0');
    expect(parsed.entities).toBeDefined();
    expect(parsed.relationships).toBeDefined();
  });

  it('should include metadata in export', () => {
    const exported = exportAsJSON(ontology);
    const parsed = JSON.parse(exported);

    expect(parsed.exportedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(parsed.exporter).toContain('OriginOS');
    expect(parsed.format).toBe('ont-json');
  });

  it('should preserve entity structure', () => {
    const exported = exportAsJSON(ontology);
    const parsed = JSON.parse(exported);

    const exportedEntity = parsed.entities[0];

    expect(exportedEntity.id).toBe('user-1');
    expect(exportedEntity.name).toBe('User');
    expect(exportedEntity.attributes).toEqual(ontology.entities[0].attributes);
  });
});
```

**覆盖的验收标准:** AC5

---

### TC-03-010: RDF导出器测试

**测试文件:** `src/features/ontology/exporters/__tests__/rdfExporter.test.ts`

**测试目标:** 验证本体导出为RDF格式

**用例类别:** 功能测试 / 导出器
**优先级:** 🟡 P1 (High)

**测试代码:**
```typescript
import { describe, it, expect } from 'vitest';
import { exportAsRDF, Ontology } from '../rdfExporter';

describe('RDF Exporter', () => {
  const ontology: Ontology = {
    id: 'test',
    name: 'Test',
    entities: [
      {
        id: 'user',
        name: 'User',
        type: 'Actor',
        attributes: {
          id: { type: 'string' },
        },
      },
    ],
    relationships: [
      {
        id: 'r1',
        source: 'user',
        target: 'order',
        type: 'places',
      },
    ],
    constraints: [],
  };

  it('should export ontology as RDF/XML', () => {
    const rdf = exportAsRDF(ontology, 'xml');

    expect(rdf).toContain('<?xml');
    expect(rdf).toContain('xmlns:rdf');
    expect(rdf).toContain('xmlns:owl');
  });

  it('should export ontology as Turtle', () => {
    const turtle = exportAsRDF(ontology, 'turtle');

    expect(turtle).toContain('@prefix');
    expect(turtle).toContain('rdf:');
    expect(turtle).toContain('owl:');
  });

  it('should map entities to RDF classes', () => {
    const rdf = exportAsRDF(ontology, 'xml');

    expect(rdf).toContain('owl:Class');
    expect(rdf).toContain('User');
  });

  it('should map relationships to RDF properties', () => {
    const rdf = exportAsRDF(ontology, 'xml');

    expect(rdf).toContain('rdf:Property');
    expect(rdf).toContain('places');
  });

  it('should include ontology metadata', () => {
    const rdf = exportAsRDF(ontology, 'xml');

    expect(rdf).toContain('owl:Ontology');
    expect(rdf).toContain('dc:title>Test');
  });
});
```

**覆盖的验收标准:** AC5

---

### TC-03-011: GraphML导出器测试

**测试文件:** `src/features/ontology/exporters/__tests__/graphMLExporter.test.ts`

**测试目标:** 验证本体导出为GraphML格式

**用例类别:** 功能测试 / 导出器
**优先级:** 🟢 P2 (Medium)

**测试代码:**
```typescript
import { describe, it, expect } from 'vitest';
import { exportAsGraphML, Ontology } from '../graphMLExporter';

describe('GraphML Exporter', () => {
  const ontology: Ontology = {
    id: 'test',
    name: 'Test',
    entities: [
      {
        id: 'user',
        name: 'User',
        type: 'Actor',
      },
      {
        id: 'order',
        name: 'Order',
        type: 'Resource',
      },
    ],
    relationships: [
      {
        id: 'r1',
        source: 'user',
        target: 'order',
        type: 'places',
      },
    ],
    constraints: [],
  };

  it('should export ontology as GraphML', () => {
    const graphML = exportAsGraphML(ontology);

    expect(graphML).toContain('<?xml');
    expect(graphML).toContain('<graphml>');
    expect(graphML).toContain('<graph>');
  });

  it('should include entity nodes', () => {
    const graphML = exportAsGraphML(ontology);

    expect(graphML).toContain('<node id="user"');
    expect(graphML).toContain('<node id="order"');
  });

  it('should include relationship edges', () => {
    const graphML = exportAsGraphML(ontology);

    expect(graphML).toContain('<edge source="user" target="order"');
    expect(graphML).toContain('places');
  });

  it('should include node attributes', () => {
    const graphML = exportAsGraphML(ontology);

    expect(graphML).toContain('data key="type"');
    expect(graphML).toContain('Actor');
  });
});
```

**覆盖的验收标准:** AC5

---

### TC-03-012: 本体冲突检测测试

**测试文件:** `src/features/ontology/analyzers/__tests__/conflictDetector.test.ts`

**测试目标:** 验证本体冲突的检测

**用例类别:** 功能测试 / 冲突检测
**优先级:** 🟢 P2 (Medium)

**测试代码:**
```typescript
import { describe, it, expect } from 'vitest';
import { detectConflicts, Ontology } from '../conflictDetector';

describe('Conflict Detector', () => {
  it('should detect duplicate entity names', () => {
    const ontology: Ontology = {
      id: 'test',
      name: 'Test',
      entities: [
        { id: 'user-1', name: 'User', type: 'Actor' },
        { id: 'user-2', name: 'User', type: 'Actor' },
      ],
      relationships: [],
      constraints: [],
    };

    const conflicts = detectConflicts(ontology);

    expect(conflicts).toContainEqual(
      expect.objectContaining({
        type: 'duplicate_name',
        entity: 'User',
      })
    );
  });

  it('should detect conflicting attribute types', () => {
    const ontology: Ontology = {
      id: 'test',
      name: 'Test',
      entities: [
        {
          id: 'user',
          name: 'User',
          type: 'Actor',
          attributes: {
            age: { type: 'number' },
          },
        },
        {
          id: 'person',
          name: 'Person',
          type: 'Actor',
          attributes: {
            age: { type: 'string' }, // Conflict!
          },
        },
      ],
      relationships: [],
      constraints: [],
    };

    const conflicts = detectConflicts(ontology);

    expect(conflicts).toContainEqual(
      expect.objectContaining({
        type: 'type_conflict',
        attribute: 'age',
      })
    );
  });

  it('should detect naming conflicts with reserved words', () => {
    const ontology: Ontology = {
      id: 'test',
      name: 'Test',
      entities: [
        { id: 'class', name: 'Class', type: 'Test' }, // 'class' is reserved
      ],
      relationships: [],
      constraints: [],
    };

    const conflicts = detectConflicts(ontology);

    expect(conflicts).toContainEqual(
      expect.objectContaining({
        type: 'reserved_word',
        value: 'class',
      })
    );
  });
});
```

---

### TC-03-013: 本体编辑器接口测试

**测试文件:** `src/features/ontology/services/__tests__/ontologyEditor.test.ts`

**测试目标:** 验证本体编辑功能

**用例类别:** 功能测试 / 编辑器
**优先级:** 🟡 P1 (High)

**测试代码:**
```typescript
import { describe, it, expect } from 'vitest';
import {
  OntologyEditor,
  Ontology,
} from '../ontologyEditor';

describe('Ontology Editor', () => {
  const initialOntology: Ontology = {
    id: 'test',
    name: 'Test',
    entities: [
      { id: 'user', name: 'User', type: 'Actor' },
    ],
    relationships: [],
    constraints: [],
  };

  it('should add new entity', () => {
    const editor = new OntologyEditor(initialOntology);

    editor.addEntity({
      id: 'order',
      name: 'Order',
      type: 'Resource',
    });

    const ontology = editor.getOntology();

    expect(ontology.entities).toHaveLength(2);
    expect(ontology.entities).toContainEqual(
      expect.objectContaining({ id: 'order' })
    );
  });

  it('should remove entity', () => {
    const editor = new OntologyEditor(initialOntology);

    editor.removeEntity('user');

    const ontology = editor.getOntology();

    expect(ontology.entities).toHaveLength(0);
  });

  it('should update entity', () => {
    const editor = new OntologyEditor(initialOntology);

    editor.updateEntity('user', {
      name: 'Customer',
      attributes: { id: { type: 'string' } },
    });

    const ontology = editor.getOntology();
    const entity = ontology.entities.find(e => e.id === 'user');

    expect(entity?.name).toBe('Customer');
    expect(entity?.attributes).toHaveProperty('id');
  });

  it('should add relationship', () => {
    const editor = new OntologyEditor(initialOntology);

    editor.addRelationship({
      source: 'user',
      target: 'order',
      type: 'places',
    });

    const ontology = editor.getOntology();

    expect(ontology.relationships).toHaveLength(1);
  });

  it('should support undo', () => {
    const editor = new OntologyEditor(initialOntology);

    editor.addEntity({ id: 'order', name: 'Order', type: 'Resource' });
    editor.undo();

    const ontology = editor.getOntology();

    expect(ontology.entities).toHaveLength(1); // Back to initial
  });

  it('should support redo', () => {
    const editor = new OntologyEditor(initialOntology);

    editor.addEntity({ id: 'order', name: 'Order', type: 'Resource' });
    editor.undo();
    editor.redo();

    const ontology = editor.getOntology();

    expect(ontology.entities).toHaveLength(2); // Restored
  });
});
```

**覆盖的验收标准:** AC4

---

### TC-03-014: 本体自动优化测试

**测试文件:** `src/features/ontology/optimizers/__tests__/autoOptimizer.test.ts`

**测试目标:** 验证本体自动优化功能

**用例类别:** 功能测试 / 优化器
**优先级:** 🟢 P2 (Medium)

**测试代码:**
```typescript
import { describe, it, expect } from 'vitest';
import {
  optimizeOntology,
  Ontology,
} from '../autoOptimizer';

describe('Auto Optimizer', () => {
  it('should consolidate similar entities', () => {
    const ontology: Ontology = {
      id: 'test',
      name: 'Test',
      entities: [
        { id: 'user-1', name: 'User', type: 'Actor' },
        { id: 'user-2', name: 'Customer', type: 'Actor' },
        { id: 'user-3', name: 'Client', type: 'Actor' },
      ],
      relationships: [],
      constraints: [],
    };

    const optimized = optimizeOntology(ontology, {
      consolidateSimilar: true,
    });

    expect(optimized.entities.length).toBeLessThan(3);
  });

  it('should remove redundant relationships', () => {
    const ontology: Ontology = {
      id: 'test',
      name: 'Test',
      entities: [
        { id: 'user', name: 'User', type: 'Actor' },
        { id: 'order', name: 'Order', type: 'Resource' },
      ],
      relationships: [
        { id: 'r1', source: 'user', target: 'order', type: 'places' },
        { id: 'r2', source: 'user', target: 'order', type: 'calls_create' }, // Redundant given 'places'
      ],
      constraints: [],
    };

    const optimized = optimizeOntology(ontology, {
      removeRedundant: true,
    });

    expect(optimized.relationships.length).toBeLessThan(2);
  });

  it('should suggest better names', () => {
    const ontology: Ontology = {
      id: 'test',
      name: 'Test',
      entities: [
        { id: 'thing', name: 'Thing', type: 'Test' }, // Generic name
      ],
      relationships: [],
      constraints: [],
    };

    const optimized = optimizeOntology(ontology, {
      suggestNames: true,
    });

    expect(optimized.suggestions).toContainEqual(
      expect.objectContaining({
        type: 'rename_suggestion',
      })
    );
  });

  it('should apply best practices', () => {
    const ontology: Ontology = {
      id: 'test',
      name: 'Test',
      entities: [],
      relationships: [],
      constraints: [],
    };

    const optimized = optimizeOntology(ontology, {
      applyBestPractices: true,
    });

    expect(optimized.appliedPractices).toContainGreaterThan(0);
  });
});
```

---

### TC-03-015: 本体搜索测试

**测试文件:** `src/features/ontology/services/__tests__/ontologySearch.test.ts`

**测试目标:** 验证本体搜索功能

**用例类别:** 功能测试 / 搜索
**优先级:** 🟢 P2 (Medium)

**测试代码:**
```typescript
import { describe, it, expect } from 'vitest';
import { searchOntology, Ontology } from '../ontologySearch';

describe('Ontology Search', () => {
  const ontology: Ontology = {
    id: 'test',
    name: 'Test Ontology',
    entities: [
      { id: 'user', name: 'User', type: 'Actor', description: 'User of the system' },
      { id: 'order', name: 'Order', type: 'Resource' },
      { id: 'product', name: 'Product', type: 'Item' },
    ],
    relationships: [],
    constraints: [],
  };

  it('should find entities by name', () => {
    const results = searchOntology(ontology, 'User');

    expect(results.entities).toHaveLength(1);
    expect(results.entities[0].name).toBe('User');
  });

  it('should find entities by partial name', () => {
    const results = searchOntology(ontology, 'ser');

    expect(results.entities).toContainEqual(
      expect.objectContaining({ name: 'User' })
    );
  });

  it('should find entities by description', () => {
    const results = searchOntology(ontology, 'system');

    expect(results.entities).toContainEqual(
      expect.objectContaining({ name: 'User' })
    );
  });

  it('should find by type', () => {
    const results = searchOntology(ontology, { type: 'Actor' });

    expect(results.entities).toHaveLength(1);
    expect(results.entities[0].type).toBe('Actor');
  });

  it('should support fuzzy search', () => {
    const results = searchOntology(ontology, 'Usr', { fuzzy: true });

    expect(results.entities).toHaveLength(1);
    expect(results.entities[0].name).toBe('User');
  });
});
```

---

## 🔗 集成测试

### TC-03-INT-001: 完整本体生成流程测试

**测试文件:** `src/features/ontology/__tests__/integration/generation-flow.test.ts`

**测试目标:** 验证从访谈答案到本体生成的完整流程

**用例类别:** 集成测试 / 端到端
**优先级:** 🔴 P0 (Critical)

**测试代码:**
```typescript
import { describe, it, expect } from 'vitest';
import { generateOntologyFromAnswers, InterviewAnswer } from '../ontologyGenerator';

describe('Complete Ontology Generation Flow', () => {
  const mockAnswers: InterviewAnswer = {
    projectName: 'E-Commerce Platform',
    projectType: 'Web应用',
    techStack: ['React', 'Node.js', 'MongoDB'],
    businessDomain: '电商',
    targetUsers: ['消费者', '商家'],
    teamSize: '11-20人',
  };

  it('should generate complete ontology from answers', async () => {
    const ontology = generateOntologyFromAnswers(mockAnswers);

    expect(ontology).toBeDefined();
    expect(ontology.name).toBe('E-Commerce Platform');
  });

  it('should include entities from answers', async () => {
    const ontology = generateOntologyFromAnswers(mockAnswers);

    const entityNames = ontology.entities.map(e => e.name);

    expect(entityNames).toContain('E-Commerce Platform');
    expect(entityNames).toContain('React');
    expect(entityNames).toContain('Node.js');
    expect(entityNames).toContain('MongoDB');
  });

  it('should include appropriate relationships', async () => {
    const ontology = generateOntologyFromAnswers(mockAnswers);

    // Should have relationships between project and tech stack
    const techRelationships = ontology.relationships.filter(
      r => r.type === 'uses' || r.type === 'implements_with'
    );

    expect(techRelationships.length).toBeGreaterThan(0);
  });

  it('should include domain-specific entities', async () => {
    const ontology = generateOntologyFromAnswers(mockAnswers);

    const businessEntity = ontology.entities.find(
      e => e.attributes?.domain === '电商'
    );

    expect(businessEntity).toBeDefined();
  });

  it('should generate a valid and complete ontology', async () => {
    const ontology = generateOntologyFromAnswers(mockAnswers);

    expect(ontology.entities.length).toBeGreaterThan(0);
    expect(ontology.relationships.length).toBeGreaterThan(0);

    // Should validate without errors
    const validation = validateOntology(ontology);
    expect(validation.valid).toBe(true);
  });
});
```

**覆盖的验收标准:** AC1, AC2

---

### TC-03-INT-002: 可视化渲染测试

**测试文件:** `src/features/ontology/__tests__/integration/visualization.test.tsx`

**测试目标:** 验证本体可视化组件正确渲染

**用例类别:** 集成测试 / 可视化
**优先级:** 🔴 P0 (Critical)

**测试代码:**
```typescript
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { OntologyVisualizer } from '../components/OntologyVisualizer';
import { Ontology } from '../types';

describe('Ontology Visualization', () => {
  const sampleOntology: Ontology = {
    id: 'test',
    name: 'Test Ontology',
    entities: [
      { id: 'user', name: 'User', type: 'Actor', position: { x: 100, y: 100 } },
      { id: 'order', name: 'Order', type: 'Resource', position: { x: 300, y: 100 } },
      { id: 'product', name: 'Product', type: 'Resource', position: { x: 500, y: 100 } },
    ],
    relationships: [
      { id: 'r1', source: 'user', target: 'order', type: 'places' },
      { id: 'r2', source: 'order', target: 'product', type: 'contains' },
    ],
    constraints: [],
  };

  it('should render all entities as nodes', () => {
    render(<OntologyVisualizer ontology={sampleOntology} />);

    expect(screen.getByText('User')).toBeInTheDocument();
    expect(screen.getByText('Order')).toBeInTheDocument();
    expect(screen.getByText('Product')).toBeInTheDocument();
  });

  it('should render relationships as edges', () => {
    const { container } = render(<OntologyVisualizer ontology={sampleOntology} />);

    const edges = container.querySelectorAll('[data-testid*="edge"]');

    expect(edges.length).toBeGreaterThan(0);
  });

  it('should color-code entities by type', () => {
    const { container } = render(<OntologyVisualizer ontology={sampleOntology} />);

    const userNode = container.querySelector('[data-entity-id="user"]');
    const orderNode = container.querySelector('[data-entity-id="order"]');

    expect(userNode).toHaveStyle({ backgroundColor: expect.any(String) });
    expect(orderNode).toHaveStyle({ backgroundColor: expect.any(String) });

    // Different types should have different colors
    const userColor = userNode?.style.backgroundColor;
    const orderColor = orderNode?.style.backgroundColor;

    expect(userColor).not.toBe(orderColor);
  });

  it('should support zoom and pan', () => {
    const { container } = render(<OntologyVisualizer ontology={sampleOntology} />);

    const canvas = container.querySelector('[data-testid="ontology-canvas"]');

    expect(canvas).toBeInTheDocument();

    // Should have zoom controls
    expect(screen.getByRole('button', { name: /zoom/i })).toBeInTheDocument();
  });

  it('should show entity details on click', () => {
    render(<OntologyVisualizer ontology={sampleOntology} />);

    const userNode = screen.getByText('User');
    fireEvent.click(userNode);

    await waitFor(() => {
      expect(screen.getByTestId('entity-details')).toBeInTheDocument();
      expect(screen.getByText(/User/)).toBeInTheDocument();
    });
  });
});
```

**覆盖的验收标准:** AC3

---

### TC-03-INT-003: 编辑器集成测试

**测试文件:** `src/features/ontology/__tests__/integration/editor-flow.test.tsx`

**测试目标:** 验证本体编辑器功能集成

**用例类别:** 集成测试 / 编辑流程
**优先级:** 🔴 P0 (Critical)

**测试代码:**
```typescript
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { OntologyEditor } from '../components/OntologyEditor';
import { Ontology } from '../types';

describe('Ontology Editor Integration', () => {
  const sampleOntology: Ontology = {
    id: 'test',
    name: 'Test',
    entities: [{ id: 'user', name: 'User', type: 'Actor' }],
    relationships: [],
    constraints: [],
  };

  it('should add new entity through UI', async () => {
    render(<OntologyEditor ontology={sampleOntology} />);

    // Click add entity button
    await userEvent.click(screen.getByRole('button', { name: /add entity/i }));

    // Fill in entity details
    await userEvent.type(screen.getByLabelText(/name/i), 'Order');
    await userEvent.selectOptions(
      screen.getByLabelText(/type/i),
      'Resource'
    );

    // Submit
    await userEvent.click(screen.getByRole('button', { name: /save/i }));

    // Verify entity added
    await waitFor(() => {
      expect(screen.getByText('Order')).toBeInTheDocument();
    });
  });

  it('should edit existing entity through UI', async () => {
    render(<OntologyEditor ontology={sampleOntology} />);

    // Click on User entity
    await userEvent.click(screen.getByText('User'));

    // Click edit button
    await userEvent.click(screen.getByRole('button', { name: /edit/i }));

    // Modify name
    const nameInput = screen.getByLabelText(/name/i);
    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, 'Customer');

    // Submit
    await userEvent.click(screen.getByRole('button', { name: /save/i }));

    // Verify updated
    expect(screen.getByText('Customer')).toBeInTheDocument();
  });

  it('should delete entity through UI', async () => {
    render(<OntologyEditor ontology={sampleOntology} />);

    // Click on User entity
    await userEvent.click(screen.getByText('User'));

    // Click delete button
    await userEvent.click(screen.getByRole('button', { name: /delete/i }));

    // Confirm in modal
    await userEvent.click(screen.getByRole('button', { name: /confirm/i }));

    // Verify entity deleted
    await waitFor(() => {
      expect(screen.queryByText('User')).not.toBeInTheDocument();
    });
  });

  it('should add attribute to entity', async () => {
    render(<OntologyEditor ontology={sampleOntology} />);

    // Click on User entity
    await userEvent.click(screen.getByText('User'));

    // Click add attribute
    await userEvent.click(screen.getByRole('button', { name: /add attribute/i }));

    // Fill attribute
    await userEvent.type(screen.getByLabelText(/attribute name/i), 'email');
    await userEvent.selectOptions(
      screen.getByLabelText(/type/i),
      'string'
    );

    // Submit
    await userEvent.click(screen.getByRole('button', { name: /save/i }));

    // Verify attribute added
    await waitFor(() => {
      expect(screen.getByText('email')).toBeInTheDocument();
    });
  });
});
```

**覆盖的验收标准:** AC4

---

### TC-03-INT-004: 本体版本控制测试

**测试文件:** `src/features/ontology/__tests__/integration/versioning.test.ts`

**测试目标:** 验证本体版本控制功能

**用例类别:** 集成测试 / 版本管理
**优先级:** 🟡 P1 (High)

**测试代码:**
```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { OntologyVersionManager, Ontology } from '../versioning';

describe('Ontology Versioning', () => {
  let manager: OntologyVersionManager;
  const baseOntology: Ontology = {
    id: 'test',
    name: 'Test',
    version: '1.0.0',
    entities: [{ id: 'user', name: 'User', type: 'Actor' }],
    relationships: [],
    constraints: [],
  };

  beforeEach(() => {
    manager = new OntologyVersionManager(baseOntology);
  });

  it('should create initial version', () => {
    const versions = manager.getVersions();

    expect(versions).toHaveLength(1);
    expect(versions[0].version).toBe('1.0.0');
  });

  it('should create new version on modification', () => {
    const modifiedOntology: Ontology = {
      ...baseOntology,
      entities: [
        ...baseOntology.entities,
        { id: 'order', name: 'Order', type: 'Resource' },
      ],
    };

    manager.saveVersion(modifiedOntology, { message: 'Added Order entity' });

    const versions = manager.getVersions();

    expect(versions).toHaveLength(2);
    expect(versions[1].version).toBe('1.1.0');
    expect(versions[1].message).toBe('Added Order entity');
  });

  it('should restore previous version', () => {
    const modifiedOntology: Ontology = {
      ...baseOntology,
      entities: [
        ...baseOntology.entities,
        { id: 'order', name: 'Order', type: 'Resource' },
      ],
    };

    manager.saveVersion(modifiedOntology);

    const restored = manager.restoreVersion('1.0.0');

    expect(restored.entities).toHaveLength(1);
    expect(restored.entities[0].name).toBe('User');
  });

  it('should compare versions', () => {
    const modifiedOntology: Ontology = {
      ...baseOntology,
      entities: [
        ...baseOntology.entities,
        { id: 'order', name: 'Order', type: 'Resource' },
      ],
    };

    manager.saveVersion(modifiedOntology);

    const diff = manager.compareVersions('1.0.0', '1.1.0');

    expect(diff.added).toContainEqual(
      expect.objectContaining({ name: 'Order' })
    );
  });
});
```

---

### TC-03-INT-005: 本体同步API测试

**测试文件:** `src/features/ontology/__tests__/integration/api-sync.test.ts`

**测试目标:** 验证本体与后端API的同步

**用例类别:** 集成测试 / API同步
**优先级:** 🟡 P1 (High)

**测试代码:**
```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { msw } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { syncOntology, Ontology } from '../api/ontologySync';

const server = msw.listen();

describe('Ontology API Sync', () => {
  const mockOntology: Ontology = {
    id: 'test-ontology',
    name: 'Test',
    version: '1.0.0',
    entities: [],
    relationships: [],
    constraints: [],
  };

  beforeAll(() => server.listen());
  afterAll(() => server.close());

  it('should sync ontology to server', async () => {
    server.use(
      http.post('/api/ontologies', () => {
        return HttpResponse.json({
          success: true,
          id: 'server-ont-123',
        });
      })
    );

    const result = await syncOntology(mockOntology);

    expect(result.success).toBe(true);
    expect(result.id).toBe('server-ont-123');
  });

  it('should fetch ontology from server', async () => {
    server.use(
      http.get('/api/ontologies/:id', () => {
        return HttpResponse.json({
          id: 'server-ont-123',
          name: 'Server Ontology',
          entities: [],
        });
      })
    );

    const fetched = await fetchOntology('server-ont-123');

    expect(fetched).toBeDefined();
    expect(fetched.name).toBe('Server Ontology');
  });

  it('should handle sync conflicts', async () => {
    server.use(
      http.post('/api/ontologies', () => {
        return HttpResponse.json(
          {
            success: false,
            error: 'Conflict detected',
            conflict: {
              version: '1.1.0',
              author: 'other-user',
            },
          },
          { status: 409 }
        );
      })
    );

    const result = await syncOntology(mockOntology);

    expect(result.success).toBe(false);
    expect(result.conflict).toBeDefined();
  });

  it('should resolve conflicts with merge', async () => {
    server.use(
      http.post('/api/ontologies/resolve', () => {
        return HttpResponse.json({
          success: true,
          mergedOntology: mockOntology,
        });
      })
    );

    const result = await resolveConflict(mockOntology, '策略: 合并');

    expect(result.success).toBe(true);
  });
});
```

**覆盖的验收标准:** AC5

---

## 🌐 E2E 测试

### 测试框架

- **框架:** Playwright
- **浏览器:** Chrome, Firefox, Safari

---

### TC-03-E2E-001: 完成本体生成E2E测试

**测试文件:** `e2e/ontology/generation-flow.spec.ts`

**测试目标:** 验证从访谈结束到本体展示的完整流程

**用例类别:** E2E 测试 / 完整流程
**优先级:** 🔴 P0 (Critical)
**执行时间:** < 90s

**测试代码:**
```typescript
import { test, expect } from '@playwright/test';

test.describe('Ontology Generation E2E', () => {
  test('should generate ontology after interview completion', async ({ page }) => {
    // Start and complete interview
    await page.goto('/interview');

    // Complete interview questions
    await page.fill('input[data-testid="q-project-name"]', '测试项目');
    await page.click('button[data-testid="next-button"]');

    await page.click('label:has-text("Web应用") input[type="radio"]');
    await page.click('button[data-testid="next-button"]');

    await page.click('label:has-text("React") input[type="checkbox"]');
    await page.click('button[data-testid="next-button"]');

    // Submit interview
    await page.click('button[data-testid="submit-button"]');

    // Wait for ontology generation
    await expect(page.locator('[data-testid="ontology-loading"]')).toBeVisible();
    await expect(page.locator('[data-testid="ontology-loading"]')).not.toBeVisible({ timeout: 30000 });

    // Verify ontology is displayed
    await expect(page.locator('[data-testid="ontology-canvas"]')).toBeVisible();

    // Verify entities are visible
    await expect(page.locator('text=测试项目')).toBeVisible();
    await expect(page.locator('text=React')).toBeVisible();

    // Verify relationships are visible
    const edges = await page.locator('[data-testid*="edge"]').count();
    expect(edges).toBeGreaterThan(0);
  });

  test('should show generation progress', async ({ page }) => {
    await page.goto('/interview');

    // Quick complete interview
    await page.fill('input[data-testid="q-project-name"]', 'QuickTest');
    await page.click('button[data-testid="next-button"]');

    await page.click('label:has-text("API服务") input[type="radio"]');
    await page.click('button[data-testid="next-button"]');
    await page.click('button[data-testid="submit-button"]');

    // Check progress indicators
    await expect(page.locator('[data-testid="progress-step"]')).toHaveCount(/3|4/);
    await expect(page.locator('text=解析答案')).toBeVisible();
    await expect(page.locator('text=生成实体')).toBeVisible();
    await expect(page.locator('text=建立关系')).toBeVisible();
  });

  test('should handle generation errors gracefully', async ({ page }) => {
    // Mock error condition by setting problematic answers
    await page.goto('/interview');
    await page.fill('input[data-testid="q-project-name"]', '');
    await page.click('button[data-testid="next-button"]');

    // This should trigger error path
    await page.click('button[data-testid="submit-button"]');

    // Should show error message
    await expect(page.locator('[data-testid="generation-error"]')).toBeVisible();

    // Should provide retry option
    await expect(page.getByRole('button', { name: /重试/i })).toBeVisible();
  });
});
```

**覆盖的验收标准:** AC1, AC2, AC3

---

### TC-03-E2E-002: 本体可视化交互测试

**测试文件:** `e2e/ontology/visualizer-interaction.spec.ts`

**测试目标:** 验证本体可视化的交互功能

**用例类别:** E2E 测试 / 可视化交互
**优先级:** 🔴 P0 (Critical)
**执行时间:** < 45s

**测试代码:**
```typescript
import { test, expect } from '@playwright/test';

test.describe('Ontology Visualizer Interaction E2E', () => {
  test.beforeEach(async ({ page }) => {
    // Load pre-generated ontology
    await page.goto('/ontology/view');
  });

  test('should display entities with correct styling', async ({ page }) => {
    const entityNodes = await page.locator('[data-testid*="entity-node"]').count();

    expect(entityNodes).toBeGreaterThan(0);

    // Entity names should be visible
    await expect(page.locator('.entity-label')).toHaveCount(entityNodes);
  });

  test('should support zoom in/out', async ({ page }) => {
    const canvas = page.locator('[data-testid="ontology-canvas"]');

    // Initial scale
    const initialScale = await canvas.evaluate(el => {
      return el.style.transform;
    });

    // Zoom in
    await page.click('button[data-testid="zoom-in-button"]');
    const zoomedInScale = await canvas.evaluate(el => {
      return el.style.transform;
    });

    // Zoom out
    await page.click('button[data-testid="zoom-out-button"]');
    const zoomedOutScale = await canvas.evaluate(el => {
      return el.style.transform;
    });

    expect(zoomedInScale).not.toBe(initialScale);
    expect(zoomedOutScale).not.toBe(initialScale);
  });

  test('should support panning', async ({ page }) => {
    const canvas = page.locator('[data-testid="ontology-canvas"]');

    const initialPosition = await canvas.boundingBox();

    // Drag canvas
    await canvas.dragTo(canvas, {
      sourcePosition: { x: 100, y: 100 },
      targetPosition: { x: 200, y: 200 },
    });

    const newPosition = await canvas.boundingBox();

    // Position should have changed
    expect(newPosition).not.toStrictEqual(initialPosition);
  });

  test('should show entity details on click', async ({ page }) => {
    const firstEntity = page.locator('[data-testid*="entity-node"]').first();

    await firstEntity.click();

    // Details panel should appear
    await expect(page.locator('[data-testid="entity-details-panel"]')).toBeVisible();

    // Should show entity name
    await expect(page.locator('[data-testid="detail-name"]')).toBeVisible();
  });

  test('should highlight relationships on entity hover', async ({ page }) => {
    const userEntity = page.locator('[data-entity-id="user"]');
    const relatedEdges = page.locator('[data-relation="user"]');

    // Hover over user entity
    await userEntity.hover();

    // Related edges should highlight
    await expect(relatedEdges).toHaveClass(/highlight/);

    // Unrelated edges should dim
    await expect(page.locator('[data-testid*="edge"]:not([data-relation="user"])')).toHaveClass(/dim/);
  });
});
```

**覆盖的验收标准:** AC3

---

### TC-03-E2E-003: 本体编辑E2E测试

**测试文件:** `e2e/ontology/editor-interaction.spec.ts`

**测试目标:** 验证本体编辑功能

**用例类别:** E2E 测试 / 编辑交互
**优先级:** 🟡 P1 (High)
**执行时间:** < 60s

**测试代码:**
```typescript
import { test, expect } from '@playwright/test';

test.describe('Ontology Editor E2E', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/ontology/edit');
  });

  test('should add new entity', async ({ page }) => {
    // Click add entity button
    await page.click('button[data-testid="add-entity-button"]');

    // Fill form
    await page.fill('input[name="entity-name"]', 'Product');
    await page.selectOption('select[name="entity-type"]', 'Resource');

    // Submit
    await page.click('button[data-testid="save-entity-button"]');

    // Verify entity added
    await expect(page.locator('text=Product')).toBeVisible();
    await expect(page.locator('[data-entity-id="product"]')).toBeVisible();
  });

  test('should edit existing entity', async ({ page }) => {
    // Click on existing entity
    await page.click('[data-entity-id="user"]');

    // Click edit button
    await page.click('button[data-testid="edit-entity-button"]');

    // Modify name
    const nameInput = page.locator('input[name="entity-name"]');
    await nameInput.clear();
    await nameInput.fill('Customer');

    // Submit
    await page.click('button[data-testid="save-entity-button"]');

    // Verify updated
    await expect(page.locator('text=Customer')).toBeVisible();
  });

  test('should delete entity', async ({ page }) => {
    // Click on entity
    await page.click('[data-entity-id="temp-entity"]');

    // Click delete button
    await page.click('button[data-testid="delete-entity-button"]');

    // Confirm in modal
    await page.click('button[data-testid="confirm-delete-button"]');

    // Verify deleted
    await expect(page.locator('[data-entity-id="temp-entity"]')).not.toBeVisible();
  });

  test('should add relationship between entities', async ({ page }) => {
    // Select two entities
    await page.click('[data-entity-id="user"]');
    await page.keyboard.down('Shift');
    await page.click('[data-entity-id="order"]');
    await page.keyboard.up('Shift');

    // Click add relationship
    await page.click('button[data-testid="add-relation-button"]');

    // Select relationship type
    await page.selectOption('select[name="relation-type"]', 'places');

    // Submit
    await page.click('button[data-testid="save-relation-button"]');

    // Verify relationship added
    const edges = await page.locator('[data-source="user"][data-target="order"]').count();
    expect(edges).toBeGreaterThan(0);
  });

  test('should undo and redo changes', async ({ page }) => {
    // Add an entity
    await page.click('button[data-testid="add-entity-button"]');
    await page.fill('input[name="entity-name"]', 'TestEntity');
    await page.click('button[data-testid="save-entity-button"]');

    // Undo
    await page.click('button[data-testid="undo-button"]');
    await expect(page.locator('text=TestEntity')).not.toBeVisible();

    // Redo
    await page.click('button[data-testid="redo-button"]');
    await expect(page.locator('text=TestEntity')).toBeVisible();
  });
});
```

**覆盖的验收标准:** AC4

---

### TC-03-E2E-004: 本体导出E2E测试

**测试文件:** `e2e/ontology/export.spec.ts`

**测试目标:** 验证本体导出功能

**用例类别:** E2E 测试 / 数据导出
**优先级:** 🟡 P1 (High)
**执行时间:** < 30s

**测试代码:**
```typescript
import { test, expect } from '@playwright/test';

test.describe('Ontology Export E2E', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/ontology/view');
  });

  test('should export ontology as JSON', async ({ page }) => {
    // Click export button
    await page.click('button[data-testid="export-button"]');

    // Select JSON format
    await page.click('label:has-text("JSON") input[type="radio"]');

    // Download
    const downloadPromise = page.waitForEvent('download');
    await page.click('button[data-testid="download-button"]');

    const download = await downloadPromise;

    // Verify file
    expect(download.suggestedFilename()).toMatch(/\.json$/);

    // Verify content
    const content = await download.createReadStream().toString();
    const data = JSON.parse(content);

    expect(data).toHaveProperty('name');
    expect(data).toHaveProperty('entities');
    expect(data).toHaveProperty('relationships');
  });

  test('should export ontology as RDF', async ({ page }) => {
    await page.click('button[data-testid="export-button"]');
    await page.click('label:has-text("RDF/XML") input[type="radio"]');

    const downloadPromise = page.waitForEvent('download');
    await page.click('button[data-testid="download-button"]');

    const download = await downloadPromise;

    expect(download.suggestedFilename()).toMatch(/\.rdf$/);

    const content = await download.createReadStream().toString();

    expect(content).toContain('<?xml');
    expect(content).toContain('xmlns:rdf');
  });

  test('should export ontology as GraphML', async ({ page }) => {
    await page.click('button[data-testid="export-button"]');
    await page.click('label:has-text("GraphML") input[type="radio"]');

    const downloadPromise = page.waitForEvent('download');
    await page.click('button[data-testid="download-button"]');

    const download = await downloadPromise;

    expect(download.suggestedFilename()).toMatch(/\.graphml$/);

    const content = await download.createReadStream().toString();

    expect(content).toContain('<graphml>');
    expect(content).toContain('<graph>');
  });
});
```

**覆盖的验收标准:** AC5

---

### TC-03-E2E-005: 大型本体性能测试

**测试文件:** `e2e/ontology/large-ontology.spec.ts`

**测试目标:** 验证处理大型本体的性能

**用例类别:** E2E 测试 / 性能测试
**优先级:** 🟢 P2 (Medium)
**执行时间:** < 120s

**测试代码:**
```typescript
import { test, expect } from '@playwright/test';

test.describe('Large Ontology Performance E2E', () => {
  test('should render large ontology efficiently', async ({ page }) => {
    // Load ontology with many entities
    await page.goto('/ontology/demo/large');

    // Wait for rendering
    const startTime = await performance.now();
    await expect(page.locator('[data-testid="ontology-canvas"]')).toBeVisible();
    const endTime = await performance.now();

    // Should render within 10 seconds
    expect(endTime - startTime).toBeLessThan(10000);

    // Verify all entities are loaded
    const entityCount = await page.locator('[data-testid*="entity-node"]').count();
    expect(entityCount).toBeGreaterThan(100);
  });

  test('should handle zoom on large ontology', async ({ page }) => {
    await page.goto('/ontology/demo/large');

    const canvas = page.locator('[data-testid="ontology-canvas"]');

    const startTime = await performance.now();
    await page.click('button[data-testid="zoom-in-button"]');
    await page.waitForTimeout(500); // Wait for animation
    const endTime = await performance.now();

    // Zoom should complete within 1 second
    expect(endTime - startTime).toBeLessThan(1000);
  });

  test('should support performance mode for large graphs', async ({ page }) => {
    await page.goto('/ontology/demo/large');

    // Enable performance mode
    await page.click('button[data-testid="settings-button"]');
    await page.click('label:has-text("Performance Mode") input[type="checkbox"]');

    // Verify simplified rendering
    const canvas = page.locator('[data-testid="ontology-canvas"]');
    await expect(canvas).toHaveClass(/performance-mode/);
  });
});
```

---

## 🚧 边界测试

### TC-03-BND-001: 空访谈答案测试

**测试文件:** `src/features/ontology/__tests__/boundary/empty-answers.test.ts`

**测试目标:** 验证空答案的处理

**用例类别:** 边界测试 / 空输入
**优先级:** 🟡 P1 (High)

**测试代码:**
```typescript
import { describe, it, expect } from 'vitest';
import { generateOntologyFromAnswers } from '../ontologyGenerator';

describe('Empty Answers Handling', () => {
  it('should handle completely empty answers', () => {
    const emptyAnswers = {};

    const ontology = generateOntologyFromAnswers(emptyAnswers);

    expect(ontology).toBeDefined();
    expect(ontology.entities).not.toHaveLength(0);
    // Should generate a minimal template ontology
  });

  it('should handle only project name', () => {
    const minimalAnswers = {
      projectName: 'MyProject',
    };

    const ontology = generateOntologyFromAnswers(minimalAnswers);

    expect(ontology).toBeDefined();
    expect(ontology.name).toBe('MyProject');
    // Should have some default entities
  });

  it('should handle answers with only optional fields', () => {
    const optionalAnswers = {
      projectName: 'Test',
      description: 'Some description',
      notes: 'Additional notes',
    };

    const ontology = generateOntologyFromAnswers(optionalAnswers);

    expect(ontology).toBeDefined();
    expect(ontology.entities.length).toBeGreaterThan(0);
  });
});
```

---

### TC-03-BND-002: 过长实体名称测试

**测试文件:** `src/features/ontology/__tests__/boundary/long-names.test.ts`

**测试目标:** 验证超长名称的处理

**用例类别:** 边界测试 / 长度限制
**优先级:** 🟢 P2 (Medium)

**测试代码:**
```typescript
import { describe, it, expect } from 'vitest';
import { generateEntity } from '../generators/entityGenerator';

describe('Long Names Handling', () => {
  it('should handle very long entity names', () => {
    const longName = 'A'.repeat(200);

    const entity = generateEntity({
      name: longName,
      type: 'Test',
    });

    // Should cap or trim the name
    expect(entity.name.length).toBeLessThanOrEqual(100);
  });

  it('should truncate in visualization', () => {
    const longName = 'VeryLongEntityNameThatShouldBeTruncated';

    const displayName = truncateName(longName, 20);

    expect(displayName.length).toBeLessThanOrEqual(20);
    expect(displayName).toContain('...');
  });
});
```

---

### TC-03-BND-003: 最大实体数量测试

**测试文件:** `src/features/ontology/__tests__/boundary/max-entities.test.ts`

**测试目标:** 验证最大实体数量的处理

**用例类别:** 边界测试 / 数量限制
**优先级:** 🟢 P2 (Medium)

**测试代码:**
```typescript
import { describe, it, expect } from 'vitest';
import { Ontology } from '../types';

describe('Max Entities Handling', () => {
  it('should warn when approaching max entities', () => {
    const ontology: Ontology = {
      id: 'test',
      name: 'Test',
      entities: Array.from({ length: 900 }, (_, i) => ({
        id: `entity-${i}`,
        name: `Entity${i}`,
        type: 'Test',
      })),
      relationships: [],
      constraints: [],
    };

    const warning = checkEntityLimitWarning(ontology);

    expect(warning.warningLevel).toBe('warning');
    expect(warning.message).toContain('approaching');
  });

  it('should block adding beyond max entities', () => {
    const ontology: Ontology = {
      id: 'test',
      name: 'Test',
      entities: Array.from({ length: 1000 }, (_, i) => ({
        id: `entity-${i}`,
        name: `Entity${i}`,
        type: 'Test',
      })),
      relationships: [],
      constraints: [],
    };

    const canAdd = canAddEntity(ontology);

    expect(canAdd).toBe(false);
  });
});
```

---

### TC-03-BND-004: 复杂关系链测试

**测试文件:** `src/features/ontology/__tests__/boundary/complex-relations.test.ts`

**测试目标:** 验证复杂关系链的处理

**用例类别:** 边界测试 / 复杂度
**优先级:** 🟢 P2 (Medium)

**测试代码:**
```typescript
import { describe, it, expect } from 'vitest';
import { Ontology, validateOntology } from '../types';

describe('Complex Relationship Chains', () => {
  it('should detect excessively deep chains', () => {
    const ontology: Ontology = {
      id: 'test',
      name: 'Test',
      entities: Array.from({ length: 20 }, (_, i) => ({
        id: `entity-${i}`,
        name: `Entity${i}`,
        type: 'Test',
      })),
      relationships: Array.from({ length: 19 }, (_, i) => ({
        id: `rel-${i}`,
        source: `entity-${i}`,
        target: `entity-${i + 1}`,
        type: 'depends_on',
      })),
      constraints: [],
    };

    const result = validateOntology(ontology);

    expect(result.warnings).toContainEqual(
      expect.objectContaining({
        type: 'deep_chain',
        depth: 20,
      })
    );
  });

  it('should detect densely connected entities (supernodes)', () => {
    const ontology: Ontology = {
      id: 'test',
      name: 'Test',
      entities: [
        { id: 'hub', name: 'Hub', type: 'Test' },
        ...Array.from({ length: 50 }, (_, i) => ({
          id: `spoke-${i}`,
          name: `Spoke${i}`,
          type: 'Test',
        })),
      ],
      relationships: Array.from({ length: 50 }, (_, i) => ({
        id: `rel-${i}`,
        source: 'hub',
        target: `spoke-${i}`,
        type: 'connects_to',
      })),
      constraints: [],
    };

    const result = validateOntology(ontology);

    expect(result.warnings).toContainEqual(
      expect.objectContaining({
        type: 'supernode',
        entityId: 'hub',
        connections: 50,
      })
    );
  });
});
```

---

### TC-03-BND-005: 特殊字符处理测试

**测试文件:** `src/features/ontology/__tests__/boundary/special-chars.test.ts`

**测试目标:** 验证特殊字符的处理

**用例类别:** 边界测试 / 安全性
**优先级:** 🟢 P2 (Medium)

**测试代码:**
```typescript
import { describe, it, expect } from 'vitest';
import {
  generateEntity,
  sanitizeEntityName,
} from '../generators/entityGenerator';

describe('Special Characters Handling', () => {
  it('should sanitize HTML in entity names', () => {
    const dangerous = '<script>alert("xss")</script>';
    const entity = generateEntity({ name: dangerous, type: 'Test' });

    expect(entity.name).not.toContain('<script>');
  });

  it('should handle Unicode characters', () => {
    const unicodeNames = [
      '项目🚀',
      'アプリ',
      '프로젝트',
    ];

    unicodeNames.forEach(name => {
      const entity = generateEntity({ name, type: 'Test' });

      expect(entity.name).toBe(name);
    });
  });

  it('should escape SQL-injection patterns', () => {
    const injection = "'; DROP TABLE entities; --";
    const safeName = sanitizeEntityName(injection);

    expect(safeName).not.toContain('DROP TABLE');
  });
});
```

---

### TC-03-BND-006: 内存使用边界测试

**测试文件:** `src/features/ontology/__tests__/boundary/memory.test.ts`

**测试目标:** 验证内存使用的边界

**用例类别:** 边界测试 / 内存
**优先级:** 🟢 P2 (Medium)

**测试代码:**
```typescript
import { describe, it, expect } from 'vitest';
import { generateOntologyFromAnswers } from '../ontologyGenerator';

describe('Memory Usage Boundaries', () => {
  it('should handle large answer sets efficiently', () => {
    const largeAnswers = {
      projectName: 'LargeProject',
      items: Array.from({ length: 1000 }, (_, i) => ({
        id: `item-${i}`,
        name: `Item${i}`,
      })),
    };

    const startTime = performance.now();
    const ontology = generateOntologyFromAnswers(largeAnswers);
    const endTime = performance.now();

    // Should complete within reasonable time
    expect(endTime - startTime).toBeLessThan(5000);

    // Should generate reasonable number of entities
    expect(ontology.entities.length).toBeGreaterThan(0);
    expect(ontology.entities.length).toBeLessThan(1000);
  });

  it('should clean up old references', () => {
    // Generate ontologies repeatedly and check for memory leaks
    for (let i = 0; i < 100; i++) {
      generateOntologyFromAnswers({ projectName: `Test${i}` });
    }

    // Should not cause memory to grow unbounded
    const memoryUsage = getMemoryUsage();
    expect(memoryUsage.heapUsed).toBeLessThan(100 * 1024 * 1024); // < 100MB
  });
});
```

---

## 🐛 异常场景测试

### TC-03-ERR-001: 生成失败恢复测试

**测试文件:** `src/features/ontology/__tests__/error/generation-failure.test.ts`

**测试目标:** 验证生成失败后的恢复

**用例类别:** 异常测试 / 错误恢复
**优先级:** 🟡 P1 (High)

**测试代码:**
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateOntologyFromAnswers, OntologyGenerator } from '../ontologyGenerator';

describe('Generation Failure Recovery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should handle parsing errors gracefully', () => {
    // Mock parser that throws
    vi.spyOn(Spy, 'parseAnswers').mockImplementation(() => {
      throw new Error('Parse error: Invalid format');
    });

    const result = OntologyGenerator.generateFromAnswers({ projectName: 'Test' });

    expect(result.success).toBe(false);
    expect(result.error).toContain('parse');
    expect(result.recoveryOptions).toContain('retry');
    expect(result.recoveryOptions).toContain('use_template');
  });

  it('should provide fallback template on failure', () => {
    vi.spyOn(Spy, 'parseAnswers').mockImplementation(() => {
      throw new Error('Some error');
    });

    const result = OntologyGenerator.generateFromAnswers(
      { projectName: 'Test' },
      { useFallback: true }
    );

    expect(result.success).toBe(true);
    expect(result.ontology).toBeDefined();
    expect(result.usedFallback).toBe(true);
  });

  it('should preserve partial results on partial failure', () => {
    // Mock partial success
    vi.spyOn(Spy, 'parseAnswers').mockImplementation(() => {
      throw new Error('Partial error at step 3');
    });

    const result = OntologyGenerator.generateFromAnswers();

    expect(result.partial).toBe(true);
    expect(result.ontology.entities).toBeGreaterThan(0);
    expect(result.completedSteps).toEqual([1, 2]);
  });
});
```

---

### TC-03-ERR-002: 并发编辑冲突测试

**测试文件:** `src/features/ontology/__tests__/error/concurrent-edit.test.ts`

**测试目标:** 验证并发编辑冲突处理

**用例类别:** 异常测试 / 并发控制
**优先级:** 🟡 P1 (High)

**测试代码:**
```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { OntologyEditor, Ontology } from '../ontologyEditor';
import { renderHook, act } from '@testing-library/react';

describe('Concurrent Edit Conflicts', () => {
  const baseOntology: Ontology = {
    id: 'test',
    name: 'Test',
    entities: [{ id: 'user', name: 'User', type: 'Actor' }],
    relationships: [],
    constraints: [],
  };

  beforeEach(() => {
    const { reset } = useOntologySync.getState();
    reset();
  });

  it('should detect concurrent modifications', async () => {
    const { result } = renderHook(() => useOntologySync());

    // User A edits
    act(() => {
      result.current.updateEntity('user', { name: 'CustomerA' });
    });

    // Simulate User B's edit (later version)
    act(() => {
      result.current.receiveRemoteUpdate({
        entityId: 'user',
        version: 2,  // Higher than user A's
        changes: { name: 'CustomerB' },
        author: 'user-b',
      });
    });

    expect(result.current.hasConflict).toBe(true);
  });

  it('should provide conflict resolution options', async () => {
    const { result } = renderHook(() => useOntologySync());

    // Setup conflict
    act(() => {
      result.current.updateEntity('user', { name: 'CustomerA' });
      result.current.receiveRemoteUpdate({
        entityId: 'user',
        version: 2,
        changes: { name: 'CustomerB' },
        author: 'user-b',
      });
    });

    const options = result.current.getConflictOptions();

    expect(options).toContainEqual({ id: 'use-mine', label: '使用我的更改' });
    expect(options).toContainEqual({ id: 'use-theirs', label: '使用他们的更改' });
    expect(options).toContainEqual({ id: 'merge', label: '手动合并' });
  });

  it('should apply chosen resolution', async () => {
    const { result } = renderHook(() => useOntologySync());

    // Setup conflict
    act(() => {
      result.current.updateEntity('user', { name: 'CustomerA' });
      result.current.receiveRemoteUpdate({
        entityId: 'user',
        version: 2,
        changes: { name: 'CustomerB' },
        author: 'user-b',
      });
    });

    // Apply resolution
    act(() => {
      result.current.resolveConflict('use-theirs');
    });

    expect(result.current.hasConflict).toBe(false);
    expect(
      result.current.ontology.entities.find(e => e.id === 'user').name
    ).toBe('CustomerB');
  });
});
```

---

### TC-03-ERR-003: 损坏数据恢复测试

**测试文件:** `src/features/ontology/__tests__/error/corrupt-data.test.ts`

**测试目标:** 验证损坏数据的恢复

**用例类别:** 异常测试 / 数据完整性
**优先级:** 🟡 P1 (High)

**测试代码:**
```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { loadOntology, recoverOntology } from '../ontologyStorage';

describe('Corrupted Data Recovery', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('should detect corrupted ontology data', () => {
    localStorage.setItem('ontology', 'invalid-json{');

    const result = loadOntology();

    expect(result.success).toBe(false);
    expect(result.error).toContain('corrupted');
  });

  it('should recover from backup', () => {
    // Store valid backup
    const validOntology = {
      id: 'test',
      name: 'Test',
      entities: [],
      relationships: [],
      constraints: [],
    };

    localStorage.setItem('ontology-backup', JSON.stringify(validOntology));
    localStorage.setItem('ontology', 'corrupted-data');

    const result = recoverOntology();

    expect(result.success).toBe(true);
    expect(result.ontology.name).toBe('Test');
    expect(result.recoveredFrom).toBe('backup');
  });

  it('should use template when no backup available', () => {
    localStorage.setItem('ontology', 'corrupted-data');

    const result = recoverOntology();

    expect(result.success).toBe(true);
    expect(result.ontology).toBeDefined();
    expect(result.recoveredFrom).toBe('template');
  });
});
```

---

### TC-03-ERR-004: 导出失败处理测试

**测试文件:** `src/features/ontology/__tests__/error/export-fail.test.ts`

**测试目标:** 验证导出失败的处理

**用例类别:** 异常测试 / 导出错误
**优先级:** 🟡 P1 (High)

**测试代码:**
```typescript
import { describe, it, expect, vi } from 'vitest';
import {
  exportAsJSON,
  exportAsRDF,
  Ontology,
} from '../exporters';

describe('Export Failures', () => {
  const sampleOntology: Ontology = {
    id: 'test',
    name: 'Test',
    entities: [],
    relationships: [],
    constraints: [],
  };

  it('should handle JSON export failure', async () => {
    // Mock JSON.stringify to throw
    const originalStringify = JSON.stringify;
    JSON.stringify = vi.fn(() => {
      throw new Error('Stringify failed');
    });

    const result = await exportAsJSON(sampleOntology);

    expect(result.success).toBe(false);
    expect(result.error).toContain('export');

    JSON.stringify = originalStringify;
  });

  it('should handle DOM error in GraphML export', () => {
    // Test XML parser error
    const invalidOntology: Ontology = {
      ...sampleOntology,
      // Invalid chars that break XML
      entities: [
        { id: ', test', name: '\x00Invalid', type: 'Test' },
      ],
    };

    const result = exportAsGraphML(invalidOntology);

    expect(result.success).toBe(false);
    expect(result.error).toContain('xml');
  });

  it('should provide retry option after failure', () => {
    const result = exportAsJSON(sampleOntology);

    if (!result.success) {
      expect(result.retryAvailable).toBe(true);
    }
  });
});
```

---

## ⚡ 性能测试

### 性能指标

| 指标 | 约束 | 测试方法 |
|-----|------|----------|
| 本体生成时间 | < 2s | 计时测试 |
| 可视化渲染时间 | < 1s (500实体) | 渲染性能 |
| 实体操作响应 | < 100ms | 交互性能 |
| 导出时间 | < 500ms (JSON) | 导出性能 |

---

### TC-03-PERF-001: 本体生成性能

**测试文件:** `src/features/ontology/__tests__/performance/generation-speed.test.ts`

**测试目标:** 验证本体生成性能

**用例类别:** 性能测试 / 生成速度
**优先级:** 🟡 P1 (High)
**目标:** < 2s

**测试代码:**
```typescript
import { describe, it, expect } from 'vitest';
import { generateOntologyFromAnswers } from '../ontologyGenerator';

describe('Ontology Generation Performance', () => {
  it('should generate ontology from interview within 2 seconds', () => {
    const answers = {
      projectName: 'PerformanceTest',
      projectType: 'Web应用',
      techStack: Array.from({ length: 20 }, (_, i) => `Tech${i}`),
      items: Array.from({ length: 100 }, (_, i) => ({
        id: `item-${i}`,
        name: `Item${i}`,
      })),
    };

    const startTime = performance.now();

    const ontology = generateOntologyFromAnswers(answers);

    const endTime = performance.now();
    const duration = endTime - startTime;

    expect(duration).toBeLessThan(2000);
  });

  it('should scale linearly with number of entities', () => {
    const sizes = [10, 50, 100, 500];
    const times: number[] = [];

    sizes.forEach(size => {
      const answers = {
        projectName: `Test${size}`,
        items: Array.from({ length: size }, (_, i) => ({
          id: `item-${i}`,
          name: `Item${i}`,
        })),
      };

      const startTime = performance.now();
      const ontology = generateOntologyFromAnswers(answers);
      const duration = performance.now() - startTime;

      times.push(duration / size); // Time per entity
    });

    // Time per entity should not grow significantly
    const avgTime = times.reduce((a, b) => a + b) / times.length;
    times.forEach(time => {
      expect(time).toBeLessThan(avgTime * 2); // Less than 2x average
    });
  });
});
```

---

### TC-03-PERF-002: 可视化渲染性能

**测试文件:** `src/features/ontology/__tests__/performance/render-speed.test.tsx`

**测试目标:** 验证可视化渲染性能

**用例类别:** 性能测试 / 渲染速度
**优先级:** 🟡 P1 (High)
**目标:** < 1s (500实体)

**测试代码:**
```typescript
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { OntologyVisualizer } from '../components/OntologyVisualizer';
import { Ontology } from '../types';

describe('Visualizer Rendering Performance', () => {
  const createLargeOntology = (count: number): Ontology => ({
    id: 'test',
    name: 'Large',
    entities: Array.from({ length: count }, (_, i) => ({
      id: `entity-${i}`,
      name: `Entity${i}`,
      type: 'Test',
      position: { x: i * 50, y: (i % 10) * 50 },
    })),
    relationships: Array.from({ length: count - 1 }, (_, i) => ({
      id: `rel-${i}`,
      source: `entity-${i}`,
      target: `entity-${i + 1}`,
      type: 'connects',
    })),
    constraints: [],
  });

  it('should render 100 entities within 500ms', () => {
    const ontology = createLargeOntology(100);

    const startTime = performance.now();

    render(<OntologyVisualizer ontology={ontology} />);

    const endTime = performance.now();
    const duration = endTime - startTime;

    expect(duration).toBeLessThan(500);
  });

  it('should render 500 entities within 1 second', () => {
    const ontology = createLargeOntology(500);

    const startTime = performance.now();

    render(<OntologyVisualizer ontology={ontology} />);

    const endTime = performance.now();
    const duration = endTime - startTime;

    expect(duration).toBeLessThan(1000);
  });

  it('should use virtualization for large ontologies', () => {
    const ontology = createLargeOntology(1000);

    const { container } = render(<OntologyVisualizer ontology={ontology} />);

    // With virtualization, not all entities should be in DOM
    const renderedEntities = container.querySelectorAll('[data-testid*="entity-node"]');

    expect(renderedEntities.length).toBeLessThan(1000);
  });
});
```

---

### TC-03-PERF-003: 搜索性能测试

**测试文件:** `src/features/ontology/__tests__/performance/search-speed.test.ts`

**测试目标:** 验证本体搜索性能

**用例类别:** 性能测试 / 搜索速度
**优先级:** 🟢 P2 (Medium)
**目标:** < 50ms (1000实体)

**测试代码:**
```typescript
import { describe, it, expect } from 'vitest';
import { searchOntology, Ontology } from '../services/ontologySearch';

describe('Search Performance', () => {
  const createLargeOntology = (): Ontology => ({
    id: 'test',
    name: 'Test',
    entities: Array.from({ length: 1000 }, (_, i) => ({
      id: `entity-${i}`,
      name: `Entity${i}`,
      type: 'Test',
      description: `Description for entity ${i}`,
    })),
    relationships: [],
    constraints: [],
  });

  it('should search 1000 entities within 50ms', () => {
    const ontology = createLargeOntology();

    const startTime = performance.now();

    const results = searchOntology(ontology, 'Entity');

    const endTime = performance.now();
    const duration = endTime - startTime;

    expect(duration).toBeLessThan(50);
    expect(results.entities.length).toBeGreaterThan(0);
  });

  it('should use indexed search for repeated queries', () => {
    const ontology = createLargeOntology();

    // First query (caches index)
    searchOntology(ontology, 'User');

    // Second query (uses cache)
    const startTime = performance.now();
    searchOntology(ontology, 'Admin');
    const duration = performance.now() - startTime;

    // Should be faster with cache
    expect(duration).toBeLessThan(10);
  });
});
```

---

### TC-03-PERF-004: 导出性能测试

**测试文件:** `src/features/ontology/__tests__/performance/export-speed.test.ts`

**测试目标:** 验证导出性能

**用例类别:** 性能测试 / 导出速度
**优先级:** 🟢 P2 (Medium)
**目标:** < 500ms

**测试代码:**
```typescript
import { describe, it, expect } from 'vitest';
import {
  exportAsJSON,
  exportAsRDF,
  exportAsGraphML,
  Ontology,
} from '../exporters';

describe('Export Performance', () => {
  const createLargeOntology = (): Ontology => ({
    id: 'test',
    name: 'Test',
    entities: Array.from({ length: 500 }, (_, i) => ({
      id: `entity-${i}`,
      name: `Entity${i}`,
      type: 'Test',
    })),
    relationships: Array.from({ length: 500 }, (_, i) => ({
      id: `rel-${i}`,
      source: `entity-${i}`,
      target: `entity-${(i + 1) % 500}`,
      type: 'connects',
    })),
    constraints: [],
  });

  it('should export 500-entity ontology as JSON within 500ms', () => {
    const ontology = createLargeOntology();

    const startTime = performance.now();

    exportAsJSON(ontology);

    const endTime = performance.now();
    const duration = endTime - startTime;

    expect(duration).toBeLessThan(500);
  });

  it('should export RDF within 1 second', () => {
    const ontology = createLargeOntology();

    const startTime = performance.now();

    exportAsRDF(ontology, 'turtle');

    const endTime = performance.now();
    const duration = endTime - startTime;

    expect(duration).toBeLessThan(1000);
  });

  it('should handle streaming for large exports', () => {
    const ontology = createLargeOntology();

    let chunkCount = 0;

    const options = {
      onChunk: () => chunkCount++,
      chunkSize: 100,
    };

    exportAsJSON(ontology, options);

    // Should have emitted multiple chunks
    expect(chunkCount).toBeGreaterThan(1);
    expect(chunkCount).toBeLessThan(10);
  });
});
```

---

## 🎭 用户体验测试

### TC-03-UX-001: 加载状态显示测试

**测试文件:** `src/features/ontology/components/__tests__/ux/loading-states.test.tsx`

**测试目标:** 验证加载状态清晰显示

**用例类别:** UX 测试 / 加载状态
**优先级:** 🟢 P2 (Medium)

**测试代码:**
```typescript
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { OntologyViewer } from '../components/OntologyViewer';

describe('Loading States', () => {
  it('should show skeleton loader during generation', () => {
    render(<OntologyViewer loading={true} />);

    expect(screen.getByTestId('skeleton-loader')).toBeInTheDocument();
  });

  it('should show progress percentage', () => {
    render(<OntologyViewer loading={true} progress={45} />);

    expect(screen.getByText('45%')).toBeInTheDocument();
    expect(screen.getByTestId('progress-bar')).toHaveStyle({
      width: '45%',
    });
  });

  it('should show step-by-step progress', () => {
    render(
      <OntologyViewer
        loading={true}
        steps={[
          { name: '解析答案', status: 'completed' },
          { name: '生成实体', status: 'in_progress' },
          { name: '建立关系', status: 'pending' },
        ]}
      />
    );

    expect(screen.getByText('解析答案 ✓')).toBeInTheDocument();
    expect(screen.getByText('生成实体')).toBeInTheDocument();
    expect(screen.getByText('建立关系')).toBeInTheDocument();
  });
});
```

---

### TC-03-UX-002: 错误提示清晰度测试

**测试文件:** `src/features/ontology/components/__tests__/ux/error-messages.test.tsx`

**测试目标:** 验证错误提示清晰有用

**用例类别:** UX 测试 / 错误提示
**优先级:** 🟢 P2 (Medium)

**测试代码:**
```typescript
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ErrorMessage } from '../components/ErrorMessage';

describe('Error Message Clarity', () => {
  it('should show user-friendly error message', () => {
    const error = {
      type: 'validation_error',
      message: '实体名称不能为空',
      field: 'entity-name',
    };

    render(<ErrorMessage error={error} />);

    expect(screen.getByText('实体名称不能为空')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /重试/i })).toBeInTheDocument();
  });

  it('should provide suggestions for fixing errors', () => {
    const error = {
      type: 'conflict',
      message: '发现冲突',
      suggestions: ['重新加载', '手动合并'],
    };

    render(<ErrorMessage error={error} />);

    expect(screen.getByText('重新加载')).toBeInTheDocument();
    expect(screen.getByText('手动合并')).toBeInTheDocument();
  });

  it('should show context information', () => {
    const error = {
      type: 'validation_error',
      message: '循环依赖',
      context: {
        entities: ['A', 'B', 'C'],
        relations: ['A->B', 'B->C', 'C->A'],
      },
    };

    render(<ErrorMessage error={error} />);

    expect(screen.getByText('A -> B')).toBeInTheDocument();
    expect(screen.getByText('B -> C')).toBeInTheDocument();
    expect(screen.getByText('C -> A')).toBeInTheDocument();
  });
});
```

---

## 📊 测试数据

### 测试数据集 1: Web应用访谈答案

**用途:** 测试Web应用本体生成

**数据:**
```json
{
  "webAppAnswers": {
    "projectName": "电商平台",
    "projectType": "Web应用",
    "techStack": ["React", "TypeScript", "Node.js", "MongoDB", "Redis"],
    "businessDomain": "电商",
    "targetUsers": ["消费者", "商家", "管理者"],
    "teamSize": "11-20人",
    "keyFeatures": [
      "商品浏览",
      "购物车",
      "订单管理",
      "支付集成",
      "用户认证"
    ]
  }
}
```

### 测试数据集 2: 预期本体结构

**用途:** 验证生成结果

**数据:**
```json
{
  "expectedOntology": {
    "entities": [
      { "name": "电商平台", "type": "Project" },
      { "name": "React", "type": "Technology" },
      { "name": "消费者", "type": "User" },
      { "name": "购物车", "type": "Component" },
      { "name": "订单", "type": "BusinessEntity" }
    ],
    "relationships": [
      { "source": "React", "target": "电商平台", "type": "implements" },
      { "source": "消费者", "target": "购物车", "type": "owns" },
      { "source": "消费者", "target": "订单", "type": "places" }
    ]
  }
}
```

---

## ✅ 验收标准测试

### AC1: 根据访谈答案生成初始本体结构

**Given** 用户完成访谈并提交答案
**When** 系统处理答案
**Then** 生成包含实体和关系的初始本体结构

**测试用例:** TC-03-001, TC-03-INT-001, TC-03-E2E-001

**测试结果:** ☐ Pass / ☐ Fail

**测试证据:**
- 单元测试: `TC-03-001`
- 集成测试: `TC-03-INT-001`
- E2E 测试: `TC-03-E2E-001`

---

### AC2: 本体包含实体、属性、关系定义

**Given** 生成的本体结构
**When** 查看本体的组成
**Then** 包含完整的实体定义、属性规范和关系映射

**测试用例:** TC-03-002, TC-03-003, TC-03-004

**测试结果:** ☐ Pass / ☐ Fail

**测试证据:**
- 单元测试: `TC-03-002, TC-03-003, TC-03-004`

---

### AC3: 支持本体结构的可视化展示

**Given** 生成的本体结构
**When** 用户查看本体可视化界面
**Then** 以图形方式清晰展示实体和关系

**测试用例:** TC-03-INT-002, TC-03-E2E-002

**测试结果:** ☐ Pass / ☐ Fail

**测试证据:**
- 集成测试: `TC-03-INT-002`
- E2E 测试: `TC-03-E2E-002`

---

### AC4: 支持用户对本体进行编辑和调整

**Given** 用户查看可视化本体
**When** 用户执行编辑操作（添加/修改/删除实体或关系）
**Then** 本体结构相应更新

**测试用例:** TC-03-013, TC-03-INT-003, TC-03-E2E-003

**测试结果:** ☐ Pass / ☐ Fail

**测试证据:**
- 单元测试: `TC-03-013`
- 集成测试: `TC-03-INT-003`
- E2E 测试: `TC-03-E2E-003`

---

### AC5: 导出本体结构为标准格式（JSON/RDF/GraphML）

**Given** 用户完成本体编辑
**When** 用户选择导出本体
**Then** 可以导出为JSON、RDF或GraphML格式

**测试用例:** TC-03-009, TC-03-010, TC-03-011, TC-03-E2E-004

**测试结果:** ☐ Pass / ☐ Fail

**测试证据:**
- 单元测试: `TC-03-009, TC-03-010, TC-03-011`
- E2E 测试: `TC-03-E2E-004`

---

## 🚀 测试命令

### 运行所有测试

```bash
npm run test
```

### 运行单元测试

```bash
npm run test:unit
```

### 运行集成测试

```bash
npm run test:integration
```

### 运行 E2E 测试

```bash
npm run test:e2e
```

### 运行性能测试

```bash
npm run test:performance
```

### 生成覆盖率报告

```bash
npm run test:coverage
```

---

## 📌 相关文档

- [Story 1.3 README](./README-1.3.md)
- [测试模板](../../templates/story-spec-template/testing.md)
- [Story 1.1 测试用例](./test-cases-1.1-interview-start.md)
- [Story 1.2 测试用例](./test-cases-1.2-questions-collection.md)
