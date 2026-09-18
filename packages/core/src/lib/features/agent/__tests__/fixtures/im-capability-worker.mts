import readline from 'node:readline';
import { createChannelOfficeCapabilityWorkerFallback } from '../../../../integrations/pi-agent/channel-office-capabilities';

const pending = new Map<string, (result: string) => void>();
const input = readline.createInterface({ input: process.stdin });
input.on('line', line => {
  const message = JSON.parse(line) as { toolCallId: string; result: string };
  pending.get(message.toolCallId)?.(message.result);
  pending.delete(message.toolCallId);
});
const port = createChannelOfficeCapabilityWorkerFallback((toolCallId, toolName, args) => new Promise(resolve => {
  pending.set(toolCallId, resolve);
  process.stdout.write(`${JSON.stringify({ type: 'host_tool_call', toolCallId, toolName, args })}\n`);
}));
const result = await port.discover('calendar');
process.stdout.write(`${JSON.stringify({ type: 'done', result })}\n`);
input.close();
