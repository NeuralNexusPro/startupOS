export interface IdGenerator {
    next(prefix: string): string;
}
export declare class SequentialIdGenerator implements IdGenerator {
    private readonly counters;
    next(prefix: string): string;
}
export declare function createEventId(taskId: string, createdAt: string, type: string): string;
