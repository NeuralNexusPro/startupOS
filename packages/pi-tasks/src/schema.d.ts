export type Schema = Record<string, unknown> & {
    optional?: true;
};
export declare const Type: {
    Object(properties: Record<string, Schema>): Schema;
    String(options?: Record<string, unknown>): Schema;
    Number(options?: Record<string, unknown>): Schema;
    Boolean(options?: Record<string, unknown>): Schema;
    Array(item: Schema, options?: Record<string, unknown>): Schema;
    Optional(schema: Schema): Schema;
    Enum(values: readonly string[], options?: Record<string, unknown>): Schema;
};
