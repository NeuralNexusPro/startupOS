/**
 * Story C.5: Project Creation Service
 * Manages project creation session state and coordinates question flow
 *
 * @see docs/specs/epic-C/story-C.5/api-design.md
 */

import { randomUUID } from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import {
  ProjectCreationSession,
  Question,
  createProjectCreationSession,
  getQuestionForStep,
  ProjectCreationSessionSchema,
  StartProjectCreationRequest,
  SubmitAnswerRequest,
  CompleteCreationRequest,
  WORK_MODE_SYMBIOSIS_PRESETS,
  PRIORITY_TASTE_STANDARDS_PRESETS,
} from '../../../types/project-creation';
import { TASTEProfile, createTASTEProfile } from '../../../types/taste';
import { getDataRoot } from '../../paths';
import {
  type CanonicalOntology,
  type CanonicalSourceReference,
  validateCanonicalOntology,
} from '../ontology';
import {
  ProjectOntologyEntryService,
  ProjectOntologyInitializationError,
} from './project-ontology-entry-service';

// Data storage paths
const DATA_DIR = getDataRoot();

/**
 * Ensure directory exists
 */
async function ensureDir(dir: string): Promise<void> {
  try {
    await fs.mkdir(dir, { recursive: true });
  } catch (error) {
    // Directory already exists
  }
}

/**
 * Generate unique IDs
 */
function generateSessionId(): string {
  return `pc_${randomUUID()}`;
}

function generateProjectId(): string {
  return `proj_${randomUUID()}`;
}

/**
 * Project Creation Service
 */
export class ProjectCreationService {
  private sessionsDir: string;
  private readonly dataRoot: string;
  private readonly projectsDir: string;
  private readonly tasteProjectsDir: string;

  constructor(sessionsDir?: string, dataRoot = DATA_DIR) {
    this.dataRoot = dataRoot;
    this.sessionsDir = sessionsDir ?? path.join(dataRoot, 'sessions', 'project-creation');
    this.projectsDir = path.join(dataRoot, 'projects');
    this.tasteProjectsDir = path.join(dataRoot, 'taste', 'projects');
  }

  /**
   * Start a new project creation session
   */
  async startSession(request: StartProjectCreationRequest): Promise<{
    session: ProjectCreationSession;
    question: Question;
  }> {
    await ensureDir(this.sessionsDir);

    const sessionId = generateSessionId();
    const projectId = generateProjectId();

    const session = createProjectCreationSession({
      sessionId,
      projectId,
      userId: request.userId,
      projectName: request.projectName,
    });

    // Apply default values if provided
    if (request.defaultValues) {
      if (request.defaultValues.background) {
        session.data.background = request.defaultValues.background;
      }
      if (request.defaultValues.priorities && request.defaultValues.priorities.length > 0) {
        session.data.priorities = request.defaultValues.priorities;
      }
      if (request.defaultValues.workMode) {
        session.data.workMode = request.defaultValues.workMode;
      }
    }

    // Save session
    await this.saveSession(session);

    const question = getQuestionForStep(1);
    if (!question) {
      throw new Error('Failed to get first question');
    }

    return { session, question };
  }

  /**
   * Get session by ID
   */
  async getSession(sessionId: string): Promise<ProjectCreationSession | null> {
    try {
      const filePath = path.join(this.sessionsDir, `${sessionId}.json`);
      const data = await fs.readFile(filePath, 'utf-8');
      const parsed = JSON.parse(data);
      return ProjectCreationSessionSchema.parse(parsed);
    } catch (error) {
      return null;
    }
  }

  /**
   * Save session
   */
  async saveSession(session: ProjectCreationSession): Promise<void> {
    await ensureDir(this.sessionsDir);
    const filePath = path.join(this.sessionsDir, `${session.sessionId}.json`);
    session.updatedAt = new Date().toISOString();
    await fs.writeFile(filePath, JSON.stringify(session, null, 2));
  }

  /**
   * Get current question for session
   */
  getCurrentQuestion(session: ProjectCreationSession): Question | null {
    return getQuestionForStep(session.currentStep) ?? null;
  }

