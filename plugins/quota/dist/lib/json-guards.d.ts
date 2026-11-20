/** Small guards for reading untyped JSON (API replies, config files, stored logins). */
/** A non-null object that is not an array. */
export declare function isRecord(value: unknown): value is Record<string, unknown>;
export declare function asRecord(value: unknown): Record<string, unknown> | null;
/** The trimmed string, or undefined when it is not a string or only whitespace. */
export declare function nonEmptyString(value: unknown): string | undefined;
/** The number, or undefined when it is not a finite number (strings are not parsed). */
export declare function finiteNumber(value: unknown): number | undefined;
export declare function hasOnlyKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean;
