import path from 'node:path';
import { assertSafePerceptionId } from '../protocol/validation';

function isWithin(candidate: string, parent: string): boolean {
  const relative = path.relative(parent, candidate);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

export function resolvePerceptionRoot(dataRoot: string): string {
  return path.join(path.resolve(dataRoot), 'perception');
}

export function resolvePerceptionPath(dataRoot: string, collection: string, ...ids: string[]): string {
  assertSafePerceptionId(collection, 'perception collection');
  ids.forEach((id) => assertSafePerceptionId(id, 'perception path id'));
  const root = resolvePerceptionRoot(dataRoot);
  const result = path.join(root, collection, ...ids);
  if (!isWithin(result, root)) throw new Error('Resolved perception path escaped data root');
  return result;
}

