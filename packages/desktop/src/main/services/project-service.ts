import fs from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';

import { ipcMain, BrowserWindow } from 'electron';

import { IPC_CHANNELS } from '../ipc-protocol';
import type { IpcResponse } from '../../../../core/src/lib/integrations/electron/ipc-protocol';
import type {
  Project,
  ProjectListItem,
  CreateProjectRequest,
  UpdateProjectRequest,
  ProjectQuery,
} from '../../../../core/src/types/project';
import type {
  CompleteCreationRequest,
  CompleteCreationResponse,
  StartProjectCreationRequest,
  StartProjectCreationResponse,
  SubmitAnswerRequest,
  SubmitAnswerResponse,
} from '../../../../core/src/types/project-creation';
import { calculateProgress } from '../../../../core/src/types/project-creation';
import { projectService } from '../../../../core/src/lib/features/services/project-service-real';
import { projectCreationService } from '../../../../core/src/lib/features/project/project-creation-service';
import { getDataRoot, getTemplatesDir } from '../../../../core/src/lib/paths';
import {
  PROJECT_DEFAULT_SKILLS,
  provisionProjectSkill,
  provisionProjectSkills,
} from '../../../../core/src/lib/integrations/pi-agent/project-agent/project-skill-provisioning';
import { launch } from '../../../../core/src/lib/features/services/launcher/registry';

interface BusinessModelEntity {
  name?: string;
  label?: string;
  definition?: string;
  description?: string;
  properties?: Record<string, unknown>;
}

interface BusinessModelRelationship {
  from?: string;
  to?: string;
  type?: string;
  cardinality?: string;
}

interface BusinessModel {
  projectName?: string;
  background?: string;
  description?: string;
  entities?: Array<string | BusinessModelEntity>;
  relationships?: Array<string | BusinessModelRelationship>;
}

interface SyncedOntologyResult {
  ontologyId: string;
  ontologyPath: string;
  conceptsCount: number;
  relationsCount: number;
}

function inferFieldType(value: unknown): string {
  if (typeof value === 'string') return 'string';
  if (typeof value === 'number') return 'number';
  if (typeof value === 'boolean') return 'boolean';
  if (Array.isArray(value)) return 'array';
  if (typeof value === 'object' && value !== null) return 'object';
  return 'string';
}

export class ProjectService {
  constructor() {
    this.registerHandlers();
  }

