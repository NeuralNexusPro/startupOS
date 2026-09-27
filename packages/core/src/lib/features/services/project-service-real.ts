/**
 * Project Service - real implementation for server-side
 *
 * Provides CRUD operations for projects using file system storage
 */

import { mkdir, readFile, writeFile, readdir, unlink, rm, copyFile, access } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { getTemplatesDir, getDataRoot } from '../../paths';

const TEMPLATES_DIR = getTemplatesDir();
import type {
  Project,
  ProjectListItem,
  ProjectMetadata,
  CreateProjectRequest,
  UpdateProjectRequest,
  ProjectQuery,
} from '../../../types/project';
import { CanonicalOntologyStore } from '../ontology';

// ============================================================================
// Configuration
// ============================================================================

const DATA_DIR = path.join(getDataRoot(), 'projects');
const FILES_DIR = 'files';
const canonicalOntologyStore = new CanonicalOntologyStore(getDataRoot());

// ============================================================================
// Helpers
// ============================================================================

async function ensureDataDir() {
  if (!existsSync(DATA_DIR)) {
    await mkdir(DATA_DIR, { recursive: true });
  }
}

function getProjectPath(projectId: string): string {
  return path.join(DATA_DIR, `${projectId}.json`);
}

function getProjectDirPath(projectId: string): string {
  return path.join(DATA_DIR, projectId, 'project.json');
}

function getProjectFilesPath(projectId: string): string {
  return path.join(DATA_DIR, projectId, FILES_DIR);
}

