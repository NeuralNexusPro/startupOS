import { z } from 'zod';

/** Structural decoding only; ontology feature owns all semantic validation. */
export const ontologyReferenceSchema = z.object({
  ontologyId: z.string().min(1),
  ontologyVersion: z.string().min(1),
});

export const conceptReferenceSchema = ontologyReferenceSchema.extend({
  conceptId: z.string().min(1),
});

export const factTypeReferenceSchema = conceptReferenceSchema.extend({
  factTypeId: z.string().min(1),
});

export const inputFactSchema = z.object({
  factType: factTypeReferenceSchema,
  required: z.boolean(),
});

export const actionBindingSchema = z.object({
  actionId: z.string().min(1),
  concept: conceptReferenceSchema,
});

export const agentContractSchema = z.object({
  agentId: z.string().min(1),
  ontology: ontologyReferenceSchema,
  inputs: z.array(inputFactSchema),
  outputs: z.array(inputFactSchema),
  actions: z.array(actionBindingSchema),
  permissions: z.array(z.string().min(1)),
});

export const skillContractSchema = z.object({
  skillId: z.string().min(1),
  ontology: ontologyReferenceSchema,
  inputs: z.array(inputFactSchema),
  outputs: z.array(inputFactSchema),
  actions: z.array(actionBindingSchema),
  permissions: z.array(z.string().min(1)),
});

