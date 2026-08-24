/**
 * Skill-only recovery for a model turn that terminates without text or a
 * tool call. This is deliberately structural: it never judges whether a
 * response is semantically complete.
 */
export function resolveEmptyStopRecoveryEnabled(
	agentType?: string,
	configured?: boolean,
): boolean {
	if (configured !== undefined) {
		return configured;
	}
	return agentType === "skill";
}

export function buildEmptyStopRecoveryMessage(attempt: number): string {
	return `[Internal empty-stop recovery] Recovery attempt ${attempt} of 1. The previous assistant turn ended with an empty response and no tool call. Continue the current user request now.`;
}
