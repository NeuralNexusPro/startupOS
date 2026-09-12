/**
 * Compile anchor for packaged multi-agent worker runtime dependencies.
 *
 * The agent worker loads these modules via dynamic absolute imports at runtime,
 * so TypeScript/electron-builder cannot discover them from the normal static
 * desktop entry graph. Keeping this file in the desktop tsconfig include set
 * forces the required core modules to be emitted into dist-electron/core/src.
 */

import '../../../core/src/lib/integrations/pi-agent/cognitive/knowledge-provider';
import '../../../core/src/lib/integrations/pi-agent/cognitive/manager';
import '../../../core/src/lib/features/agent/cognitive/pattern/index';
import '../../../core/src/lib/integrations/pi-agent/cognitive/practice-logger';
import '../../../core/src/lib/integrations/pi-agent/cognitive/sleep-compute';
import '../../../core/src/lib/integrations/pi-agent/core/agent';
import '../../../core/src/lib/integrations/pi-agent/persistent-agent';
import '../../../core/src/lib/integrations/pi-agent/project-agent/collaboration-prompt';
import '../../../core/src/lib/integrations/pi-agent/project-agent/project-collaboration-context';
import '../../../core/src/lib/integrations/pi-agent/project-agent/project-context';
import '../../../core/src/lib/integrations/pi-agent/project-agent/project-prompt';
import '../../../core/src/lib/integrations/pi-agent/server-config';
import '../../../core/src/lib/integrations/pi-agent/tools/index';
import '../../../core/src/lib/integrations/pi-agent/tools/context';
import '../../../core/src/modules/collaboration-runtime/engine/agent-context-writer';
import '../../../core/src/modules/collaboration-runtime/session/blackboard';
import '../../../core/src/modules/memory-core/index';
import '../../../core/src/modules/memory-core/session/memory-provider';
import '../../../core/src/modules/memory-core/tools/archival-memory-tools';
import '../../../core/src/modules/memory-core/tools/core-memory-tools';

import '../../../core/src/lib/features/agent/server/index';
