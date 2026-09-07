export class SequentialIdGenerator {
    counters = new Map();
    next(prefix) {
        const nextValue = (this.counters.get(prefix) ?? 0) + 1;
        this.counters.set(prefix, nextValue);
        return `${prefix}${nextValue}`;
    }
}
export function createEventId(taskId, createdAt, type) {
    const safeType = type.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "");
    return `${taskId}-${safeType}-${createdAt}`;
}