  private broadcastProjectUpdated(projectId: string, project: Project): void {
    const payload = {
      type: 'project_updated',
      projectId,
      project,
    };

    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed()) {
        window.webContents.send(IPC_CHANNELS.PROJECT_EVENT, payload);
      }
    }
  }

  private async copySkillDirectory(projectDir: string, skillName: string): Promise<'created' | 'updated' | 'existing' | 'missing'> {
    return (await provisionProjectSkill(projectDir, skillName)).status;
  }

  private async initializeProjectWorkspace(projectId: string): Promise<string[]> {
    const projectDir = path.join(getDataRoot(), 'projects', projectId);
    const templateDir = getTemplatesDir();
    const createdFiles: string[] = [];

    await fs.mkdir(projectDir, { recursive: true });

    const templateFiles = ['Agent.md', 'Tool.md', 'Taste.md', 'MEMORY.md', 'Knowledge.md', 'Patterns.md'];
    for (const fileName of templateFiles) {
      const targetPath = path.join(projectDir, fileName);
      if (existsSync(targetPath)) {
        createdFiles.push(`${fileName} (existing)`);
        continue;
      }

      const templatePath = path.join(templateDir, fileName);
      if (!existsSync(templatePath)) {
        continue;
      }

      await fs.copyFile(templatePath, targetPath);
      createdFiles.push(`${fileName} (created)`);
    }

    for (const dirName of ['output', 'sessions', 'skills']) {
      await fs.mkdir(path.join(projectDir, dirName), { recursive: true });
      createdFiles.push(`${dirName}/ (created)`);
    }

    const skillResults = await provisionProjectSkills(projectDir, PROJECT_DEFAULT_SKILLS);
    const missingSkills = skillResults.filter((result) => result.status === 'missing');
    if (missingSkills.length > 0) {
      throw new Error(`Bundled project skills not found: ${missingSkills.map((result) => result.skillName).join(', ')}`);
    }
    for (const result of skillResults) {
      createdFiles.push(`skills/${result.skillName}/SKILL.md (${result.status})`);
    }

    return createdFiles;
  }

  private async syncBusinessModelToOntology(projectId: string): Promise<SyncedOntologyResult> {
    const projectDir = path.join(getDataRoot(), 'projects', projectId);
    const businessModelPath = path.join(projectDir, 'output', 'business-model.json');
    if (!existsSync(businessModelPath)) {
      throw new Error(`business-model.json not found for project ${projectId}`);
    }

    const content = await fs.readFile(businessModelPath, 'utf-8');
    const businessModel = JSON.parse(content) as BusinessModel;
    const ontologyId = `ontology-${projectId}`;
    const domainId = 'domain_main';
    const now = new Date().toISOString();

    const concepts: Array<{
      id: string;
      domainId: string;
      name: string;
      type: string;
      description?: string;
      attributes?: Record<string, { type: string; required?: boolean; description?: string }>;
    }> = [];
    const nameToConceptId = new Map<string, string>();

    if (Array.isArray(businessModel.entities)) {
      for (let i = 0; i < businessModel.entities.length; i++) {
        const entity = businessModel.entities[i];
        const conceptId = `concept_${i}`;
        if (typeof entity === 'string') {
          concepts.push({ id: conceptId, domainId, name: entity, type: 'entity', description: '' });
          nameToConceptId.set(entity, conceptId);
          continue;
        }

        const name = entity?.name || entity?.label || `实体${i}`;
        const attributes: Record<string, { type: string; required?: boolean; description?: string }> = {};
        if (entity?.properties && typeof entity.properties === 'object') {
          for (const [key, value] of Object.entries(entity.properties)) {
            attributes[key] = {
              type: inferFieldType(value),
              description: typeof value === 'string' ? value : undefined,
            };
          }
        }

        concepts.push({
          id: conceptId,
          domainId,
          name,
          type: 'entity',
          description: entity?.definition || entity?.description || '',
          attributes: Object.keys(attributes).length > 0 ? attributes : undefined,
        });
        nameToConceptId.set(name, conceptId);
        if (entity?.name) nameToConceptId.set(entity.name, conceptId);
        if (entity?.label) nameToConceptId.set(entity.label, conceptId);
      }
    }

    const relations: Array<{ id: string; sourceId: string; targetId: string; type: string; cardinality: string }> = [];
    if (Array.isArray(businessModel.relationships)) {
      for (let i = 0; i < businessModel.relationships.length; i++) {
        const relationship = businessModel.relationships[i];
        let from: string | undefined;
        let to: string | undefined;
        let relationType = 'related_to';
        let cardinality = 'N:M';

        if (typeof relationship === 'string') {
          const parts = relationship.split('→').map((part) => part.trim()).filter(Boolean);
          from = parts[0];
          to = parts[1];
        } else {
          from = relationship?.from;
          to = relationship?.to;
          relationType = relationship?.type || relationType;
          cardinality = relationship?.cardinality || cardinality;
        }

        const sourceId = from ? nameToConceptId.get(from) : undefined;
        const targetId = to ? nameToConceptId.get(to) : undefined;
        if (sourceId && targetId) {
          relations.push({
            id: `rel_${i}`,
            sourceId,
            targetId,
            type: relationType,
            cardinality,
          });
        }
      }
    }

    const ontologyDir = path.join(projectDir, 'ontology');
    await fs.mkdir(ontologyDir, { recursive: true });

    const ontologyPath = path.join(ontologyDir, 'ontology.json');
    const ontologyData = {
      version: '1.0.0',
      projectId,
      ontologyId,
      domains: [{
        id: domainId,
        name: businessModel.projectName || '主域',
        description: businessModel.background || businessModel.description || '',
        confidence: 0.8,
      }],
      concepts,
      instances: [],
      relations,
      metadata: {
        synced_from: 'business-model.json',
        synced_at: now,
        runtime: 'electron-ipc',
      },
      createdAt: now,
      updatedAt: now,
    };

    await fs.writeFile(ontologyPath, JSON.stringify(ontologyData, null, 2), 'utf-8');

    for (const concept of concepts) {
      const conceptDataDir = path.join(ontologyDir, 'data', domainId, concept.id);
      await fs.mkdir(conceptDataDir, { recursive: true });
      const indexPath = path.join(conceptDataDir, '_index.json');
      if (!existsSync(indexPath)) {
        await fs.writeFile(indexPath, JSON.stringify({ instanceIds: [] }, null, 2), 'utf-8');
      }
    }

    const instanceRelationsPath = path.join(ontologyDir, 'instance-relations.json');
    if (!existsSync(instanceRelationsPath)) {
      await fs.writeFile(instanceRelationsPath, JSON.stringify({ relations: [] }, null, 2), 'utf-8');
    }

    return {
      ontologyId,
      ontologyPath,
      conceptsCount: concepts.length,
      relationsCount: relations.length,
    };
  }

  private registerHandlers(): void {
    ipcMain.handle(
      IPC_CHANNELS.PROJECT_LIST,
      async (_event, query: ProjectQuery = {}): Promise<IpcResponse<ProjectListItem[]>> => {
        try {
          const projects = await projectService.listProjects(query);
          return {
            success: true,
            data: projects,
            timestamp: new Date().toISOString(),
          };
        } catch (error) {
          return this.toErrorResponse(error, '[ProjectService] List projects failed');
        }
      }
    );

    ipcMain.handle(
      IPC_CHANNELS.PROJECT_GET,
      async (_event, projectId: string): Promise<IpcResponse<Project | null>> => {
        try {
          const project = await projectService.getProject(projectId);
          if (!project) {
            return {
              success: false,
              error: { code: 'NOT_FOUND', message: 'Project not found' },
              timestamp: new Date().toISOString(),
            };
          }
          return {
            success: true,
            data: project,
            timestamp: new Date().toISOString(),
          };
        } catch (error) {
          return this.toErrorResponse(error, '[ProjectService] Get project failed');
        }
      }
    );

    ipcMain.handle(
      IPC_CHANNELS.PROJECT_CREATE,
      async (_event, request: CreateProjectRequest): Promise<IpcResponse<Project>> => {
        try {
          if (!request.name || typeof request.name !== 'string' || request.name.trim().length === 0) {
            return {
              success: false,
              error: { code: 'INVALID_REQUEST', message: 'Project name is required' },
              timestamp: new Date().toISOString(),
            };
          }
          if (!request.domain || typeof request.domain !== 'string') {
            return {
              success: false,
              error: { code: 'INVALID_REQUEST', message: 'Project domain is required' },
              timestamp: new Date().toISOString(),
            };
          }

          const project = await projectService.createProject(request);
          return {
            success: true,
            data: project,
            timestamp: new Date().toISOString(),
          };
        } catch (error) {
          return this.toErrorResponse(error, '[ProjectService] Create project failed');
        }
      }
    );

    ipcMain.handle(
      IPC_CHANNELS.PROJECT_UPDATE,
      async (_event, projectId: string, updates: UpdateProjectRequest): Promise<IpcResponse<Project | null>> => {
        try {
          const project = await projectService.updateProject(projectId, updates);
          if (!project) {
            return {
              success: false,
              error: { code: 'NOT_FOUND', message: 'Project not found' },
              timestamp: new Date().toISOString(),
            };
          }
          this.broadcastProjectUpdated(projectId, project);
          return {
            success: true,
            data: project,
            timestamp: new Date().toISOString(),
          };
        } catch (error) {
          return this.toErrorResponse(error, '[ProjectService] Update project failed');
        }
      }
    );

    ipcMain.handle(
      IPC_CHANNELS.PROJECT_DELETE,
      async (_event, projectId: string): Promise<IpcResponse<{ deleted: true }>> => {
        try {
          const deleted = await projectService.deleteProject(projectId);
          if (!deleted) {
            return {
              success: false,
              error: { code: 'NOT_FOUND', message: 'Project not found' },
              timestamp: new Date().toISOString(),
            };
          }
          return {
            success: true,
            data: { deleted: true },
            timestamp: new Date().toISOString(),
          };
        } catch (error) {
          return this.toErrorResponse(error, '[ProjectService] Delete project failed');
        }
      }
    );

    ipcMain.handle(
      IPC_CHANNELS.PROJECT_ARTIFACT_GET,
      async (_event, request: { projectId: string; artifactType: string }): Promise<IpcResponse<unknown>> => {
        try {
          const { readFileSync, existsSync } = require('fs');
          const { join } = require('path');
          const baseDir = join(getDataRoot(), 'projects', request.projectId, 'output');
          const fileMap: Record<string, string> = {
            'business-model': 'business-model.json',
            'interview-markdown': 'interview-progress.md',
          };
          const filename = fileMap[request.artifactType] || `${request.artifactType}.json`;
          const filePath = join(baseDir, filename);
          console.log('[ProjectService] artifact:get request', {
            projectId: request.projectId,
            artifactType: request.artifactType,
            baseDir,
            filePath,
            exists: existsSync(filePath),
          });
          if (!existsSync(filePath)) {
            return {
              success: false,
              error: { code: 'NOT_FOUND', message: `Artifact not found: ${request.artifactType}` },
              timestamp: new Date().toISOString(),
            };
          }
          const content = readFileSync(filePath, 'utf-8');
          const data = request.artifactType === 'interview-markdown'
            ? { content }
            : JSON.parse(content);
          console.log('[ProjectService] artifact:get result', {
            projectId: request.projectId,
            artifactType: request.artifactType,
            bytes: content.length,
            hasData: Boolean(data),
          });
          return {
            success: true,
            data,
            timestamp: new Date().toISOString(),
          };
        } catch (error) {
          return this.toErrorResponse(error, '[ProjectService] Get artifact failed');
        }
      }
    );

    ipcMain.handle(
      IPC_CHANNELS.PROJECT_INITIALIZE,
      async (_event, request: { projectId: string }): Promise<IpcResponse<unknown>> => {
        try {
          const files = await this.initializeProjectWorkspace(request.projectId);
          return {
            success: true,
            data: {
              initialized: true,
              projectId: request.projectId,
              files,
            },
            timestamp: new Date().toISOString(),
          };
        } catch (error) {
          return this.toErrorResponse(error, '[ProjectService] Initialize project failed');
        }
      }
    );

    ipcMain.handle(
      IPC_CHANNELS.PROJECT_SYNC_ONTOLOGY,
      async (_event, request: { projectId: string }): Promise<IpcResponse<SyncedOntologyResult>> => {
        try {
          const result = await this.syncBusinessModelToOntology(request.projectId);
          const project = await projectService.updateProject(request.projectId, {
            ontologyId: result.ontologyId,
          });
          if (project) {
            this.broadcastProjectUpdated(request.projectId, project);
          }
          console.log('[ProjectService] sync ontology completed', {
            projectId: request.projectId,
            ...result,
          });
          return {
            success: true,
            data: result,
            timestamp: new Date().toISOString(),
          };
        } catch (error) {
          return this.toErrorResponse(error, '[ProjectService] Sync ontology failed');
        }
      }
    );

    ipcMain.handle(
      IPC_CHANNELS.PROJECT_SOLUTION_INITIALIZE,
      async (_event, request: { projectId: string }): Promise<IpcResponse<unknown>> => {
        try {
          const projectId = request.projectId;
          const projectDir = path.join(getDataRoot(), 'projects', projectId);
          if (!existsSync(projectDir)) {
            return {
              success: false,
              error: { code: 'NOT_FOUND', message: `Project ${projectId} not found` },
              timestamp: new Date().toISOString(),
            };
          }

          // Copy skills to project directory (same as web API route)
          const copySkill = async (name: string) => {
            await this.copySkillDirectory(projectDir, name);
          };

          await copySkill('solution-design');
          await copySkill('project-skill-creator');
          await copySkill('role-agent-creator');
          await copySkill('agent-creator');

          // Create solutions/ directory
          await fs.mkdir(path.join(projectDir, 'solutions'), { recursive: true });

          // Launch via SkillLauncher
          const result = await launch({
            entryType: 'skill',
            entryId: 'solution-design',
            agentBaseDir: projectDir,
            projectId,
          });

          if (!result.success) {
            return {
              success: false,
              error: { code: 'LAUNCH_FAILED', message: result.error || 'Failed to launch skill' },
              timestamp: new Date().toISOString(),
            };
          }

          return {
            success: true,
            data: { sessionId: result.sessionId, projectDir },
            timestamp: new Date().toISOString(),
          };
        } catch (error) {
          return this.toErrorResponse(error, '[ProjectService] Initialize solution failed');
        }
      }
    );

    ipcMain.handle(
      IPC_CHANNELS.PROJECT_SOLUTION_LIST,
      async (_event, request: { projectId: string }): Promise<IpcResponse<unknown>> => {
        try {
          const solutionsDir = path.join(getDataRoot(), 'projects', request.projectId, 'solutions');

          if (!existsSync(solutionsDir)) {
            return { success: true, data: [], timestamp: new Date().toISOString() };
          }

          const entries = await fs.readdir(solutionsDir, { withFileTypes: true });
          const solutions: Array<{
            id: string;
            projectId: string;
            name: string;
            version: string;
            status: string;
            modelingDimension: string;
            agentCount: number;
            createdAt: number;
            updatedAt: number;
          }> = [];

          // Scan version folders (new format)
          for (const entry of entries) {
            if (!entry.isDirectory()) continue;

            const versionDir = path.join(solutionsDir, entry.name);
            const manifestPath = path.join(versionDir, 'manifest.json');
            const agentsPath = path.join(versionDir, 'agents.json');

            if (!existsSync(manifestPath)) continue;

            try {
              const manifestContent = await fs.readFile(manifestPath, 'utf-8');
              const manifest = JSON.parse(manifestContent);

              let agentCount = 0;
              if (existsSync(agentsPath)) {
                const agentsContent = await fs.readFile(agentsPath, 'utf-8');
                const agentsData = JSON.parse(agentsContent);
                agentCount = Array.isArray(agentsData?.agents) ? agentsData.agents.length : 0;
              }

              const version = manifest.solutionVersion || entry.name;
              const modelDim = manifest.modeling?.dimension || 'task';

              solutions.push({
                id: version,
                projectId: request.projectId,
                name: `方案 ${version}`,
                version,
                status: manifest.status || 'draft',
                modelingDimension: modelDim,
                agentCount,
                createdAt: manifest.createdAt ? new Date(manifest.createdAt).getTime() : 0,
                updatedAt: manifest.updatedAt ? new Date(manifest.updatedAt).getTime() : 0,
              });
            } catch {
              // Skip malformed
            }
          }

          // Also scan legacy single-file format
          for (const entry of entries) {
            if (!entry.isFile() || !entry.name.startsWith('solution-v') || !entry.name.endsWith('.json')) continue;
            if (entry.name.includes('-manifest') || entry.name.includes('-incomplete') || entry.name.includes('-dataflow')) continue;

            const versionMatch = entry.name.match(/solution-(v[\d.]+)\.json/);
            if (!versionMatch) continue;
            const version = versionMatch[1]!;

            // Skip if already migrated (folder exists)
            if (solutions.some((s) => s.version === version)) continue;

            try {
              const content = await fs.readFile(path.join(solutionsDir, entry.name), 'utf-8');
              const raw = JSON.parse(content);
              const data = raw.data || raw;
              const agents = data.agents || [];

              solutions.push({
                id: version,
                projectId: request.projectId,
                name: `方案 ${version}`,
                version,
                status: data.status || 'draft',
                modelingDimension: data.modeling?.dimension || data.modelingDimension || 'task',
                agentCount: Array.isArray(agents) ? agents.length : 0,
                createdAt: data.createdAt ?? 0,
                updatedAt: data.updatedAt ?? 0,
              });
            } catch {
              // Skip malformed
            }
          }

          solutions.sort((a, b) => b.createdAt - a.createdAt);

          return {
            success: true,
            data: solutions,
            timestamp: new Date().toISOString(),
          };
        } catch (error) {
          return this.toErrorResponse(error, '[ProjectService] List solutions failed');
        }
      }
    );

    ipcMain.handle(
      IPC_CHANNELS.PROJECT_SOLUTION_GET,
      async (_event, request: { projectId: string; version: string }): Promise<IpcResponse<unknown>> => {
        try {
          const solutionsDir = path.join(getDataRoot(), 'projects', request.projectId, 'solutions');

          // Try new folder format first
          const versionDir = path.join(solutionsDir, request.version);
          const manifestPath = path.join(versionDir, 'manifest.json');
          const agentsPath = path.join(versionDir, 'agents.json');
          const skillsPath = path.join(versionDir, 'skills.json');

          if (existsSync(manifestPath)) {
            const [manifest, agentsData, skillsData] = await Promise.all([
              fs.readFile(manifestPath, 'utf-8').then((c) => JSON.parse(c)),
              existsSync(agentsPath)
                ? fs.readFile(agentsPath, 'utf-8').then((c) => JSON.parse(c)).then((d) => d.agents || [])
                : Promise.resolve([]),
              existsSync(skillsPath)
                ? fs.readFile(skillsPath, 'utf-8').then((c) => JSON.parse(c)).then((d) => d.skills || [])
                : Promise.resolve([]),
            ]);

            return {
              success: true,
              data: {
                manifest,
                agents: agentsData,
                skills: skillsData,
                solutionVersion: request.version,
              },
              timestamp: new Date().toISOString(),
            };
          }

          // Fallback: legacy single-file format
          const legacyFile = path.join(solutionsDir, `solution-${request.version}.json`);
          if (existsSync(legacyFile)) {
            const content = await fs.readFile(legacyFile, 'utf-8');
            const raw = JSON.parse(content);
            const data = raw.data || raw;

            return {
              success: true,
              data: {
                manifest: {
                  status: data.status,
                  solutionVersion: data.solutionVersion || request.version,
                  modeling: data.modeling,
                  executionMode: data.executionMode,
                  changesFromPrevious: data.changesFromPrevious,
                },
                agents: data.agents || [],
                skills: Array.isArray(data.skills) ? data.skills : [],
                solutionVersion: request.version,
              },
              timestamp: new Date().toISOString(),
            };
          }

          return {
            success: false,
            error: { code: 'NOT_FOUND', message: `Solution not found: ${request.version}` },
            timestamp: new Date().toISOString(),
          };
        } catch (error) {
          return this.toErrorResponse(error, '[ProjectService] Get solution failed');
        }
      }
    );

    ipcMain.handle(
      IPC_CHANNELS.PROJECT_EXPORT,
      async (_event, request: { projectId: string }): Promise<IpcResponse<unknown>> => {
        try {
          const project = await projectService.getProject(request.projectId);
          if (!project) {
            return {
              success: false,
              error: { code: 'NOT_FOUND', message: 'Project not found' },
              timestamp: new Date().toISOString(),
            };
          }
          return {
            success: true,
            data: JSON.stringify(project, null, 2),
            timestamp: new Date().toISOString(),
          };
        } catch (error) {
          return this.toErrorResponse(error, '[ProjectService] Export project failed');
        }
      }
    );

    ipcMain.handle(
      IPC_CHANNELS.PROJECT_IMPORT,
      async (_event, request: { exportJson: string; overwrite?: boolean; newId?: boolean }): Promise<IpcResponse<Project>> => {
        try {
          if (!request.exportJson || typeof request.exportJson !== 'string') {
            return {
              success: false,
              error: { code: 'INVALID_REQUEST', message: 'exportJson is required' },
              timestamp: new Date().toISOString(),
            };
          }
          const project = await projectService.importProject(request.exportJson, {
            overwrite: request.overwrite || false,
            newId: request.newId || false,
          });
          return {
            success: true,
            data: project,
            timestamp: new Date().toISOString(),
          };
        } catch (error) {
          return this.toErrorResponse(error, '[ProjectService] Import project failed');
        }
      }
    );

    ipcMain.handle(
      IPC_CHANNELS.PROJECT_CREATION_START,
      async (_event, request: StartProjectCreationRequest): Promise<IpcResponse<StartProjectCreationResponse>> => {
        try {
          const { session, question } = await projectCreationService.startSession(request);
          return {
            success: true,
            data: {
              sessionId: session.sessionId,
              projectId: session.projectId,
              currentStep: 1,
              question,
              progress: {
                current: session.currentStep,
                total: session.maxSteps,
                percentage: 25,
              },
            },
            timestamp: new Date().toISOString(),
          };
        } catch (error) {
          return this.toErrorResponse(error, '[ProjectService] Start project creation failed');
        }
      }
    );

    ipcMain.handle(
      IPC_CHANNELS.PROJECT_CREATION_ANSWER,
      async (_event, request: SubmitAnswerRequest): Promise<IpcResponse<SubmitAnswerResponse>> => {
        try {
          const { session, nextQuestion } = await projectCreationService.submitAnswer(
            request.sessionId,
            request
          );
          return {
            success: true,
            data: {
              sessionId: session.sessionId,
              step: request.step,
              saved: true,
              nextStep: session.currentStep > request.step ? session.currentStep : null,
              nextQuestion: nextQuestion ?? undefined,
              progress: {
                current: session.currentStep,
                total: session.maxSteps,
                percentage: calculateProgress(session.currentStep, session.maxSteps),
              },
            },
            timestamp: new Date().toISOString(),
          };
        } catch (error) {
          return this.toErrorResponse(error, '[ProjectService] Submit project creation answer failed');
        }
      }
    );

    ipcMain.handle(
      IPC_CHANNELS.PROJECT_CREATION_COMPLETE,
      async (_event, request: CompleteCreationRequest): Promise<IpcResponse<CompleteCreationResponse>> => {
        try {
          const result = await projectCreationService.completeCreation(
            request.sessionId,
            request
          );
          return {
            success: true,
            data: {
              success: true,
              project: result.project,
              taste: {
                generated: true,
                confidence: result.taste.metadata.confidence,
              },
              ontology: {
                generated: true,
                domainCount: result.ontology.domains,
              },
            },
            timestamp: new Date().toISOString(),
          };
        } catch (error) {
          return this.toErrorResponse(error, '[ProjectService] Complete project creation failed');
        }
      }
    );
  }

  private toErrorResponse<T>(error: unknown, logMessage: string): IpcResponse<T> {
    console.error(logMessage, error);
    return {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      timestamp: new Date().toISOString(),
    };
  }
}
