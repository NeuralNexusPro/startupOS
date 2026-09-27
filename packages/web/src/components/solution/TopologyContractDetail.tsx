import type {
  CanonicalContract,
  CanonicalInputFact,
} from '@originos/core/lib/features/ontology/types';

function Facts({
  title,
  facts,
}: {
  title: string;
  facts: CanonicalInputFact[];
}): JSX.Element {
  return (
    <section>
      <h4 className="font-medium">{title}</h4>
      {facts.length ? (
        <ul className="space-y-1">
          {facts.map((fact, index) => (
            <li key={index} className="rounded bg-gray-50 p-2 text-sm">
              <span className="font-medium">
                {fact['factType']['conceptId']} /{' '}
                {fact['factType']['factTypeId']}
              </span>{' '}
              · {fact.required ? '必需' : '可选'}
              <span className="block text-gray-600">
                本体 {fact['factType'].ontologyId} · 版本{' '}
                {fact['factType'].ontologyVersion}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-gray-500">无</p>
      )}
    </section>
  );
}
const object = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
const reference = (value: unknown): boolean =>
  object(value) &&
  typeof value['ontologyId'] === 'string' &&
  typeof value['ontologyVersion'] === 'string';
/** Shape safety for unfinished drafts only; ontology semantics remain owned by the canonical validator. */
function displayable(value: unknown): value is CanonicalContract {
  if (!object(value) || !reference(value['ontology'])) return false;
  if (
    !Array.isArray(value['inputs']) ||
    !Array.isArray(value['outputs']) ||
    !Array.isArray(value['actions']) ||
    !Array.isArray(value['permissions'])
  )
    return false;
  return (
    [...value['inputs'], ...value['outputs']].every(
      (fact) =>
        object(fact) &&
        reference(fact['factType']) &&
        object(fact['factType']) &&
        typeof fact['factType']['conceptId'] === 'string' &&
        typeof fact['factType']['factTypeId'] === 'string'
    ) &&
    value['actions'].every(
      (action) =>
        object(action) &&
        typeof action['actionId'] === 'string' &&
        reference(action['concept']) &&
        object(action['concept']) &&
        typeof action['concept']['conceptId'] === 'string'
    ) &&
    value['permissions'].every((permission) => typeof permission === 'string')
  );
}
export function TopologyContractDetail({
  contract,
}: {
  contract: unknown;
}): JSX.Element {
  if (!displayable(contract)) return <p role="alert">契约不完整，请检查设计</p>;
  return (
    <div className="space-y-3">
      <h4 className="font-medium">Canonical 契约</h4>
      <p>
        本体：{contract.ontology.ontologyId} · 版本：
        {contract.ontology.ontologyVersion}
      </p>
      <Facts title="输入" facts={contract.inputs} />
      <Facts title="输出" facts={contract.outputs} />
      <section>
        <h4 className="font-medium">Action</h4>
        {contract.actions.length ? (
          <ul>
            {contract.actions.map((action, index) => (
              <li key={index}>
                {action['actionId']} · {action['concept']['conceptId']} · 本体{' '}
                {action['concept'].ontologyId} /{' '}
                {action['concept'].ontologyVersion}
              </li>
            ))}
          </ul>
        ) : (
          <p>无</p>
        )}
      </section>
      <section>
        <h4 className="font-medium">权限</h4>
        <p>{contract.permissions.join('、') || '无'}</p>
      </section>
      <details>
        <summary>完整契约引用</summary>
        <pre className="overflow-auto whitespace-pre-wrap text-sm">
          {JSON.stringify(contract, null, 2)}
        </pre>
      </details>
    </div>
  );
}
