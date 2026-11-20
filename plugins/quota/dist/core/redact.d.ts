export declare const REDACTED = "[redacted]";
/**
 * True when a text holds something shaped like a key: a known key shape, a random run of
 * letters and digits, or (outside a name: an id, model name, URL or JSON path) any run of 24+
 * of them. Any other character ends a run, so model names such as
 * "Qwen3-Coder-480B-A35B-Instruct-2507", UUIDs and version strings pass.
 */
export declare function looksSecret(text: string, { isName }: {
    isName: boolean;
}): boolean;
/**
 * Replaces, in one text, each of `secrets` and each key shape the agent tools know. A secret under
 * LONG_SECRET_LENGTH counts only as a whole token (letters, digits, `_` and `-`).
 */
export declare function secretValuesRedactor(secrets: readonly string[]): (text: string) => string;
/** A copy of a JSON value with `redact` applied to every string in it, property names too. */
export declare function redactJson(value: unknown, redact: (text: string) => string): unknown;
/** One safe line: control characters removed, credentials redacted, then cut to `maxLength`. */
export declare function safeDetail(text: string, maxLength: number): string;
/** An error's message (or any thrown value) as one safe line of at most 120 characters. */
export declare function safeErrorText(error: unknown): string;
/**
 * Text a public issue may show: control characters removed first, then the home dir as "~"
 * (found before spaces are joined), then one line with credentials as "[redacted]", email
 * addresses as "[email]", and account, team, org, user and session ids as "[id]". It is cut to
 * `maxLength` last, so a cut never leaves part of a hidden value.
 */
export declare function publicDetail(text: string, maxLength: number, homeDir?: string): string;
/** A detail's value as `publicDetail` shows it; all hidden when its key holds a secret or an id. */
export declare function publicDebugValue(key: string, value: string, maxLength: number, homeDir?: string): string;
