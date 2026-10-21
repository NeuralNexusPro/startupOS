import type { CanonicalFactReference } from '../ontology';

const PREFIX = 'ontology-fact:';
const VERSIONED_PREFIX = 'ontology-fact:v1:';

function hasValues(values: readonly (string | undefined)[]): values is readonly string[] {
  return values.every((value) => Boolean(value?.trim()));
}

/**
 * Encodes every component because factId is a business key and may contain
 * colons, whitespace, or non-ASCII characters. The legacy seven-segment form
 * remains readable so persisted Runs created before v1 keep recovering.
 */
export function serializeOntologyFactRef(ref: CanonicalFactReference): string {
  return `${VERSIONED_PREFIX}${[
    ref.ontologyId,
    ref.ontologyVersion,
    ref.conceptId,
    ref.factTypeId,
    ref.factId,
    ref.factVersion,
  ].map(encodeURIComponent).join(':')}`;
}

export function parseOntologyFactRef(value: string): CanonicalFactReference | null {
  if (value.startsWith(VERSIONED_PREFIX)) {
    const segments = value.slice(VERSIONED_PREFIX.length).split(':');
    if (segments.length !== 6) return null;
    let decoded: string[];
    try {
      decoded = segments.map(decodeURIComponent);
    } catch {
      return null;
    }
    if (!hasValues(decoded)) return null;
    const [ontologyId, ontologyVersion, conceptId, factTypeId, factId, factVersion]
      = decoded as [string, string, string, string, string, string];
    return { ontologyId, ontologyVersion, conceptId, factTypeId, factId, factVersion };
  }

  if (!value.startsWith(PREFIX)) return null;
  const segments = value.split(':');
  if (segments.length < 7) return null;
  const [, ontologyId, ontologyVersion, conceptId, factTypeId]
    = segments as [string, string, string, string, string, ...string[]];
  const factId = segments.slice(5, -1).join(':');
  const factVersion = segments.at(-1);
  if (!hasValues([ontologyId, ontologyVersion, conceptId, factTypeId, factId, factVersion])) {
    return null;
  }
  return {
    ontologyId,
    ontologyVersion,
    conceptId,
    factTypeId,
    factId,
    factVersion: factVersion!,
  };
}
