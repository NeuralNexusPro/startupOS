import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type {
  JsonValue,
  PerceptionPluginRuntimeContext,
  PluginCapabilityAuthorization,
  PluginCapabilityCatalog,
  PluginCapabilityInvocation,
  PluginCapabilityProvider,
} from '@originos/core/modules/perception-runtime/plugins';

const MAX_OUTPUT_BYTES = 2 * 1024 * 1024;
const PRODUCTS = new Set(['calendar', 'todo']);
const SCHEMA_PROJECTION = '{products: [.products[] | select(.id == "calendar" or .id == "todo") | {id, tools: [.tools[] | {canonical_path, cli_path, description, agent_summary, availability, confirmation, effect, idempotency, risk, parameters: (.parameters | with_entries(.value |= {type, description, required, format, enum, default, example, minimum, maximum, minLength, maxLength} | .value |= with_entries(select(.value != null and .value != "")))), constraints}]}]}';

export interface DingTalkOfficeCli {
  run(args: readonly string[], signal: AbortSignal): Promise<string>;
}

interface ParameterSchema {
  type: 'string' | 'integer' | 'number' | 'boolean' | 'array';
  description?: string;
  required?: boolean;
  format?: string;
  enum?: JsonValue[];
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
}

interface ToolConstraints {
  require_together?: string[][];
  require_one_of?: string[][];
  mutually_exclusive?: string[][];
}

interface DwsTool {
  canonical_path: string;
  cli_path: string;
  description: string;
  agent_summary?: string;
  availability: string;
  effect: string;
  parameters?: Record<string, ParameterSchema>;
  constraints?: ToolConstraints | null;
}

interface DwsCatalog {
  products: Array<{ id: string; tools: DwsTool[] }>;
}

interface Operation {
  cliPath: string[];
  product: string;
  schema: Record<string, JsonValue>;
  constraints: ToolConstraints;
}

function resolveCliBinary(): string {
  const configured = process.env.ORIGINOS_DWS_PATH?.trim();
  if (configured) return configured;
  const executable = process.platform === 'win32' ? 'dws.exe' : 'dws';
  const candidates = process.platform === 'win32'
    ? [path.join(process.env.LOCALAPPDATA ?? '', 'dws', executable)]
    : [path.join(os.homedir(), '.local', 'bin', executable), '/opt/homebrew/bin/dws', '/usr/local/bin/dws'];
  return candidates.find(candidate => candidate && fs.existsSync(candidate)) ?? 'dws';
}

class DefaultDingTalkOfficeCli implements DingTalkOfficeCli {
  async run(args: readonly string[], signal: AbortSignal): Promise<string> {
    return new Promise((resolve, reject) => {
      execFile(resolveCliBinary(), [...args], {
        encoding: 'utf8', maxBuffer: MAX_OUTPUT_BYTES, timeout: 30_000, windowsHide: true, signal,
      }, (error, stdout) => {
        if (error) reject(new Error('DINGTALK_OFFICE_CLI_FAILED'));
        else resolve(stdout);
      });
    });
  }
}

function parseObject(text: string): Record<string, JsonValue> {
  if (Buffer.byteLength(text) > MAX_OUTPUT_BYTES) throw new Error('DINGTALK_OFFICE_CLI_INVALID_OUTPUT');
  const value: unknown = JSON.parse(text);
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new Error('DINGTALK_OFFICE_CLI_INVALID_OUTPUT');
  }
  return value as Record<string, JsonValue>;
}

function digest(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function exactProfile(value: Record<string, JsonValue>): string {
  for (const key of ['currentProfile', 'profile']) {
    if (typeof value[key] === 'string' && value[key]) return value[key];
  }
  const profiles = value.profiles;
  if (!Array.isArray(profiles)) return '';
  for (const item of profiles) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const profile = item as Record<string, JsonValue>;
    if ((profile.isCurrent === true || profile.current === true) && typeof profile.profile === 'string') return profile.profile;
  }
  return '';
}