  /**
   * Submit answer for current step
   */
  async submitAnswer(
    sessionId: string,
    request: SubmitAnswerRequest
  ): Promise<{
    session: ProjectCreationSession;
    nextQuestion: Question | null;
  }> {
    const session = await this.getSession(sessionId);
    if (!session) {
      throw new Error('SESSION_NOT_FOUND');
    }

    if (session.status !== 'active') {
      throw new Error('SESSION_NOT_ACTIVE');
    }

    if (session.currentStep !== request.step) {
      throw new Error('INVALID_STEP');
    }

    // Update session data based on step
    await this.processAnswer(session, request);

    // Move to next step
    const nextStep = session.currentStep + 1;
    session.currentStep = Math.min(nextStep, session.maxSteps);

    await this.saveSession(session);

    const nextQuestion = this.getCurrentQuestion(session);

    return { session, nextQuestion };
  }

  /**
   * Process answer and extract TASTE data
   */
  private async processAnswer(
    session: ProjectCreationSession,
    request: SubmitAnswerRequest
  ): Promise<void> {
    const { step, answer } = request;

    switch (step) {
      case 1:
        // Step 1: Project Background -> Extract Experience Topology
        if (answer.type === 'text' && typeof answer.value === 'string') {
          session.data.background = answer.value;
          // Extract experience topology from background
          session.extractedData.experience_topology = this.extractExperienceTopology(answer.value);
          // Extract context features
          session.extractedData.context_features = this.extractContextFeatures(answer.value);
        }
        break;

      case 2:
        // Step 2: Priorities -> Extract Taste Standards + Tension Position
        if (answer.type === 'choice' && Array.isArray(answer.value)) {
          session.data.priorities = answer.value;
          if (answer.customDescription) {
            session.data.customDescriptions.priorities = answer.customDescription;
          }
          // Extract taste standards
          session.extractedData.taste_standards = this.extractTasteStandards(
            answer.value,
            answer.customDescription
          );
          // Extract tension position
          session.extractedData.tension_position = this.extractTensionPosition(
            answer.value,
            answer.customDescription
          );
        }
        break;

      case 3:
        // Step 3: Work Mode -> Extract Symbiosis Boundary
        if (answer.type === 'choice' && typeof answer.value === 'string') {
          session.data.workMode = answer.value as 'solo' | 'team' | 'product-owner' | 'custom';
          if (answer.customDescription) {
            session.data.customDescriptions.workMode = answer.customDescription;
          }
          // Extract symbiosis boundary
          session.extractedData.symbiosis_boundary = this.extractSymbiosisBoundary(
            answer.value,
            answer.customDescription
          );
        }
        break;
    }
  }

  /**
   * Complete project creation
   */
  async completeCreation(
    sessionId: string,
    request: CompleteCreationRequest
  ): Promise<{
    project: { id: string; name: string; createdAt: string; path: string };
    taste: TASTEProfile;
    ontology: { domains: number };
  }> {
    const session = await this.getSession(sessionId);
    if (!session) {
      throw new Error('SESSION_NOT_FOUND');
    }

    // Update session data with final confirm data
    session.data.name = request.projectName;
    if (request.confirmData.background) {
      session.data.background = request.confirmData.background;
    }
    if (request.confirmData.priorities) {
      session.data.priorities = request.confirmData.priorities;
    }
    if (request.confirmData.workMode) {
      session.data.workMode = request.confirmData.workMode as 'solo' | 'team' | 'product-owner' | 'custom';
    }

    // Generate project ID
    const projectId = session.projectId;
    const now = new Date().toISOString();

    const canonicalOntology = this.buildCanonicalOntology(session);
    const validation = validateCanonicalOntology(canonicalOntology);
    if (!validation.valid) {
      throw new ProjectOntologyInitializationError(validation.issues);
    }

    // 1. Create project file
    await ensureDir(this.projectsDir);
    const projectDir = path.join(this.projectsDir, projectId);
    await ensureDir(projectDir);

    const ontologyEntry = new ProjectOntologyEntryService(this.dataRoot);
    const canonicalSummary = await ontologyEntry.initializeCanonicalOntology(projectId, canonicalOntology);

    const project = {
      id: projectId,
      name: request.projectName,
      description: session.data.background ?? '',
      domain: session.extractedData.context_features?.domain ?? 'general',
      type: 'web-application',
      ontologyId: canonicalSummary.ontologyId,
      createdAt: now,
      updatedAt: now,
      lastModified: now,
      userId: session.userId,
      status: 'active',
      color: '#3B82F6', // Default blue
      metadata: {
        ontologyRef: {
          ontologyId: canonicalSummary.ontologyId,
          ontologyVersion: canonicalSummary.ontologyVersion,
        },
        workMode: session.data.workMode ?? undefined,
        priorities: session.data.priorities,
        techStack: session.extractedData.context_features?.tech_stack,
      },
    };

    await fs.writeFile(
      path.join(projectDir, 'project.json'),
      JSON.stringify(project, null, 2)
    );

    // 2. Generate Project TASTE
    const taste = this.generateProjectTASTE(session);
    await ensureDir(this.tasteProjectsDir);
    const tasteDir = path.join(this.tasteProjectsDir, projectId);
    await ensureDir(tasteDir);
    await fs.writeFile(
      path.join(tasteDir, 'profile.json'),
      JSON.stringify(taste, null, 2)
    );

    // 3. Update session status
    session.status = 'completed';
    session.completedAt = now;
    await this.saveSession(session);

    return {
      project: {
        id: projectId,
        name: request.projectName,
        createdAt: now,
        path: `/projects/${projectId}`,
      },
      taste,
      ontology: { domains: canonicalOntology.domains.length },
    };
  }

