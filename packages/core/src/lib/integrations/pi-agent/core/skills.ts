/**
 * Skill Framework for OriginOS pi-agent Integration
 *
 * This module provides the core skill loading and execution framework
 * for OriginOS, adapted from Agent Skills standard (agentskills.io)
 *
 * Features:
 * - Load skills from multiple sources (bundled, user, project)
 * - Parse SKILL.md files with frontmatter
 * - Format skills for agent context injection
 * - Manage skill lifecycle and validation
 */

import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, statSync } from "fs";
import ignore from "ignore";
import { basename, dirname, join, relative, resolve, sep } from "path";
import { getDataRoot, getMonorepoRoot, getSkillsDataDir } from '../../../paths';

/**
 * Constants per Agent Skills spec
 */
export const MAX_NAME_LENGTH = 64;
export const MAX_DESCRIPTION_LENGTH = 1024;

const IGNORE_FILE_NAMES = [".gitignore", ".ignore", ".fdignore"];

import type { Skill, SkillFrontmatter, SkillDiagnostic } from '../../../../types/skill-service';
export type { Skill, SkillFrontmatter, SkillDiagnostic } from '../../../../types/skill-service';

/**
 * Result of loading skills
 */
export interface LoadSkillsResult {
	skills: Skill[];
	diagnostics: SkillDiagnostic[];
}

/**
 * Options for loading skills
 */
export interface LoadSkillsOptions {
	/** Working directory for project-local skills */
	cwd?: string;
	/** Agent config directory for global skills */
	agentDir?: string;
	/** Explicit skill paths (files or directories) */
	skillPaths?: string[];
	/** Include default skills directories */
	includeDefaults?: boolean;
}

/**
 * Ignore matcher implementation
 */
type IgnoreMatcher = ReturnType<typeof ignore>;

/**
 * Convert path to POSIX format for consistent comparison
 */
function toPosixPath(p: string): string {
	return p.split(sep).join("/");
}

/**
 * Prefix ignore patterns with a base directory
 */
function prefixIgnorePattern(line: string, prefix: string): string | null {
	const trimmed = line.trim();
	if (!trimmed) return null;
	if (trimmed.startsWith("#") && !trimmed.startsWith("\\#")) return null;

	let pattern = line;
	let negated = false;

	if (pattern.startsWith("!")) {
		negated = true;
		pattern = pattern.slice(1);
	} else if (pattern.startsWith("\\!")) {
		pattern = pattern.slice(1);
	}

	if (pattern.startsWith("/")) {
		pattern = pattern.slice(1);
	}

	const prefixed = prefix ? `${prefix}${pattern}` : pattern;
	return negated ? `!${prefixed}` : prefixed;
}

/**
 * Load ignore patterns from .gitignore and related files
 */
function addIgnoreRules(ig: IgnoreMatcher, dir: string, rootDir: string): void {
	const relativeDir = relative(rootDir, dir);
	const prefix = relativeDir ? `${toPosixPath(relativeDir)}/` : "";

	for (const filename of IGNORE_FILE_NAMES) {
		const ignorePath = join(dir, filename);
		if (!existsSync(ignorePath)) continue;
		try {
			const content = readFileSync(ignorePath, "utf-8");
			const patterns = content
				.split(/\r?\n/)
				.map((line) => prefixIgnorePattern(line, prefix))
				.filter((line): line is string => Boolean(line));
			if (patterns.length > 0) {
				ig.add(patterns);
			}
		} catch {}
	}
}

/**
 * Validate skill name per Agent Skills spec
 */
function validateName(name: string, parentDirName: string): string[] {
	const errors: string[] = [];

	if (name !== parentDirName) {
		errors.push(`name "${name}" does not match parent directory "${parentDirName}"`);
	}

	if (name.length > MAX_NAME_LENGTH) {
		errors.push(`name exceeds ${MAX_NAME_LENGTH} characters (${name.length})`);
	}

	if (!/^[a-z0-9-]+$/.test(name)) {
		errors.push(`name contains invalid characters (must be lowercase a-z, 0-9, hyphens only)`);
	}

	if (name.startsWith("-") || name.endsWith("-")) {
		errors.push(`name must not start or end with a hyphen`);
	}

	if (name.includes("--")) {
		errors.push(`name must not contain consecutive hyphens`);
	}

	return errors;
}

