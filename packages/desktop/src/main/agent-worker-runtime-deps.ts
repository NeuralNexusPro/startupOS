/**
 * Compile anchor for packaged multi-agent worker runtime dependencies.
 *
 * The agent worker loads these modules via dynamic absolute imports at runtime,
 * so TypeScript/electron-builder cannot discover them from the normal static
 * desktop entry graph. Keeping this file in the desktop tsconfig include set
 * forces the required core modules to be emitted into the build output via
 * side-effect imports that use the @originos/core package specifier.
 */

import '@originos/core/lib/integrations/pi-agent/cognitive/knowledge-provider';
import '@originos/core/lib/integrations/pi-agent/cognitive/manager';
import '@originos/core/lib/features/agent/cognitive/pattern';
import '@originos/core/lib/integrations/pi-agent/cognitive/practice-logger';
import '@originos/core/lib/integrations/pi-agent/cognitive/sleep-compute';
import '@originos/core/lib/integrations/pi-agent/core/agent';
import '@originos/core/lib/integrations/pi-agent/persistent-agent';
import '@originos/core/lib/integrations/pi-agent/project-agent/collaboration-prompt';
import '@originos/core/lib/integrations/pi-agent/project-agent/project-collaboration-context';
import '@originos/core/lib/integrations/pi-agent/project-agent/project-context';
import '@originos/core/lib/integrations/pi-agent/project-agent/project-prompt';
import '@originos/core/lib/integrations/pi-agent/server-config';
import '@originos/core/lib/integrations/pi-agent/tools';
import '@originos/core/lib/integrations/pi-agent/tools/context';
import '@originos/core/modules/collaboration-runtime/engine/agent-context-writer';
import '@originos/core/modules/collaboration-runtime/session/blackboard';
import '@originos/core/modules/memory-core';
import '@originos/core/modules/memory-core/session/memory-provider';
import '@originos/core/modules/memory-core/tools/archival-memory-tools';
import '@originos/core/modules/memory-core/tools/core-memory-tools';

import '@originos/core/lib/features/agent/server';