  /**
   * Extract experience topology from background text
   */
  private extractExperienceTopology(background: string): string[] {
    const keywords: string[] = [];

    // Tech stack detection
    const techPatterns = [
      { pattern: /react|next\.?js|vue|angular|svelte/i, value: 'web-development' },
      { pattern: /api|rest|graphql|backend/i, value: 'api-design' },
      { pattern: /typescript|javascript/i, value: 'javascript' },
      { pattern: /python|django|flask/i, value: 'python' },
      { pattern: /node\.?js|express/i, value: 'nodejs' },
      { pattern: /database|sql|mongodb|postgres/i, value: 'database' },
      { pattern: /docker|kubernetes|devops/i, value: 'devops' },
      { pattern: /mobile|ios|android|react native|flutter/i, value: 'mobile-development' },
      { pattern: /ai|machine learning|ml|llm/i, value: 'ai-ml' },
      { pattern: /ecommerce|e-commerce|电商/i, value: 'ecommerce' },
      { pattern: /inventory|库存/i, value: 'inventory-management' },
      { pattern: /crm|customer/i, value: 'crm' },
    ];

    for (const { pattern, value } of techPatterns) {
      if (pattern.test(background)) {
        keywords.push(value);
      }
    }

    // Default if nothing detected
    if (keywords.length === 0) {
      keywords.push('general-development');
    }

    return [...new Set(keywords)];
  }

  /**
   * Extract context features from background text
   */
  private extractContextFeatures(background: string): {
    domain: string;
    task_type: string;
    tech_stack: string[];
    discourse_system: 'technical' | 'business' | 'mixed';
  } {
    const techStack: string[] = [];

    // Detect tech stack
    const techPatterns = [
      { pattern: /react/i, value: 'React' },
      { pattern: /next\.?js/i, value: 'Next.js' },
      { pattern: /typescript/i, value: 'TypeScript' },
      { pattern: /javascript/i, value: 'JavaScript' },
      { pattern: /node\.?js/i, value: 'Node.js' },
      { pattern: /python/i, value: 'Python' },
      { pattern: /django/i, value: 'Django' },
      { pattern: /postgresql|postgres/i, value: 'PostgreSQL' },
      { pattern: /mongodb/i, value: 'MongoDB' },
    ];

    for (const { pattern, value } of techPatterns) {
      if (pattern.test(background)) {
        techStack.push(value);
      }
    }

    // Detect domain
    let domain = 'general';
    if (/ecommerce|电商|shop|store/i.test(background)) {
      domain = 'ecommerce';
    } else if (/inventory|库存/i.test(background)) {
      domain = 'inventory-management';
    } else if (/crm|customer/i.test(background)) {
      domain = 'crm';
    } else if (/analytics|分析/i.test(background)) {
      domain = 'analytics';
    }

    // Detect task type
    let taskType = 'general';
    if (/api|backend|服务/i.test(background)) {
      taskType = 'backend-integration';
    } else if (/frontend|ui|界面/i.test(background)) {
      taskType = 'frontend-development';
    } else if (/dashboard|仪表/i.test(background)) {
      taskType = 'dashboard';
    }

    // Detect discourse system
    let discourseSystem: 'technical' | 'business' | 'mixed' = 'mixed';
    const technicalTerms = /api|backend|frontend|database|algorithm/i.test(background);
    const businessTerms = /客户|用户|业务|流程|管理|效率/i.test(background);

    if (technicalTerms && !businessTerms) {
      discourseSystem = 'technical';
    } else if (businessTerms && !technicalTerms) {
      discourseSystem = 'business';
    }

    return {
      domain,
      task_type: taskType,
      tech_stack: techStack,
      discourse_system: discourseSystem,
    };
  }

