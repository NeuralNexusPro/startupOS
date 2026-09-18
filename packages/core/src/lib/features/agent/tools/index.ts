import { initializeGenericTools, registerTool } from '../../../integrations/pi-agent/tools';
import { sendFileTool } from './send-file';
import { documentTools } from './document-tools';
import { ontologyTools } from './ontology-tools';
import { ontologyDataTools } from './ontology-data-tools';
import { scheduleTools } from './schedule-tools';
import { imCapabilityTools } from './im-capabilities';
export * from '../../../integrations/pi-agent/tools';
export * from './document-tools';
export * from './ontology-tools';
export * from './ontology-data-tools';
export * from './schedule-tools';
export * from './im-capabilities';
let initialized = false;
export function initializeBuiltInTools(): void {
  initializeGenericTools();
  if (initialized) return;
  [sendFileTool, ...imCapabilityTools, ...documentTools, ...ontologyTools, ...ontologyDataTools, ...scheduleTools].forEach(registerTool);
  initialized = true;
}