function inputSchema(parameters: Record<string, ParameterSchema> = {}, constraints: ToolConstraints = {}): Record<string, JsonValue> {
  const properties: Record<string, JsonValue> = {};
  const required: string[] = [];
  for (const [name, parameter] of Object.entries(parameters)) {
    if (!/^[a-z][a-z0-9-]*$/.test(name) || !['string', 'integer', 'number', 'boolean', 'array'].includes(parameter.type)) {
      throw new Error('DINGTALK_OFFICE_SCHEMA_INVALID');
    }
    properties[name] = parameter.type === 'array'
      ? { ...parameter, items: { type: 'string' } }
      : parameter as unknown as JsonValue;
    if (parameter.required) required.push(name);
  }
  const allOf: JsonValue[] = [];
  for (const group of constraints.require_one_of ?? []) allOf.push({ anyOf: group.map(name => ({ required: [name] })) });
  for (const group of constraints.mutually_exclusive ?? []) allOf.push({ not: { required: group } });
  for (const group of constraints.require_together ?? []) {
    for (const name of group) allOf.push({ if: { required: [name] }, then: { required: group } });
  }
  return { type: 'object', properties, required, additionalProperties: false, ...(allOf.length ? { allOf } : {}) };
}

function validValue(schema: ParameterSchema, value: JsonValue): boolean {
  if (Array.isArray(schema.enum) && !schema.enum.some(item => JSON.stringify(item) === JSON.stringify(value))) return false;
  if (schema.type === 'array') return Array.isArray(value) && value.every(item => typeof item === 'string');
  if (schema.type === 'boolean') return typeof value === 'boolean';
  if (schema.type === 'integer') return typeof value === 'number' && Number.isInteger(value)
    && (schema.minimum === undefined || value >= schema.minimum) && (schema.maximum === undefined || value <= schema.maximum);
  if (schema.type === 'number') return typeof value === 'number' && Number.isFinite(value)
    && (schema.minimum === undefined || value >= schema.minimum) && (schema.maximum === undefined || value <= schema.maximum);
  return typeof value === 'string' && (schema.minLength === undefined || value.length >= schema.minLength)
    && (schema.maxLength === undefined || value.length <= schema.maxLength);
}

function validConstraints(arguments_: Record<string, JsonValue>, constraints: ToolConstraints): boolean {
  const present = (name: string) => Object.prototype.hasOwnProperty.call(arguments_, name);
  if ((constraints.require_one_of ?? []).some(group => !group.some(present))) return false;
  if ((constraints.mutually_exclusive ?? []).some(group => group.filter(present).length > 1)) return false;
  return !(constraints.require_together ?? []).some(group => group.some(present) && !group.every(present));
}

function invocationArgs(operation: Operation, arguments_: Record<string, JsonValue>): string[] {
  const properties = operation.schema.properties as unknown as Record<string, ParameterSchema>;
  return Object.entries(arguments_).map(([name, value]) => {
    if (!(name in properties)) throw new Error('DINGTALK_OFFICE_CAPABILITY_DENIED');
    const serialized = Array.isArray(value) ? value.join(',') : String(value);
    return `--${name}=${serialized}`;
  });
}

export class DingTalkOfficeCapabilityProvider implements PluginCapabilityProvider {
  private catalogPromise?: Promise<PluginCapabilityCatalog>;
  private readonly operations = new Map<string, Operation>();
  private readonly profiles = new Map<string, string>();

  constructor(private readonly cli: DingTalkOfficeCli = new DefaultDingTalkOfficeCli()) {}

  list(_context: PerceptionPluginRuntimeContext, signal: AbortSignal): Promise<PluginCapabilityCatalog> {
    return this.catalogPromise ??= this.loadCatalog(signal).catch(error => {
      this.catalogPromise = undefined;
      throw error;
    });
  }