  /**
   * Extract taste standards from priorities
   */
  private extractTasteStandards(
    priorities: string[],
    customDescription?: string
  ): Record<string, { positive_vibes: string[]; negative_vibes: string[] }> {
    const result: Record<string, { positive_vibes: string[]; negative_vibes: string[] }> = {};

    for (const priority of priorities) {
      const preset = PRIORITY_TASTE_STANDARDS_PRESETS[priority];
      if (preset) {
        result[priority] = preset;
      }
    }

    // If custom description provided, add generic entry
    if (customDescription) {
      result['custom'] = {
        positive_vibes: [customDescription.toLowerCase()],
        negative_vibes: ['opposite-of-' + customDescription.toLowerCase()],
      };
    }

    // Default if empty
    if (Object.keys(result).length === 0) {
      result['general'] = {
        positive_vibes: ['clean-code', 'documentation'],
        negative_vibes: ['complexity', 'spaghetti-code'],
      };
    }

    return result;
  }

  /**
   * Extract tension position from priorities
   */
  private extractTensionPosition(
    priorities: string[],
    _customDescription?: string
  ): { control_level: number; trust_level: number; intervention_threshold: number } {
    let controlLevel = 0.5;
    let trustLevel = 0.5;
    let interventionThreshold = 0.5;

    for (const priority of priorities) {
      switch (priority) {
        case 'velocity':
          controlLevel += 0.1;
          trustLevel += 0.15;
          interventionThreshold -= 0.15;
          break;
        case 'stability':
          controlLevel += 0.2;
          trustLevel -= 0.1;
          interventionThreshold += 0.2;
          break;
        case 'maintainability':
          controlLevel += 0.15;
          trustLevel += 0.05;
          interventionThreshold += 0.1;
          break;
      }
    }

    // Clamp values
    return {
      control_level: Math.max(0, Math.min(1, controlLevel)),
      trust_level: Math.max(0, Math.min(1, trustLevel)),
      intervention_threshold: Math.max(0, Math.min(1, interventionThreshold)),
    };
  }

  /**
   * Extract symbiosis boundary from work mode
   */
  private extractSymbiosisBoundary(
    workMode: string,
    _customDescription?: string
  ): {
    delegated_domains: string[];
    reserved_domains: string[];
    contextual_triggers: string[];
    control_level: number;
  } {
    // Use preset mapping
    const preset = WORK_MODE_SYMBIOSIS_PRESETS[workMode];
    if (preset) {
      return preset;
    }

    // Default for custom work mode
    return {
      delegated_domains: ['document-generation'],
      reserved_domains: ['architecture-decisions'],
      contextual_triggers: [],
      control_level: 0.5,
    };
  }

  /**
   * Generate Project TASTE from session data
   */
  private generateProjectTASTE(session: ProjectCreationSession): TASTEProfile {
    const now = new Date().toISOString();

    return createTASTEProfile({
      projectId: session.projectId,
      experience_topology: session.extractedData.experience_topology.length > 0
        ? session.extractedData.experience_topology
        : ['general-development'],
      taste_standards: Object.keys(session.extractedData.taste_standards).length > 0
        ? session.extractedData.taste_standards as Record<string, { positive_vibes: string[]; negative_vibes: string[] }>
        : { general: { positive_vibes: ['clean-code'], negative_vibes: ['complexity'] } },
      tension_position: session.extractedData.tension_position ?? {
        control_level: 0.5,
        trust_level: 0.5,
        intervention_threshold: 0.5,
      },
      symbiosis_boundary: session.extractedData.symbiosis_boundary ?? {
        delegated_domains: ['document-generation'],
        reserved_domains: ['architecture-decisions'],
        contextual_triggers: [],
      },
      metadata: {
        source: 'project',
        confidence: this.calculateConfidence(session),
        evolution_count: 0,
        derived_from_session: session.sessionId,
        last_analysis_at: now,
      },
    });
  }

