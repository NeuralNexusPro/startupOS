import { createPiAgentStore } from '../../../integrations/pi-agent/store';
import { initializeBuiltInTools } from '../tools';
export const useLocalPiAgentStore = createPiAgentStore(initializeBuiltInTools);
