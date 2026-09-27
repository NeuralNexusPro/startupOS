import { describe, expect, it } from 'vitest';

import { semanticKindLabel, suggestSemanticKind } from './semantic-kind';

describe('semantic concept presentation', () => {
  it('uses Chinese business labels and keeps missing categories pending', () => {
    expect(semanticKindLabel('activity')).toBe('业务活动');
    expect(semanticKindLabel()).toBe('待分类');
  });

  it('offers only a preview suggestion for an unclassified name', () => {
    expect(suggestSemanticKind('客户')).toBe('role');
    expect(suggestSemanticKind('订单')).toBe('document');
    expect(suggestSemanticKind('库存')).toBe('object');
  });
});
