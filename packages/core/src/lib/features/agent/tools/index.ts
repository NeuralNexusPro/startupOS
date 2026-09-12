import { initializeGenericTools, registerTool } from '../../../integrations/pi-agent/tools';
import { documentTools } from './document-tools';
import { ontologyTools } from './ontology-tools';
import { ontologyDataTools } from './ontology-data-tools';
import { scheduleTools } from './schedule-tools';
export * from '../../../integrations/pi-agent/tools';
export * from './document-tools';
export * from './ontology-tools';
export * from './ontology-data-tools';
export * from './schedule-tools';
let initialized = false;
export function initializeBuiltInTools(): void {
  initializeGenericTools();
  if (initialized) return;
  [...documentTools, ...ontologyTools, ...ontologyDataTools, ...scheduleTools].forEach(registerTool);
  initialized = true;
}