/**
 * Validate description per Agent Skills spec
 */
function validateDescription(description: string | undefined): string[] {
	const errors: string[] = [];

	if (!description || description.trim() === "") {
		errors.push("description is required");
	} else if (description.length > MAX_DESCRIPTION_LENGTH) {
		errors.push(`description exceeds ${MAX_DESCRIPTION_LENGTH} characters (${description.length})`);
	}

	return errors;
}

function isTruthyFrontmatterValue(value: unknown): boolean {
	return value === true || value === "true" || value === "yes" || value === "1";
}

export function isSystemSkillFrontmatter(frontmatter: SkillFrontmatter | Record<string, unknown>): boolean {
	return isTruthyFrontmatterValue(frontmatter["originos-system"]);
}

/**
 * Parse YAML frontmatter from markdown content
 */
export function parseFrontmatter<T = SkillFrontmatter>(content: string): {
	frontmatter: T;
	body: string;
} {
	const frontmatterRegex = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)([\s\S]*)$/;
	const match = content.match(frontmatterRegex);

	if (!match) {
		return { frontmatter: {} as T, body: content };
	}

	const frontmatterText = match[1] || "";
	const body = match[2] || "";

	try {
		const frontmatter: T = frontmatterText.split(/\r?\n/).reduce((acc: Record<string, unknown>, line) => {
			const colonIndex = line.indexOf(":");
			if (colonIndex === -1) {
				return acc;
			}
			const key = line.slice(0, colonIndex).trim();
			const value = line.slice(colonIndex + 1).trim();
			// Handle simple quoted values
			if ((value.startsWith('"') && value.endsWith('"')) ||
			    (value.startsWith("'") && value.endsWith("'"))) {
				acc[key] = value.slice(1, -1);
			} else {
				acc[key] = value;
			}
			return acc;
		}, {} as Record<string, unknown>) as T;

		return { frontmatter, body };
	} catch (error) {
		console.error("Failed to parse frontmatter:", error);
		return { frontmatter: {} as T, body: content };
	}
}

/**
 * Load a skill from a file path
 */
function loadSkillFromFile(
	filePath: string,
	source: Skill["source"],
): { skill: Skill | null; diagnostics: SkillDiagnostic[] } {
	const diagnostics: SkillDiagnostic[] = [];

	try {
		const rawContent = readFileSync(filePath, "utf-8");
		const { frontmatter } = parseFrontmatter<SkillFrontmatter>(rawContent);
		const skillDir = dirname(filePath);
		const parentDirName = basename(skillDir);

		// Validate description
		const descErrors = validateDescription(frontmatter.description);
		for (const error of descErrors) {
			diagnostics.push({ type: "warning", message: error, path: filePath });
		}

		// Use name from frontmatter, or fall back to parent directory name
		const name = frontmatter.name || parentDirName;
		const code = frontmatter.code;

		// Validate name
		const nameErrors = validateName(name, parentDirName);
		for (const error of nameErrors) {
			diagnostics.push({ type: "warning", message: error, path: filePath });
		}

		// Don't load skill if description is missing
		if (!frontmatter.description || frontmatter.description.trim() === "") {
			return { skill: null, diagnostics };
		}

		const systemManaged = isSystemSkillFrontmatter(frontmatter);
		const effectiveSource = systemManaged ? "bundled" : source;

		return {
			skill: {
				name,
				code,
				description: frontmatter.description,
				filePath,
				baseDir: skillDir,
				source: effectiveSource,
				disableModelInvocation: frontmatter["disable-model-invocation"] === true,
				systemManaged,
				outputDir: typeof frontmatter["outputDir"] === "string" ? frontmatter["outputDir"] : undefined,
			},
			diagnostics,
		};
	} catch (error) {
		const message = error instanceof Error ? error.message : "failed to parse skill file";
		diagnostics.push({ type: "warning", message, path: filePath });
		return { skill: null, diagnostics };
	}
}

/**
 * Load skills from a directory (internal, recursive)
 */
