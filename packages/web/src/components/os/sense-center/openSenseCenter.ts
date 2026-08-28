import { AppWindowManager } from '@/services/AppWindowManager';
import { SenseCenter } from './SenseCenter';

export function openSenseCenter(): string {
  return AppWindowManager.getInstance().openComponentWindow(
    'sense-center',
    '感知中心',
    SenseCenter,
    { icon: '📡' },
    {
      position: { width: 1000, height: 700 },
      constraints: { minWidth: 400, minHeight: 300 },
      metadata: { entryType: 'sense-center', entryId: 'sense-center' },
    },
  );
}
