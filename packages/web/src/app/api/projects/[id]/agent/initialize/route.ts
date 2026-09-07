/**
 * API Route: Initialize Project Agent Configuration
 * POST /api/projects/{id}/agent/initialize
 *
 * 为项目创建默认的 Agent.md 和 Tool.md 配置文件
 */

import { NextRequest, NextResponse } from 'next/server';
import type { ApiResponse } from '@originos/core/types';
import fs from 'fs/promises';
import path from 'path';
import { getDataRoot, getTemplatesDir } from '@originos/core/lib/paths';
import {
  PROJECT_DEFAULT_SKILLS,
  provisionProjectSkills,
} from '@originos/core/lib/integrations/pi-agent/project-agent';

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: projectId } = await params;

    console.log(`[API] Initializing agent configuration for project: ${projectId}`);

    // 项目目录
    const projectDir = path.join(getDataRoot(), 'projects', projectId);

    // 确保项目目录存在
    await fs.mkdir(projectDir, { recursive: true });

    // 模板目录（项目访谈 agent 模板）— monorepo 根目录
    const templateDir = path.join(getTemplatesDir(), 'project-interview');

    // 复制 Agent.md
    const agentMdPath = path.join(projectDir, 'Agent.md');
    const agentMdExists = await fs.access(agentMdPath).then(() => true).catch(() => false);

    if (!agentMdExists) {
      const agentTemplate = await fs.readFile(path.join(templateDir, 'Agent.md'), 'utf-8');
      await fs.writeFile(agentMdPath, agentTemplate, 'utf-8');
      console.log(`[API] Created Agent.md for project: ${projectId}`);
    } else {
      console.log(`[API] Agent.md already exists for project: ${projectId}`);
    }

    // 复制 Tool.md
    const toolMdPath = path.join(projectDir, 'Tool.md');
    const toolMdExists = await fs.access(toolMdPath).then(() => true).catch(() => false);

    if (!toolMdExists) {
      const toolTemplate = await fs.readFile(path.join(templateDir, 'Tool.md'), 'utf-8');
      await fs.writeFile(toolMdPath, toolTemplate, 'utf-8');
      console.log(`[API] Created Tool.md for project: ${projectId}`);
    } else {
      console.log(`[API] Tool.md already exists for project: ${projectId}`);
    }

    // 复制 Taste.md（品味工程文件）
    const tasteMdPath = path.join(projectDir, 'Taste.md');
    const tasteMdExists = await fs.access(tasteMdPath).then(() => true).catch(() => false);

    if (!tasteMdExists) {
      try {
        const tasteTemplate = await fs.readFile(path.join(templateDir, 'Taste.md'), 'utf-8');
        await fs.writeFile(tasteMdPath, tasteTemplate, 'utf-8');
        console.log(`[API] Created Taste.md for project: ${projectId}`);
      } catch {
        console.log(`[API] Taste.md template not found, skipping`);
      }
    } else {
      console.log(`[API] Taste.md already exists for project: ${projectId}`);
    }

    // 复制 MEMORY.md（项目访谈记忆文件）
    const memoryMdPath = path.join(projectDir, 'MEMORY.md');
    const memoryMdExists = await fs.access(memoryMdPath).then(() => true).catch(() => false);

    if (!memoryMdExists) {
      try {
        const memoryTemplate = await fs.readFile(path.join(templateDir, 'MEMORY.md'), 'utf-8');
        await fs.writeFile(memoryMdPath, memoryTemplate, 'utf-8');
        console.log(`[API] Created MEMORY.md for project: ${projectId}`);
      } catch {
        console.log(`[API] MEMORY.md template not found, skipping`);
      }
    } else {
      console.log(`[API] MEMORY.md already exists for project: ${projectId}`);
    }

    // 复制 Knowledge.md（知识库文件）
    const knowledgeMdPath = path.join(projectDir, 'Knowledge.md');
    const knowledgeMdExists = await fs.access(knowledgeMdPath).then(() => true).catch(() => false);

    if (!knowledgeMdExists) {
      try {
        const knowledgeTemplate = await fs.readFile(path.join(templateDir, 'Knowledge.md'), 'utf-8');
        await fs.writeFile(knowledgeMdPath, knowledgeTemplate, 'utf-8');
        console.log(`[API] Created Knowledge.md for project: ${projectId}`);
      } catch {
        console.log(`[API] Knowledge.md template not found, skipping`);
      }
    } else {
      console.log(`[API] Knowledge.md already exists for project: ${projectId}`);
    }

    // 复制 Patterns.md（经验模式文件）
    const patternsMdPath = path.join(projectDir, 'Patterns.md');
    const patternsMdExists = await fs.access(patternsMdPath).then(() => true).catch(() => false);

    if (!patternsMdExists) {
      try {
        const patternsTemplate = await fs.readFile(path.join(templateDir, 'Patterns.md'), 'utf-8');
        await fs.writeFile(patternsMdPath, patternsTemplate, 'utf-8');
        console.log(`[API] Created Patterns.md for project: ${projectId}`);
      } catch {
        console.log(`[API] Patterns.md template not found, skipping`);
      }
    } else {
      console.log(`[API] Patterns.md already exists for project: ${projectId}`);
    }

    // 创建 output 目录
    const outputDir = path.join(projectDir, 'output');
    await fs.mkdir(outputDir, { recursive: true });

    // 创建 sessions 目录
    const sessionsDir = path.join(projectDir, 'sessions');
    await fs.mkdir(sessionsDir, { recursive: true });

    // 复制项目默认技能文件
    const copiedSkills: string[] = [];

    const skillResults = await provisionProjectSkills(projectDir, PROJECT_DEFAULT_SKILLS);
    const missingSkills = skillResults.filter((result) => result.status === 'missing');
    if (missingSkills.length > 0) {
      throw new Error(`Bundled project skills not found: ${missingSkills.map((result) => result.skillName).join(', ')}`);
    }
    for (const result of skillResults) {
      copiedSkills.push(`skills/${result.skillName}/SKILL.md (${result.status})`);
    }

    return NextResponse.json<ApiResponse<{ projectId: string; files: string[] }>>(
      {
        success: true,
        data: {
          projectId,
          files: [
            agentMdExists ? 'Agent.md (existing)' : 'Agent.md (created)',
            toolMdExists ? 'Tool.md (existing)' : 'Tool.md (created)',
            tasteMdExists ? 'Taste.md (existing)' : 'Taste.md (created)',
            memoryMdExists ? 'MEMORY.md (existing)' : 'MEMORY.md (created)',
            knowledgeMdExists ? 'Knowledge.md (existing)' : 'Knowledge.md (created)',
            patternsMdExists ? 'Patterns.md (existing)' : 'Patterns.md (created)',
            'output/ (created)',
            'sessions/ (created)',
            ...copiedSkills,
          ],
        },
        timestamp: new Date().toISOString(),
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('[API] Error initializing agent configuration:', error);

    return NextResponse.json<ApiResponse<unknown>>(
      {
        success: false,
        error: {
          code: 'INITIALIZATION_FAILED',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