function loadSkillsFromDirInternal(
	dir: string,
	source: Skill["source"],
	includeRootFiles: boolean,
	ignoreMatcher?: IgnoreMatcher,
	rootDir?: string,
): LoadSkillsResult {
	const skills: Skill[] = [];
	const diagnostics: SkillDiagnostic[] = [];

	if (!existsSync(dir)) {
		return { skills, diagnostics };
	}

	const root = rootDir ?? dir;
	const ig = ignoreMatcher ?? ignore();
	addIgnoreRules(ig, dir, root);

	try {
		const entries = readdirSync(dir, { withFileTypes: true });

		for (const entry of entries) {
			if (entry.name.startsWith(".")) {
				continue;
			}

			if (entry.name === "node_modules") {
				continue;
			}

			const fullPath = join(dir, entry.name);

			// Handle symlinks
			let isDirectory = entry.isDirectory();
			let isFile = entry.isFile();
			if (entry.isSymbolicLink()) {
				try {
					const stats = statSync(fullPath);
					isDirectory = stats.isDirectory();
					isFile = stats.isFile();
				} catch {
					continue;
				}
			}

			const relPath = toPosixPath(relative(root, fullPath));
			const ignorePath = isDirectory ? `${relPath}/` : relPath;
			if (ig.ignores(ignorePath)) {
				continue;
			}

			if (isDirectory) {
				const subResult = loadSkillsFromDirInternal(fullPath, source, false, ig, root);
				skills.push(...subResult.skills);
				diagnostics.push(...subResult.diagnostics);
				continue;
			}

			if (!isFile) {
				continue;
			}

			const isRootMd = includeRootFiles && entry.name.endsWith(".md");
			const isSkillMd = !includeRootFiles && entry.name.toLowerCase() === "skill.md";
			if (!isRootMd && !isSkillMd) {
				continue;
			}

			const result = loadSkillFromFile(fullPath, source);
			if (result.skill) {
				skills.push(result.skill);
			}
			diagnostics.push(...result.diagnostics);
		}
	} catch {}

	return { skills, diagnostics };
}

/**
 * Load skills from a directory
 */
export function loadSkillsFromDir(options: {
	dir: string;
	source: Skill["source"];
}): LoadSkillsResult {
	const { dir, source } = options;
	return loadSkillsFromDirInternal(dir, source, true);
}

/**
 * Escape XML special characters
 */
function escapeXml(str: string): string {
	return str
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&apos;");
}

/**
 * Format skills for inclusion in agent context
 * Uses XML format per Agent Skills standard
 */
export function formatSkillsForPrompt(skills: Skill[]): string {
	const visibleSkills = skills.filter((s) => !s.disableModelInvocation);

	if (visibleSkills.length === 0) {
		return "";
	}

	const lines = [
		"\n\nThe following skills provide specialized instructions for specific tasks.",
		"Use the read tool to load a skill's file when the task matches its description.",
		"When a skill file references a relative path, resolve it against the skill directory.",
		"",
		"<available_skills>",
	];

	for (const skill of visibleSkills) {
		lines.push("  <skill>");
		lines.push(`    <name>${escapeXml(skill.name)}</name>`);
		lines.push(`    <description>${escapeXml(skill.description)}</description>`);
		lines.push(`    <location>${escapeXml(skill.filePath)}</location>`);
		lines.push("  </skill>");
	}

	lines.push("</available_skills>");

	return lines.join("\n");
}

/**
 * Get skill content for direct invocation
 */
export function loadSkillContent(skill: Skill): { frontmatter: SkillFrontmatter; body: string } {
	const rawContent = readFileSync(skill.filePath, "utf-8");
	return parseFrontmatter<SkillFrontmatter>(rawContent);
}

/**
 * Default skill directories for OriginOS
 */
export function getDefaultSkillPaths(cwd: string): {
	bundled: string;
	user: string;
	project: string;
} {
	return {
		bundled: getBundledSkillDir(),
		user: getSkillsDataDir(),
		project: resolve(cwd, ".originos", "skills"),
	};
}

function addUniquePath(paths: string[], candidate: string | undefined): void {
	if (!candidate) return;
	const resolved = resolve(candidate);
	if (!paths.includes(resolved)) {
		paths.push(resolved);
	}
}

export function getBundledSkillDirs(): string[] {
	const paths: string[] = [];
	const resourcesPath = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath;
	const envRoot = process.env['MONOREPO_ROOT'];
	const explicitBundledDir = process.env['ORIGINOS_BUNDLED_SKILLS_DIR'];

	addUniquePath(paths, explicitBundledDir);
	addUniquePath(paths, resourcesPath ? join(resourcesPath, 'templates', 'skills') : undefined);
	addUniquePath(paths, envRoot ? join(envRoot, 'templates', 'skills') : undefined);
	addUniquePath(paths, join(getMonorepoRoot(), 'templates', 'skills'));

	return paths;
}