  private async loadCatalog(signal: AbortSignal): Promise<PluginCapabilityCatalog> {
    const versionOutput = await this.cli.run(['version'], signal);
    const providerVersion = /\bVersion:\s*v?(\d+\.\d+\.\d+)\b/.exec(versionOutput)?.[1];
    if (!providerVersion) throw new Error('DINGTALK_OFFICE_CLI_INVALID_VERSION');
    const source = parseObject(await this.cli.run(['schema', '--all', '--jq', SCHEMA_PROJECTION], signal)) as unknown as DwsCatalog;
    if (!Array.isArray(source.products)) throw new Error('DINGTALK_OFFICE_SCHEMA_INVALID');
    const capabilities: PluginCapabilityCatalog['capabilities'] = [];
    for (const product of source.products) {
      if (!PRODUCTS.has(product.id) || !Array.isArray(product.tools)) throw new Error('DINGTALK_OFFICE_SCHEMA_INVALID');
      for (const tool of product.tools) {
        if (tool.availability !== 'available' || !/^[a-z0-9][a-z0-9._-]*$/.test(tool.canonical_path)
          || !/^[a-z0-9+_-]+(?: [a-z0-9+_-]+)*$/.test(tool.cli_path) || !tool.description) {
          throw new Error('DINGTALK_OFFICE_SCHEMA_INVALID');
        }
        const constraints = tool.constraints ?? {};
        const schema = inputSchema(tool.parameters, constraints);
        this.operations.set(tool.canonical_path, { cliPath: tool.cli_path.split(' '), product: product.id, schema, constraints });
        const effect = ['read', 'write', 'destructive'].includes(tool.effect) ? tool.effect as 'read' | 'write' | 'destructive' : 'unknown';
        capabilities.push({
          name: tool.canonical_path,
          description: tool.agent_summary || tool.description,
          inputSchema: schema,
          resultDescription: '钉钉官方 dws CLI JSON 响应',
          requiredScopes: [`dingtalk.${product.id}`],
          identityModes: ['user'],
          effect,
        });
      }
    }
    capabilities.sort((left, right) => left.name.localeCompare(right.name));
    return { revision: digest(JSON.stringify(capabilities)), provider: 'dingtalk-dws', providerVersion, capabilities };
  }

  async authorization(context: PerceptionPluginRuntimeContext, signal: AbortSignal): Promise<PluginCapabilityAuthorization> {
    let status: PluginCapabilityAuthorization['status'] = 'unknown';
    let profile = '';
    try {
      const auth = parseObject(await this.cli.run(['auth', 'status', '--format', 'json'], signal));
      if (auth.authenticated === false) status = 'needs_authorization';
      if (auth.authenticated === true) {
        profile = exactProfile(auth);
        if (!profile) profile = exactProfile(parseObject(await this.cli.run(['profile', 'list', '--format', 'json'], signal)));
        status = profile ? 'authorized' : 'unknown';
      }
    } catch {
      status = 'unknown';
    }
    if (profile) this.profiles.set(context.connectorId, profile);
    else this.profiles.delete(context.connectorId);
    const identityRef = profile ? `identity-${digest(profile)}` : 'identity-unavailable';
    const scopes = status === 'authorized' ? ['dingtalk.calendar', 'dingtalk.todo'] : [];
    return {
      principalId: identityRef,
      tenantId: identityRef,
      revision: digest(JSON.stringify([context.connectorId, status, identityRef, scopes])),
      identityMode: 'user', status, scopes,
    };
  }

  validate(name: string, arguments_: Record<string, JsonValue>): boolean {
    const operation = this.operations.get(name);
    if (!operation || Object.getPrototypeOf(arguments_) !== Object.prototype) return false;
    const properties = operation.schema.properties as unknown as Record<string, ParameterSchema>;
    const required = operation.schema.required as string[];
    return required.every(key => key in arguments_)
      && Object.entries(arguments_).every(([key, value]) => Boolean(properties[key] && validValue(properties[key], value)))
      && validConstraints(arguments_, operation.constraints);
  }

  async invoke(context: PerceptionPluginRuntimeContext, input: PluginCapabilityInvocation,
    authorization: PluginCapabilityAuthorization, signal: AbortSignal): Promise<JsonValue> {
    const operation = this.operations.get(input.name);
    const profile = this.profiles.get(context.connectorId);
    if (!operation || !profile || authorization.status !== 'authorized'
      || authorization.principalId !== `identity-${digest(profile)}` || !this.validate(input.name, input.arguments)) {
      throw new Error('DINGTALK_OFFICE_CAPABILITY_DENIED');
    }
    const output = await this.cli.run([
      '--profile', profile, ...operation.cliPath, ...invocationArgs(operation, input.arguments), '--format', 'json', '--yes',
    ], signal);
    return parseObject(output);
  }
}