  /**
   * Calculate confidence based on data completeness
   */
  private calculateConfidence(session: ProjectCreationSession): number {
    let score = 0;

    if (session.data.background) score += 0.25;
    if (session.data.priorities.length > 0) score += 0.25;
    if (session.data.workMode) score += 0.25;
    if (session.data.name) score += 0.25;

    return score;
  }

  /**
   * Build initial Ontology from session data
   */
  private buildCanonicalOntology(session: ProjectCreationSession): CanonicalOntology {
    const now = new Date();
    const sourceRef: CanonicalSourceReference = {
      sourceType: 'interview',
      sourceId: session.sessionId,
      sourceVersion: '1.0.0',
    };
    const domains: CanonicalOntology['domains'] = [];

    // Extract domains from experience topology
    const topology = session.extractedData.experience_topology;
    for (let i = 0; i < topology.length; i++) {
      domains.push({
        id: `domain_${i}`,
        name: topology[i] ?? '',
        description: `${topology[i]} domain`,
        createdAt: now,
        updatedAt: now,
      });
    }

    // Add domain from context features if available
    if (session.extractedData.context_features?.domain) {
      domains.push({
        id: `domain_${domains.length}`,
        name: session.extractedData.context_features.domain,
        description: `Primary project domain: ${session.extractedData.context_features.domain}`,
        createdAt: now,
        updatedAt: now,
      });
    }

    // Default domain if empty
    if (domains.length === 0) {
      domains.push({
        id: 'domain_0',
        name: 'general',
        description: 'General project domain',
        createdAt: now,
        updatedAt: now,
      });
    }

    // Generate concepts from domain
    const concepts: CanonicalOntology['concepts'] = [];
    domains.forEach((domain, idx) => {
      concepts.push({
        id: `concept_${idx}_main`,
        domainId: domain.id,
        name: `${domain.name} concept`,
        type: 'entity',
        attributes: {},
        sourceRefs: [sourceRef],
        createdAt: now,
        updatedAt: now,
      });
    });

    // Generate simple relations
    const relations: CanonicalOntology['relations'] = [];
    for (let i = 0; i < concepts.length - 1; i++) {
      relations.push({
        id: `rel_${i}`,
        name: 'related_to',
        sourceConceptId: concepts[i]!.id,
        targetConceptId: concepts[i + 1]!.id,
        cardinality: 'many-to-many',
      });
    }

    return {
      id: `ontology_${session.projectId}`,
      name: session.data.name || '项目本体',
      schemaVersion: '1.0.0',
      version: '1.0.0',
      projectId: session.projectId,
      domains,
      concepts,
      instances: [],
      properties: [],
      relations,
      businessStates: [],
      transitions: [],
      factTypes: [],
      rules: [],
      actions: [],
      events: [],
      projections: [],
      sourceRefs: [sourceRef],
      metadata: {
        derived_from_session: session.sessionId,
        generated_at: now.toISOString(),
        confidence: domains.length > 0 ? 0.7 : 0.5,
      },
      createdAt: now,
      updatedAt: now,
    };
  }

  /**
   * Get session status
   */
  async getSessionStatus(sessionId: string): Promise<{
    session: ProjectCreationSession;
    canResume: boolean;
  }> {
    const session = await this.getSession(sessionId);
    if (!session) {
      throw new Error('SESSION_NOT_FOUND');
    }

    // Check if expired
    const now = new Date();
    const expiresAt = new Date(session.expiresAt);
    if (now > expiresAt) {
      session.status = 'expired';
      await this.saveSession(session);
    }

    const canResume = session.status === 'active' && now <= expiresAt;

    return { session, canResume };
  }

  /**
   * Delete expired sessions
   */
  async cleanupExpiredSessions(): Promise<number> {
    try {
      const files = await fs.readdir(this.sessionsDir);
      const now = new Date();
      let deletedCount = 0;

      for (const file of files) {
        if (!file.endsWith('.json')) continue;

        const filePath = path.join(this.sessionsDir, file);
        const data = JSON.parse(await fs.readFile(filePath, 'utf-8'));
        const expiresAt = new Date(data.expiresAt);

        if (now > expiresAt) {
          await fs.unlink(filePath);
          deletedCount++;
        }
      }

      return deletedCount;
    } catch (error) {
      return 0;
    }
  }
}

// Export singleton instance
export const projectCreationService = new ProjectCreationService();