export function getBundledSkillDir(): string {
	// 打包环境下从 extraResources 的 templates/skills 读取；Next standalone
	// 会通过 ELECTRON_RUN_AS_NODE=1 启动，仍然需要优先使用 resourcesPath。
	const candidates = getBundledSkillDirs();
	const existing = candidates.find((candidate) => existsSync(candidate));
	if (existing) {
		return existing;
	}
	return candidates[0] ?? join(getMonorepoRoot(), 'templates', 'skills');
}

export function findBundledSkillDir(skillCode: string): string | null {
	for (const bundledDir of getBundledSkillDirs()) {
		const candidate = join(bundledDir, skillCode);
		if (findSkillMarkdownFile(candidate)) {
			return candidate;
		}
	}

	for (const bundledDir of getBundledSkillDirs()) {
		if (!existsSync(bundledDir)) continue;
		try {
			const entries = readdirSync(bundledDir, { withFileTypes: true });
			for (const entry of entries) {
				if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
				const candidate = join(bundledDir, entry.name);
				const skillMd = findSkillMarkdownFile(candidate);
				if (!skillMd) continue;
				const { frontmatter } = parseFrontmatter<SkillFrontmatter>(readFileSync(skillMd, "utf-8"));
				const code = typeof frontmatter.code === "string" ? frontmatter.code : entry.name;
				const name = typeof frontmatter.name === "string" ? frontmatter.name : entry.name;
				if (code === skillCode || name === skillCode) {
					return candidate;
				}
			}
		} catch {
			// Try the next bundled root.
		}
	}
	return null;
}

export function listBundledSkillIdentifiers(): Set<string> {
	const identifiers = new Set<string>();

	for (const bundledDir of getBundledSkillDirs()) {
		if (!existsSync(bundledDir)) continue;
		try {
			const entries = readdirSync(bundledDir, { withFileTypes: true });
			for (const entry of entries) {
				if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
				const skillDir = join(bundledDir, entry.name);
				const skillMd = findSkillMarkdownFile(skillDir);
				if (!skillMd) continue;

				identifiers.add(entry.name);
				const { frontmatter } = parseFrontmatter<SkillFrontmatter>(readFileSync(skillMd, "utf-8"));
				if (typeof frontmatter.code === "string" && frontmatter.code.trim()) {
					identifiers.add(frontmatter.code.trim());
				}
				if (typeof frontmatter.name === "string" && frontmatter.name.trim()) {
					identifiers.add(frontmatter.name.trim());
				}
			}
		} catch {
			// Try the next bundled root.
		}
	}

	return identifiers;
}

function isSystemManagedSkillDir(skillDir: string): boolean {
	const skillMd = findSkillMarkdownFile(skillDir);
	if (!skillMd) return false;
	const { frontmatter } = parseFrontmatter<SkillFrontmatter>(readFileSync(skillMd, "utf-8"));
	return isSystemSkillFrontmatter(frontmatter);
}

export function findSkillMarkdownFile(skillDir: string): string | null {
	const exactPath = join(skillDir, "SKILL.md");
	if (existsSync(exactPath)) {
		return exactPath;
	}

	if (!existsSync(skillDir)) {
		return null;
	}

	try {
		const entry = readdirSync(skillDir, { withFileTypes: true }).find((candidate) => {
			return candidate.isFile() && candidate.name.toLowerCase() === "skill.md";
		});
		return entry ? join(skillDir, entry.name) : null;
	} catch {
		return null;
	}
}

export function loadSkillFromDirectory(
	skillDir: string,
	source: Skill["source"],
): { skill: Skill | null; diagnostics: SkillDiagnostic[] } {
	const skillMd = findSkillMarkdownFile(skillDir);
	if (!skillMd) {
		return {
			skill: null,
			diagnostics: [{ type: "warning", message: "SKILL.md does not exist", path: skillDir }],
		};
	}
	return loadSkillFromFile(skillMd, source);
}

