/** Claude Console prepaid credits, using only an explicitly supplied session cookie. */
import type { ErrorFacts } from "../core/errors.js";
import type { Amount } from "../core/types.js";
export declare const CONSOLE_COOKIE_ENV = "ANTHROPIC_CONSOLE_COOKIE";
export declare const CONSOLE_ORGANIZATION_ENV = "ANTHROPIC_CONSOLE_ORGANIZATION";
type ConsoleConfig = {
    state: "none";
} | {
    state: "invalid";
} | {
    state: "configured";
    cookie: string;
    organization?: string;
};
/** As with MiMo, retain only the required cookie and reject line breaks and duplicates. */
export declare function resolveAnthropicConsoleConfig(): ConsoleConfig;
type ConsoleResult<T> = {
    success: true;
    data: T;
} | {
    success: false;
    error: string;
    facts: ErrorFacts;
};
export declare function queryAnthropicConsoleCredits(config: Extract<ConsoleConfig, {
    state: "configured";
}>, requestTimeoutMs?: number): Promise<ConsoleResult<Amount | undefined>>;
export {};
