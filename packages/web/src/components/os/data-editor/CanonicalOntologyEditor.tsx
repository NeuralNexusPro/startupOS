'use client';

import { useState, type FormEvent, type ReactNode } from 'react';

import { Pencil, Plus, Save, Trash2, X } from 'lucide-react';

import type { ProjectCanonicalOntologyMutation } from '../workspace/project-canonical-ontology';
import type {
  CanonicalOntology,
  CanonicalValueType,
} from '@originos/core/lib/features/ontology';

interface CanonicalOntologyEditorProps {
  ontology: CanonicalOntology;
  busy?: boolean;
  onMutate: (mutation: ProjectCanonicalOntologyMutation) => Promise<void>;
}

const VALUE_TYPES: CanonicalValueType[] = [
  'string',
  'number',
  'boolean',
  'date',
  'object',
  'array',
  'reference',
];
const CARDINALITIES = [
  'one-to-one',
  'one-to-many',
  'many-to-one',
  'many-to-many',
] as const;
const inputClass =
  'w-full rounded border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-800 focus:border-blue-500 focus:outline-none';

function createId(prefix: string): string {
  const suffix =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${suffix}`;
}

const Section = ({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: ReactNode;
}) => {
  return (
    <section className="rounded-lg border border-gray-200 bg-white">
      <header className="border-b border-gray-100 px-4 py-3">
        <h4 className="text-sm font-semibold text-gray-800">
          {title} <span className="font-normal text-gray-400">{count}</span>
        </h4>
      </header>
      <div className="space-y-3 p-4">{children}</div>
    </section>
  );
};

const Actions = ({
  editing,
  disabled,
  onEdit,
  onDelete,
}: {
  editing: boolean;
  disabled: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) => {
  if (editing) {
    return null;
  }
  return (
    <div className="flex shrink-0 gap-1">
      <button
        type="button"
        aria-label="编辑"
        disabled={disabled}
        onClick={onEdit}
        className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-blue-600 disabled:opacity-40"
      >
        <Pencil className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        aria-label="删除"
        disabled={disabled}
        onClick={onDelete}
        className="rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-40"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
};

const FormActions = ({
  busy,
  onCancel,
  label = '保存',
}: {
  busy?: boolean;
  onCancel?: () => void;
  label?: string;
}) => {
  return (
    <div className="flex justify-end gap-2">
      {onCancel && (
        <button
          type="button"
          onClick={onCancel}
          className="rounded px-2 py-1 text-xs text-gray-500 hover:bg-gray-100"
        >
          <X className="mr-1 inline h-3 w-3" />
          取消
        </button>
      )}
      <button
        disabled={busy}
        className="rounded bg-blue-600 px-2.5 py-1.5 text-xs text-white hover:bg-blue-700 disabled:opacity-50"
      >
        <Save className="mr-1 inline h-3 w-3" />
        {busy ? '提交中…' : label}
      </button>
    </div>
  );
};

export const CanonicalOntologyEditor = ({
  ontology,
  busy = false,
  onMutate,
}: CanonicalOntologyEditorProps) => {
  const [showCreate, setShowCreate] = useState<string | null>(null);
  const conceptName = new Map(
    ontology.concepts.map((item) => [item.id, item.name])
  );

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Section title="领域" count={ontology.domains.length}>
        {ontology.domains.map((domain) => (
          <DomainRow
            key={`${domain.id}-${domain.updatedAt}`}
            domain={domain}
            busy={busy}
            onMutate={onMutate}
          />
        ))}
        {showCreate === 'domain' ? (
          <NameDescriptionForm
            submitLabel="创建领域"
            busy={busy}
            onCancel={() => setShowCreate(null)}
            onSubmit={async (name, description) => {
              const now = new Date();
              await onMutate({
                type: 'domain.create',
                value: {
                  id: createId('domain'),
                  name,
                  description,
                  createdAt: now,
                  updatedAt: now,
                },
              });
              setShowCreate(null);
            }}
          />
        ) : (
          <AddButton label="添加领域" onClick={() => setShowCreate('domain')} />
        )}
      </Section>

      <Section title="概念" count={ontology.concepts.length}>
        {ontology.concepts.map((concept) => (
          <ConceptRow
            key={`${concept.id}-${concept.updatedAt}`}
            concept={concept}
            ontology={ontology}
            busy={busy}
            onMutate={onMutate}
          />
        ))}
        {showCreate === 'concept' ? (
          <ConceptForm
            ontology={ontology}
            busy={busy}
            submitLabel="创建概念"
            onCancel={() => setShowCreate(null)}
            onSubmit={async (value) => {
              const now = new Date();
              await onMutate({
                type: 'concept.create',
                value: {
                  id: createId('concept'),
                  attributes: {},
                  createdAt: now,
                  updatedAt: now,
                  ...value,
                },
              });
              setShowCreate(null);
            }}
          />
        ) : (
          <AddButton
            label="添加概念"
            disabled={!ontology.domains.length}
            onClick={() => setShowCreate('concept')}
          />
        )}
      </Section>

      <Section title="属性 / Schema" count={ontology.properties.length}>
        {ontology.properties.map((property) => (
          <PropertyRow
            key={property.id}
            property={property}
            ontology={ontology}
            busy={busy}
            onMutate={onMutate}
          />
        ))}
        {showCreate === 'property' ? (
          <PropertyForm
            ontology={ontology}
            busy={busy}
            submitLabel="创建属性"
            onCancel={() => setShowCreate(null)}
            onSubmit={async (value) => {
              await onMutate({
                type: 'property.create',
                value: { id: createId('property'), ...value },
              });
              setShowCreate(null);
            }}
          />
        ) : (
          <AddButton
            label="添加属性"
            disabled={!ontology.concepts.length}
            onClick={() => setShowCreate('property')}
          />
        )}
      </Section>

      <Section title="关系" count={ontology.relations.length}>
        {ontology.relations.map((relation) => (
          <RelationRow
            key={relation.id}
            relation={relation}
            ontology={ontology}
            busy={busy}
            onMutate={onMutate}
          />
        ))}
        {showCreate === 'relation' ? (
          <RelationForm
            ontology={ontology}
            busy={busy}
            submitLabel="创建关系"
            onCancel={() => setShowCreate(null)}
            onSubmit={async (value) => {
              await onMutate({
                type: 'relation.create',
                value: { id: createId('relation'), ...value },
              });
              setShowCreate(null);
            }}
          />
        ) : (
          <AddButton
            label="添加关系"
            disabled={ontology.concepts.length < 1}
            onClick={() => setShowCreate('relation')}
          />
        )}
      </Section>

      {(ontology.businessStates.length > 0 || ontology.actions.length > 0) && (
        <section className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm xl:col-span-2">
          <h4 className="font-semibold text-gray-800">运行语义</h4>
          <div className="mt-2 grid gap-3 md:grid-cols-2">
            <div>
              <p className="text-xs font-medium text-gray-500">业务状态</p>
              <p className="mt-1 text-gray-700">
                {ontology.businessStates
                  .map(
                    (item) =>
                      `${conceptName.get(item.conceptId) ?? item.conceptId} / ${item.name}`
                  )
                  .join('、') || '无'}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium text-gray-500">Actions</p>
              <p className="mt-1 text-gray-700">
                {ontology.actions
                  .map(
                    (item) =>
                      `${conceptName.get(item.conceptId) ?? item.conceptId} / ${item.name}`
                  )
                  .join('、') || '无'}
              </p>
            </div>
          </div>
        </section>
      )}
    </div>
  );
};

const AddButton = ({
  label,
  disabled,
  onClick,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
}) => {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="flex w-full items-center justify-center gap-1 rounded border border-dashed border-gray-300 py-2 text-sm text-gray-500 hover:border-blue-400 hover:text-blue-600 disabled:opacity-40"
    >
      <Plus className="h-3.5 w-3.5" />
      {label}
    </button>
  );
};

const NameDescriptionForm = ({
  initialName = '',
  initialDescription = '',
  busy,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initialName?: string;
  initialDescription?: string;
  busy?: boolean;
  submitLabel: string;
  onSubmit: (name: string, description: string) => Promise<void>;
  onCancel?: () => void;
}) => {
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription);
  return (
    <form
      className="space-y-2 rounded bg-gray-50 p-3"
      onSubmit={(event) => {
        event.preventDefault();
        void onSubmit(name.trim(), description.trim()).catch(() => undefined);
      }}
    >
      <input
        aria-label="名称"
        required
        value={name}
        onChange={(event) => setName(event.target.value)}
        placeholder="名称"
        className={inputClass}
      />
      <input
        aria-label="描述"
        value={description}
        onChange={(event) => setDescription(event.target.value)}
        placeholder="描述（可选）"
        className={inputClass}
      />
      <FormActions busy={busy} onCancel={onCancel} label={submitLabel} />
    </form>
  );
};

const DomainRow = ({
  domain,
  busy,
  onMutate,
}: {
  domain: CanonicalOntology['domains'][number];
  busy: boolean;
  onMutate: CanonicalOntologyEditorProps['onMutate'];
}) => {
  const [editing, setEditing] = useState(false);
  if (editing) {
    return (
      <NameDescriptionForm
        initialName={domain.name}
        initialDescription={domain.description}
        busy={busy}
        submitLabel="保存领域"
        onCancel={() => setEditing(false)}
        onSubmit={async (name, description) => {
          await onMutate({
            type: 'domain.update',
            domainId: domain.id,
            patch: { name, description },
          });
          setEditing(false);
        }}
      />
    );
  }
  return (
    <div className="flex items-start justify-between gap-3 border-b border-gray-100 pb-2">
      <div>
        <p className="text-sm font-medium text-gray-800">{domain.name}</p>
        {domain.description && (
          <p className="text-xs text-gray-500">{domain.description}</p>
        )}
      </div>
      <Actions
        editing={false}
        disabled={busy}
        onEdit={() => setEditing(true)}
        onDelete={() => {
          if (
            window.confirm(
              `删除领域“${domain.name}”？仍被引用时系统会拒绝删除。`
            )
          ) {
            void onMutate({ type: 'domain.delete', domainId: domain.id }).catch(
              () => undefined
            );
          }
        }}
      />
    </div>
  );
};

type ConceptValue = Pick<
  CanonicalOntology['concepts'][number],
  'domainId' | 'name' | 'type' | 'description'
>;
const ConceptForm = ({
  ontology,
  initial,
  busy,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  ontology: CanonicalOntology;
  initial?: ConceptValue;
  busy: boolean;
  submitLabel: string;
  onSubmit: (value: ConceptValue) => Promise<void>;
  onCancel?: () => void;
}) => {
  const [name, setName] = useState(initial?.name ?? '');
  const [domainId, setDomainId] = useState(
    initial?.domainId ?? ontology.domains[0]?.id ?? ''
  );
  const [type, setType] = useState(initial?.type ?? 'entity');
  const [description, setDescription] = useState(initial?.description ?? '');
  return (
    <form
      className="space-y-2 rounded bg-gray-50 p-3"
      onSubmit={(event) => {
        event.preventDefault();
        void onSubmit({
          name: name.trim(),
          domainId,
          type: type.trim(),
          description: description.trim() || undefined,
        }).catch(() => undefined);
      }}
    >
      <input
        aria-label="概念名称"
        required
        value={name}
        onChange={(event) => setName(event.target.value)}
        className={inputClass}
        placeholder="概念名称"
      />
      <div className="grid grid-cols-2 gap-2">
        <select
          aria-label="所属领域"
          required
          value={domainId}
          onChange={(event) => setDomainId(event.target.value)}
          className={inputClass}
        >
          {ontology.domains.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
        <input
          aria-label="概念类型"
          required
          value={type}
          onChange={(event) => setType(event.target.value)}
          className={inputClass}
          placeholder="entity / class"
        />
      </div>
      <input
        aria-label="概念描述"
        value={description}
        onChange={(event) => setDescription(event.target.value)}
        className={inputClass}
        placeholder="描述（可选）"
      />
      <FormActions busy={busy} onCancel={onCancel} label={submitLabel} />
    </form>
  );
};

const ConceptRow = ({
  concept,
  ontology,
  busy,
  onMutate,
}: {
  concept: CanonicalOntology['concepts'][number];
  ontology: CanonicalOntology;
  busy: boolean;
  onMutate: CanonicalOntologyEditorProps['onMutate'];
}) => {
  const [editing, setEditing] = useState(false);
  const domain = ontology.domains.find(({ id }) => id === concept.domainId);
  if (editing) {
    return (
      <ConceptForm
        ontology={ontology}
        initial={concept}
        busy={busy}
        submitLabel="保存概念"
        onCancel={() => setEditing(false)}
        onSubmit={async (patch) => {
          await onMutate({
            type: 'concept.update',
            conceptId: concept.id,
            patch,
          });
          setEditing(false);
        }}
      />
    );
  }
  return (
    <div className="flex items-start justify-between gap-3 border-b border-gray-100 pb-2">
      <div>
        <p className="text-sm font-medium text-gray-800">{concept.name}</p>
        <p className="text-xs text-gray-500">
          {domain?.name ?? concept.domainId} · {concept.type}
        </p>
      </div>
      <Actions
        editing={false}
        disabled={busy}
        onEdit={() => setEditing(true)}
        onDelete={() => {
          if (
            window.confirm(
              `删除概念“${concept.name}”？仍被引用时系统会拒绝删除。`
            )
          ) {
            void onMutate({
              type: 'concept.delete',
              conceptId: concept.id,
            }).catch(() => undefined);
          }
        }}
      />
    </div>
  );
};

type PropertyValue = Omit<
  CanonicalOntology['properties'][number],
  'id' | 'metadata'
>;
const PropertyForm = ({
  ontology,
  initial,
  busy,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  ontology: CanonicalOntology;
  initial?: PropertyValue;
  busy: boolean;
  submitLabel: string;
  onSubmit: (value: PropertyValue) => Promise<void>;
  onCancel?: () => void;
}) => {
  const [conceptId, setConceptId] = useState(
    initial?.conceptId ?? ontology.concepts[0]?.id ?? ''
  );
  const [name, setName] = useState(initial?.name ?? '');
  const [valueType, setValueType] = useState<CanonicalValueType>(
    initial?.valueType ?? 'string'
  );
  const [required, setRequired] = useState(initial?.required ?? false);
  const [description, setDescription] = useState(initial?.description ?? '');
  const [referenceConceptId, setReferenceConceptId] = useState(
    initial?.referenceConceptId ?? ''
  );
  const submit = (event: FormEvent) => {
    event.preventDefault();
    void onSubmit({
      conceptId,
      name: name.trim(),
      valueType,
      required,
      description: description.trim() || undefined,
      referenceConceptId:
        valueType === 'reference' ? referenceConceptId || undefined : undefined,
    }).catch(() => undefined);
  };
  return (
    <form className="space-y-2 rounded bg-gray-50 p-3" onSubmit={submit}>
      <div className="grid grid-cols-2 gap-2">
        <select
          aria-label="属性所属概念"
          required
          value={conceptId}
          onChange={(event) => setConceptId(event.target.value)}
          className={inputClass}
        >
          {ontology.concepts.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
        <input
          aria-label="属性名称"
          required
          value={name}
          onChange={(event) => setName(event.target.value)}
          className={inputClass}
          placeholder="属性名称"
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <select
          aria-label="属性类型"
          value={valueType}
          onChange={(event) =>
            setValueType(event.target.value as CanonicalValueType)
          }
          className={inputClass}
        >
          {VALUE_TYPES.map((item) => (
            <option key={item}>{item}</option>
          ))}
        </select>
        {valueType === 'reference' ? (
          <select
            aria-label="引用概念"
            required
            value={referenceConceptId}
            onChange={(event) => setReferenceConceptId(event.target.value)}
            className={inputClass}
          >
            <option value="">选择引用概念</option>
            {ontology.concepts.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        ) : (
          <label className="flex items-center gap-2 px-2 text-sm text-gray-600">
            <input
              type="checkbox"
              checked={required}
              onChange={(event) => setRequired(event.target.checked)}
            />
            必填
          </label>
        )}
      </div>
      <input
        aria-label="属性描述"
        value={description}
        onChange={(event) => setDescription(event.target.value)}
        className={inputClass}
        placeholder="描述（可选）"
      />
      <FormActions busy={busy} onCancel={onCancel} label={submitLabel} />
    </form>
  );
};

const PropertyRow = ({
  property,
  ontology,
  busy,
  onMutate,
}: {
  property: CanonicalOntology['properties'][number];
  ontology: CanonicalOntology;
  busy: boolean;
  onMutate: CanonicalOntologyEditorProps['onMutate'];
}) => {
  const [editing, setEditing] = useState(false);
  const concept = ontology.concepts.find(({ id }) => id === property.conceptId);
  if (editing) {
    return (
      <PropertyForm
        ontology={ontology}
        initial={property}
        busy={busy}
        submitLabel="保存属性"
        onCancel={() => setEditing(false)}
        onSubmit={async (patch) => {
          await onMutate({
            type: 'property.update',
            propertyId: property.id,
            patch,
          });
          setEditing(false);
        }}
      />
    );
  }
  return (
    <div className="flex items-start justify-between gap-3 border-b border-gray-100 pb-2">
      <div>
        <p className="text-sm font-medium text-gray-800">
          {property.name}{' '}
          <span className="text-xs font-normal text-gray-400">
            {property.valueType}
            {property.required ? ' · 必填' : ''}
          </span>
        </p>
        <p className="text-xs text-gray-500">
          {concept?.name ?? property.conceptId}
        </p>
      </div>
      <Actions
        editing={false}
        disabled={busy}
        onEdit={() => setEditing(true)}
        onDelete={() => {
          if (
            window.confirm(
              `删除属性“${property.name}”？仍被引用时系统会拒绝删除。`
            )
          ) {
            void onMutate({
              type: 'property.delete',
              propertyId: property.id,
            }).catch(() => undefined);
          }
        }}
      />
    </div>
  );
};

type RelationValue = Omit<
  CanonicalOntology['relations'][number],
  'id' | 'metadata'
>;
const RelationForm = ({
  ontology,
  initial,
  busy,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  ontology: CanonicalOntology;
  initial?: RelationValue;
  busy: boolean;
  submitLabel: string;
  onSubmit: (value: RelationValue) => Promise<void>;
  onCancel?: () => void;
}) => {
  const [name, setName] = useState(initial?.name ?? '');
  const [sourceConceptId, setSourceConceptId] = useState(
    initial?.sourceConceptId ?? ontology.concepts[0]?.id ?? ''
  );
  const [targetConceptId, setTargetConceptId] = useState(
    initial?.targetConceptId ?? ontology.concepts[0]?.id ?? ''
  );
  const [cardinality, setCardinality] = useState<RelationValue['cardinality']>(
    initial?.cardinality ?? 'one-to-many'
  );
  const [description, setDescription] = useState(initial?.description ?? '');
  return (
    <form
      className="space-y-2 rounded bg-gray-50 p-3"
      onSubmit={(event) => {
        event.preventDefault();
        void onSubmit({
          name: name.trim(),
          sourceConceptId,
          targetConceptId,
          cardinality,
          description: description.trim() || undefined,
        }).catch(() => undefined);
      }}
    >
      <input
        aria-label="关系名称"
        required
        value={name}
        onChange={(event) => setName(event.target.value)}
        className={inputClass}
        placeholder="关系名称"
      />
      <div className="grid grid-cols-2 gap-2">
        <select
          aria-label="源概念"
          required
          value={sourceConceptId}
          onChange={(event) => setSourceConceptId(event.target.value)}
          className={inputClass}
        >
          {ontology.concepts.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
        <select
          aria-label="目标概念"
          required
          value={targetConceptId}
          onChange={(event) => setTargetConceptId(event.target.value)}
          className={inputClass}
        >
          {ontology.concepts.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
      </div>
      <select
        aria-label="关系基数"
        value={cardinality}
        onChange={(event) =>
          setCardinality(event.target.value as RelationValue['cardinality'])
        }
        className={inputClass}
      >
        {CARDINALITIES.map((item) => (
          <option key={item}>{item}</option>
        ))}
      </select>
      <input
        aria-label="关系描述"
        value={description}
        onChange={(event) => setDescription(event.target.value)}
        className={inputClass}
        placeholder="描述（可选）"
      />
      <FormActions busy={busy} onCancel={onCancel} label={submitLabel} />
    </form>
  );
};

const RelationRow = ({
  relation,
  ontology,
  busy,
  onMutate,
}: {
  relation: CanonicalOntology['relations'][number];
  ontology: CanonicalOntology;
  busy: boolean;
  onMutate: CanonicalOntologyEditorProps['onMutate'];
}) => {
  const [editing, setEditing] = useState(false);
  const names = new Map(ontology.concepts.map((item) => [item.id, item.name]));
  if (editing) {
    return (
      <RelationForm
        ontology={ontology}
        initial={relation}
        busy={busy}
        submitLabel="保存关系"
        onCancel={() => setEditing(false)}
        onSubmit={async (patch) => {
          await onMutate({
            type: 'relation.update',
            relationId: relation.id,
            patch,
          });
          setEditing(false);
        }}
      />
    );
  }
  return (
    <div className="flex items-start justify-between gap-3 border-b border-gray-100 pb-2">
      <div>
        <p className="text-sm font-medium text-gray-800">{relation.name}</p>
        <p className="text-xs text-gray-500">
          {names.get(relation.sourceConceptId)} →{' '}
          {names.get(relation.targetConceptId)} · {relation.cardinality}
        </p>
      </div>
      <Actions
        editing={false}
        disabled={busy}
        onEdit={() => setEditing(true)}
        onDelete={() => {
          if (window.confirm(`删除关系“${relation.name}”？`)) {
            void onMutate({
              type: 'relation.delete',
              relationId: relation.id,
            }).catch(() => undefined);
          }
        }}
      />
    </div>
  );
};