export function materializeBundledSkill(skillCode: string): Skill | null {
	const sourceDir = findBundledSkillDir(skillCode);
	if (!sourceDir) return null;

	const targetDir = join(getSkillsDataDir(), skillCode);
	const targetSkillMd = join(targetDir, "SKILL.md");
	if (existsSync(targetSkillMd) && !isSystemManagedSkillDir(targetDir)) {
		return null;
	}

	mkdirSync(targetDir, { recursive: true });
	cpSync(sourceDir, targetDir, {
		recursive: true,
		force: true,
		dereference: true,
		filter(source) {
			const relativePath = relative(sourceDir, source).replace(/\\/g, "/");
			return relativePath !== ".git" && !relativePath.startsWith(".git/");
		},
	});

	const loaded = loadSkillFromDirectory(targetDir, "bundled").skill;
	return loaded;
}

/**
 * @deprecated Bundled template skills are loaded directly from templates/skills.
 * This function intentionally does not eagerly copy definitions into data/skills.
 * Use materializeBundledSkill() when a system skill is opened or launched.
 */
export function syncBundledSkillsToUserDirectory(): void {
	return;
}

/**
 * Load skills from all configured locations
 */
export function loadSkills(options: LoadSkillsOptions = {}): LoadSkillsResult {
	const { cwd = getDataRoot(), skillPaths = [], includeDefaults = true } = options;

	const skillMap = new Map<string, Skill>();
	const realPathSet = new Set<string>();
	const allDiagnostics: SkillDiagnostic[] = [];
	const collisionDiagnostics: SkillDiagnostic[] = [];

	function addSkills(result: LoadSkillsResult) {
		allDiagnostics.push(...result.diagnostics);
		for (const skill of result.skills) {
			let realPath: string;
			try {
				realPath = realpathSync(skill.filePath);
			} catch {
				realPath = skill.filePath;
			}

			if (realPathSet.has(realPath)) {
				continue;
			}

			const existing = skillMap.get(skill.name);
			if (existing) {
				collisionDiagnostics.push({
					type: "collision",
					message: `name "${skill.name}" collision`,
					path: skill.filePath,
					collision: {
						resourceType: "skill",
						name: skill.name,
						winnerPath: existing.filePath,
						loserPath: skill.filePath,
					},
				});
			} else {
				skillMap.set(skill.name, skill);
				realPathSet.add(realPath);
			}
		}
	}

	if (includeDefaults) {
		// 用户数据目录下的技能。按需 materialized 的系统技能会带
		// originos-system 标识，并被归类为 bundled source。
		const dataSkillsDir = join(getDataRoot(), "skills");
		if (existsSync(dataSkillsDir)) {
			addSkills(loadSkillsFromDir({ dir: dataSkillsDir, source: "user" }));
		}

		const defaults = getDefaultSkillPaths(cwd);
		for (const bundledDir of getBundledSkillDirs()) {
			if (existsSync(bundledDir)) {
				addSkills(loadSkillsFromDir({ dir: bundledDir, source: "bundled" }));
			}
		}

		// Project-local skills
		if (existsSync(defaults.project)) {
			addSkills(loadSkillsFromDir({ dir: defaults.project, source: "project" }));
		}
	}

	// Explicit skill paths
	for (const rawPath of skillPaths) {
		const resolvedPath = resolve(cwd, rawPath);
		if (!existsSync(resolvedPath)) {
			allDiagnostics.push({ type: "warning", message: "skill path does not exist", path: resolvedPath });
			continue;
		}

		try {
			const stats = statSync(resolvedPath);
			if (stats.isDirectory()) {
				addSkills(loadSkillsFromDir({ dir: resolvedPath, source: "project" }));
			} else if (stats.isFile() && resolvedPath.endsWith(".md")) {
				const result = loadSkillFromFile(resolvedPath, "project");
				if (result.skill) {
					addSkills({ skills: [result.skill], diagnostics: result.diagnostics });
				} else {
					allDiagnostics.push(...result.diagnostics);
				}
			} else {
				allDiagnostics.push({ type: "warning", message: "skill path is not a markdown file", path: resolvedPath });
			}
		} catch (error) {
			const message = error instanceof Error ? error.message : "failed to load skill";
			allDiagnostics.push({ type: "warning", message, path: resolvedPath });
		}
	}

	allDiagnostics.push(...collisionDiagnostics);

	return {
		skills: Array.from(skillMap.values()),
		diagnostics: allDiagnostics,
	};
}