function generateProjectId(): string {
  return `proj-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

function generateRandomColor(): string {
  const colors = [
    'from-blue-500', 'from-purple-500', 'from-green-500',
    'from-yellow-500', 'from-pink-500', 'from-indigo-500',
    'from-red-500', 'from-orange-500',
  ];
  return colors[Math.floor(Math.random() * colors.length)] as string;
}

function ontologyRefFromProject(project: Project): { ontologyId: string; ontologyVersion: string } | null {
  const ref = project.metadata?.ontologyRef;
  if (!ref || typeof ref !== 'object') return null;
  if (typeof ref.ontologyId !== 'string' || typeof ref.ontologyVersion !== 'string') return null;
  return ref;
}

async function canonicalOntologySize(project: Project): Promise<number> {
  const ref = ontologyRefFromProject(project);
  if (!ref) return 0;
  const stored = await canonicalOntologyStore.readOntology(project.id);
  if (!stored || stored.data.id !== ref.ontologyId || stored.data.version !== ref.ontologyVersion) return 0;
  return stored.data.concepts.length;
}

// ============================================================================
// Project Service
// ============================================================================

export const projectService = {
  /**
   * Create a new project
   */
  async createProject(request: CreateProjectRequest): Promise<Project> {
    await ensureDataDir();

    const projectId = generateProjectId();
    const now = Date.now();

    const project: Project = {
      id: projectId,
      name: request.name,
      description: request.description || '',
      domain: request.domain,
      type: request.type || 'generic',
      ontologyId: request.ontologyId ?? '',
      createdAt: now,
      updatedAt: now,
      lastModified: now,
      userId: request.userId || 'current-user',
      status: request.status || 'active',
      color: request.color || generateRandomColor(),
      icon: request.icon,
      metadata: (request.metadata || {}) as ProjectMetadata,
    };

    // Create standard project directory structure
    const projectDir = path.join(DATA_DIR, projectId);
    await mkdir(projectDir, { recursive: true });

    // Create subdirectories following architecture standards
    const subdirs = [
      'reference',      // 参考文件和知识库
      'skills',         // 项目技能
      'output',         // Agent 输出文件
      'output/documents',
      'output/diagrams',
      'output/code',
      'sessions',       // 会话历史
      'files',          // 用户上传的文件
    ];

    for (const subdir of subdirs) {
      await mkdir(path.join(projectDir, subdir), { recursive: true });
    }

    // Save project data to project.json in project directory
    await writeFile(
      path.join(projectDir, 'project.json'),
      JSON.stringify(project, null, 2),
      'utf-8'
    );

    // Copy Agent.md, Tool.md, MEMORY.md, and taste.md from templates (only if templates exist)
    for (const templateFile of ['Agent.md', 'Tool.md', 'MEMORY.md', 'taste.md']) {
      const src = path.join(TEMPLATES_DIR, templateFile);
      const dest = path.join(projectDir, templateFile);
      try {
        await access(src);
        await copyFile(src, dest);
      } catch {
        // Template doesn't exist, skip
      }
    }

    return project;
  },

  /**
   * Get a project by ID
   */
  async getProject(projectId: string): Promise<Project | null> {
    // Check flat file first, then subdirectory layout
    const flatPath = getProjectPath(projectId);
    const dirPath = getProjectDirPath(projectId);
    const projectPath = existsSync(flatPath) ? flatPath : existsSync(dirPath) ? dirPath : null;

    if (!projectPath) return null;

    try {
      const content = await readFile(projectPath, 'utf-8');
      return JSON.parse(content) as Project;
    } catch (error) {
      console.error('Error reading project:', error);
      return null;
    }
  },

  /**
   * Update a project
   */
  async updateProject(projectId: string, updates: UpdateProjectRequest): Promise<Project | null> {
    const project = await this.getProject(projectId);
    if (!project) {
      return null;
    }

    const updatedProject: Project = {
      ...project,
      ...updates,
      updatedAt: Date.now(),
      lastModified: Date.now(),
    };

    // Save to project directory (new structure)
    const dirPath = path.join(DATA_DIR, projectId, 'project.json');
    if (existsSync(dirPath)) {
      await writeFile(dirPath, JSON.stringify(updatedProject, null, 2), 'utf-8');
    } else {
      // Fallback to flat file (old structure)
      await writeFile(getProjectPath(projectId), JSON.stringify(updatedProject, null, 2), 'utf-8');
    }

    return updatedProject;
  },

  /**
   * Delete a project
   */
  async deleteProject(projectId: string): Promise<boolean> {
    // Check both flat file and subdirectory layouts
    const flatPath = getProjectPath(projectId);
    const dirPath = path.join(DATA_DIR, projectId);
    const isDirectory = existsSync(dirPath) && !existsSync(flatPath);
    const isFlatFile = existsSync(flatPath);

    if (!isDirectory && !isFlatFile) {
      return false;
    }

    try {
      if (isDirectory) {
        // Delete entire project directory
        await rm(dirPath, { recursive: true, force: true });
      } else {
        // Delete flat file
        await unlink(flatPath);
        // Clean up files directory if exists (old structure)
        const filesDir = getProjectFilesPath(projectId);
        if (existsSync(filesDir)) {
          await rm(filesDir, { recursive: true, force: true });
        }
      }
      return true;
    } catch (error) {
      console.error('Error deleting project:', error);
      return false;
    }
  },

  /**
   * List projects with filtering
   */
  async listProjects(query: ProjectQuery = {}): Promise<ProjectListItem[]> {
    await ensureDataDir();

    try {
      const entries = await readdir(DATA_DIR, { withFileTypes: true });

      // Collect all project JSON paths: flat files + subdirectory project.json
      const projectPaths: string[] = [];
      for (const entry of entries) {
        if (entry.isFile() && entry.name.endsWith('.json')) {
          projectPaths.push(path.join(DATA_DIR, entry.name));
        } else if (entry.isDirectory()) {
          const dirProjectJson = path.join(DATA_DIR, entry.name, 'project.json');
          if (existsSync(dirProjectJson)) {
            projectPaths.push(dirProjectJson);
          }
        }
      }

      const projects: ProjectListItem[] = [];

      for (const projectPath of projectPaths) {
        const content = await readFile(projectPath, 'utf-8');
        const project = JSON.parse(content) as Project;

        // Skip malformed project files (missing id or name)
        if (!project.id || typeof project.id !== 'string') continue;
        if (!project.name || typeof project.name !== 'string') continue;

        // Apply filters
        if (query.status && project.status !== query.status) {
          continue;
        }
        if (query.userId && project.userId !== query.userId) {
          continue;
        }
        if (query.domain && !project.domain.includes(query.domain)) {
          continue;
        }

        const ontologySize = await canonicalOntologySize(project);

        // Check if solution manifest exists
        let hasSolution = false;
        const solutionsDir = path.join(DATA_DIR, project.id, 'solutions');
        if (existsSync(solutionsDir)) {
          try {
            const solutionEntries = await readdir(solutionsDir, { withFileTypes: true });
            hasSolution = solutionEntries.some(
              (e) => e.isDirectory() && e.name.match(/^v\d+\.\d+$/)
            );
          } catch {
            // Ignore errors
          }
        }

        projects.push({
          id: project.id,
          name: project.name,
          description: project.description,
          domain: project.domain,
          createdAt: project.createdAt,
          lastModified: project.lastModified,
          ontologySize,
          ontologyId: project.ontologyId,
          color: project.color,
          status: project.status,
          hasSolution,
        });
      }

      // Sort by last modified (newest first)
      projects.sort((a, b) => b.lastModified - a.lastModified);

      // Apply pagination
      const page = query.page || 1;
      const limit = query.limit || 20;
      const offset = (page - 1) * limit;

      return projects.slice(offset, offset + limit);
    } catch (error) {
      console.error('Error listing projects:', error);
      return [];
    }
  },

  /**
   * Export a project as JSON
   */
  async exportProject(projectId: string): Promise<string> {
    const project = await this.getProject(projectId);
    if (!project) {
      throw new Error('Project not found');
    }

    const exportData = {
      project,
      exportedAt: new Date().toISOString(),
      version: '1.0',
    };

    return JSON.stringify(exportData, null, 2);
  },

  /**
   * Import a project from JSON
   */
  async importProject(
    exportJson: string,
    options: { overwrite?: boolean; newId?: boolean } = {}
  ): Promise<Project> {
    const importData = JSON.parse(exportJson);

    if (!importData.project) {
      throw new Error('Invalid export format');
    }

    const originalProject = importData.project as Project;

    const request: CreateProjectRequest = {
      name: originalProject.name,
      description: originalProject.description,
      domain: originalProject.domain,
      type: originalProject.type,
      userId: originalProject.userId || 'current-user',
      ontologyId: options.newId ? undefined : originalProject.ontologyId,
      status: originalProject.status,
      color: originalProject.color,
      icon: originalProject.icon,
      metadata: originalProject.metadata,
    };

    return this.createProject(request);
  },

  /**
   * Get project statistics
   */
  async getProjectStats(projectId: string): Promise<{
    fileCount: number;
    lastModified: number;
    ontologySize: number;
  } | null> {
    const project = await this.getProject(projectId);
    if (!project) {
      return null;
    }

    const filesDir = getProjectFilesPath(projectId);
    let fileCount = 0;
    if (existsSync(filesDir)) {
      try {
        const files = await readdir(filesDir);
        fileCount = files.length;
      } catch {
        // Ignore
      }
    }

    const ontologySize = await canonicalOntologySize(project);

    return {
      fileCount,
      lastModified: project.lastModified,
      ontologySize,
    };
  },
};
