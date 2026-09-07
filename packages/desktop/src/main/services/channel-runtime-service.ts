import {
  BindingChannelMessageIngress,
  ChannelRuntimeRegistry,
  ChannelSessionBindingStore,
  SessionSerializingChannelRuntime,
  registerAgentFamilyRuntimes,
  type ChannelSessionProvisionerPort,
} from '../../../../core/src/modules/channel-runtime';
import type { ChannelSessionMessageStorePort, ChannelSessionResolverPort } from '../../../../core/src/modules/channel-runtime/runtime-adapter';
import { CollaborationChannelRuntimeAdapter, type CollaborationChannelBackendPort } from '../../../../core/src/modules/collaboration-runtime/integrations/channel-runtime-adapter';
import { routeAgentSessionUserMessage, type AgentTaskRuntimeIpcController } from './agent-task-runtime-ipc';

export interface DesktopChannelRuntimeDependencies {
  dataRoot: string;
  agentGateway: ChannelSessionProvisionerPort & ChannelSessionResolverPort & ChannelSessionMessageStorePort;
  collaborationBackend: CollaborationChannelBackendPort;
}

export function composeDesktopChannelRuntime(dependencies: DesktopChannelRuntimeDependencies): {
  ingress: BindingChannelMessageIngress;
  registry: ChannelRuntimeRegistry;
  bindings: ChannelSessionBindingStore;
} {
  const registry = new ChannelRuntimeRegistry();
  registerAgentFamilyRuntimes(registry, dependencies.agentGateway, dependencies.agentGateway);
  registry.register('project-multi-agent', new CollaborationChannelRuntimeAdapter(dependencies.collaborationBackend));
  const bindings = new ChannelSessionBindingStore(dependencies.dataRoot);
  const coordinatedRuntime = new SessionSerializingChannelRuntime(registry);
  return {
    registry,
    bindings,
    ingress: new BindingChannelMessageIngress(bindings, {
      provision: async (input) => input.target.kind === 'project-multi-agent'
        ? dependencies.collaborationBackend.resolveSession(input)
        : dependencies.agentGateway.provision(input),
    }, coordinatedRuntime),
  };
}

export async function createDefaultDesktopChannelRuntime(
  taskRuntimeIpc?: AgentTaskRuntimeIpcController,
): Promise<ReturnType<typeof composeDesktopChannelRuntime>> {
  const [agentFeature, launcher, manager, paths, channelGateway, collaborationBackend] = await Promise.all([
    import('../../../../core/src/lib/features/agent'),
    import('../../../../core/src/lib/features/services/launcher'),
    import('../../../../core/src/lib/integrations/pi-agent/agent-manager'),
    import('../../../../core/src/lib/paths'),
    import('../../../../core/src/modules/channel-runtime/pi-agent-session-gateway'),
    import('../../../../core/src/modules/collaboration-runtime/integrations/facade-channel-backend'),
  ]);
  const agentGateway = new channelGateway.PiAgentChannelSessionGateway({
    launch: launcher.launch,
    getSession: (sessionId, projectId) => agentFeature.agentSessionService.getSession(sessionId, projectId),
    addMessage: (sessionId, message, projectId) => agentFeature.agentSessionService.addMessage(sessionId, message, projectId),
    getOrRestoreRuntime: async (session) => {
      const agent = await manager.agentManager.getOrRestoreAgentRuntime(session);
      return {
        prompt: (message) => agent.prompt(message),
        subscribe: (listener) => agent.subscribe((event) => listener(event)),
        abort: () => agent.abort(),
      };
    },
    ...(taskRuntimeIpc ? {
      executeMessage: async (session, content, promptChat) => {
        await routeAgentSessionUserMessage({
          controller: taskRuntimeIpc,
          session,
          content,
          promptChat: async () => {
            taskRuntimeIpc.setUserMessagePending(session.sessionId, true);
            try {
              await promptChat();
            } finally {
              taskRuntimeIpc.setUserMessagePending(session.sessionId, false);
            }
          },
        });
      },
    } : {}),
  });
  return composeDesktopChannelRuntime({
    dataRoot: paths.getDataRoot(),
    agentGateway,
    collaborationBackend: collaborationBackend.facadeCollaborationChannelBackend,
  });
}
