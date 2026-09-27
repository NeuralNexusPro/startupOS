import { describe, expect, it } from 'vitest';

import { semanticKindLabel, suggestSemanticKind } from './semantic-kind';

describe('semantic concept presentation', () => {
  it('uses Chinese business labels and keeps missing categories pending', () => {
    expect(semanticKindLabel('activity')).toBe('业务活动');
    expect(semanticKindLabel()).toBe('待分类');
  });

  it('offers only a preview suggestion for an unclassified name', () => {
    expect(suggestSemanticKind('客户')).toBe('organization');
    expect(suggestSemanticKind('订单')).toBe('object');
    expect(suggestSemanticKind('库存')).toBe('object');
    expect(suggestSemanticKind('8D 报告')).toBe('document');
  });
});
