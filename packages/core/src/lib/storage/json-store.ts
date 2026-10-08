/**
 * JSON File Store
 *
 * Simple file-based storage for MVP phase
 * All data is stored in {project-root}/data/ directory
 */

import { promises as fs } from 'fs';
import path from 'path';
import { getDataRoot } from '../paths';

function dataRoot() { return getDataRoot(); }
function interviewsDir() { return path.join(dataRoot(), 'interviews'); }
function ontologyDir() { return path.join(dataRoot(), 'ontology'); }
function chatDir() { return path.join(dataRoot(), 'chats'); }
function projectsDir() { return path.join(dataRoot(), 'projects'); }

/**
 * File metadata wrapper
 */
export interface DataFile<T = unknown> {
  version: string;
  createdAt: string;
  updatedAt: string;
  data: T;
}

/**
 * JSON Store class
 */
export class JsonStore {
  private version = '1.0.0';
  private directoriesInitialized = false;

  private static instance: JsonStore | null = null;

  private constructor() {}

  /**
   * Get singleton instance
   */
  static getInstance(): JsonStore {
    if (!JsonStore.instance) {
      JsonStore.instance = new JsonStore();
    }
    return JsonStore.instance;
  }

  private async ensureInitialized(): Promise<void> {
    if (this.directoriesInitialized) return;
    await this.initializeDirectories();
    this.directoriesInitialized = true;
  }

  /**
   * Initialize data directories
   */
  private async initializeDirectories(): Promise<void> {
    const dirs = [
      dataRoot(),
      interviewsDir(),
      ontologyDir(),
      chatDir(),
      projectsDir(),
      path.join(projectsDir(), 'files'),
    ];

    for (const dir of dirs) {
      try {
        await fs.mkdir(dir, { recursive: true });
      } catch (error) {
        console.error(`Failed to create directory ${dir}:`, error);
      }
    }
  }

  /**
   * Read JSON file
   */
  async read<T>(filePath: string): Promise<DataFile<T> | null> {
    try {
      const fullPath = path.join(dataRoot(), filePath);
      const content = await fs.readFile(fullPath, 'utf-8');
      return JSON.parse(content);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return null;
      }
      if (error instanceof SyntaxError) {
        console.warn(`[JsonStore] Malformed JSON in ${filePath}:`, error.message);
        return null;
      }
      throw error;
    }
  }

  /**
   * Write JSON file
   */
  async write<T>(filePath: string, data: T): Promise<void> {
    await this.ensureInitialized();
    const now = new Date().toISOString();

    const fileData: DataFile<T> = {
      version: this.version,
      createdAt: now,
      updatedAt: now,
      data,
    };

    const fullPath = path.join(dataRoot(), filePath);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, JSON.stringify(fileData, null, 2), 'utf-8');
  }

  /**
   * Update JSON file
   */
  async update<T>(filePath: string, data: Partial<T>): Promise<boolean> {
    const existing = await this.read<T>(filePath);
    if (!existing) {
      return false;
    }

    const now = new Date().toISOString();

    const updatedData = {
      ...existing,
      updatedAt: now,
      data: {
        ...existing.data,
        ...data,
      },
    };

    const fullPath = path.join(dataRoot(), filePath);
    await fs.writeFile(fullPath, JSON.stringify(updatedData, null, 2), 'utf-8');

    return true;
  }

  /**
   * Delete JSON file
   */
  async delete(filePath: string): Promise<boolean> {
    try {
      await fs.unlink(path.join(dataRoot(), filePath));
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return true;
      }
      return false;
    }
  }

  /**
   * Check if file exists
   */
  async exists(filePath: string): Promise<boolean> {
    try {
      await fs.access(path.join(dataRoot(), filePath));
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Stat a file (metadata only, no content read) — null when missing
   */
  async stat(filePath: string): Promise<{ mtimeMs: number; size: number } | null> {
    try {
      const stats = await fs.stat(path.join(dataRoot(), filePath));
      return { mtimeMs: stats.mtimeMs, size: stats.size };
    } catch {
      return null;
    }
  }

  /**
   * List all files in a directory
   */
  async listFiles(dirPath: string, extension = '.json'): Promise<string[]> {
    try {
      const fullPath = path.join(dataRoot(), dirPath);
      const files = await fs.readdir(fullPath);
      return files.filter((file) => file.endsWith(extension));
    } catch (error) {
      return [];
    }
  }

  /**
   * Get interviews path
   */
  getInterviewPath(interviewId: string): string {
    return path.join(interviewsDir(), `${interviewId}.json`);
  }

  /**
   * Get ontology path
   */
  getOntologyPath(ontologyId: string): string {
    return path.join(ontologyDir(), `${ontologyId}-ontology.json`);
  }

  /**
   * Get chat path
   */
  getChatPath(chatId: string): string {
    return path.join(chatDir(), `${chatId}.json`);
  }

  /**
   * Get project metadata path
   */
  getProjectPath(projectId: string): string {
    return path.join(projectsDir(), `${projectId}.json`);
  }
}

/**
 * Export singleton instance
 */
export const jsonStore = JsonStore.getInstance();
