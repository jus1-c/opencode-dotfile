/**
 * Google AGY and Gemini CLI quota requests reuse the OAuth client of the
 * companion OpenCode plugin that created the login. This module finds that
 * plugin and reads its client id and secret.
 */
export type GoogleCompanionPresence = {
    state: "present";
    importSpecifier: string;
    resolvedPath: string;
} | {
    state: "missing";
    importSpecifier: string;
    error: string;
} | {
    state: "invalid";
    importSpecifier: string;
    error: string;
    resolvedPath?: string;
};
export type GoogleCompanionConfiguredCredentials = {
    state: "configured";
    clientId: string;
    clientSecret: string;
    resolvedPath: string;
};
type GoogleCompanionClientCredentials = GoogleCompanionConfiguredCredentials | {
    state: "missing" | "invalid";
    error: string;
    resolvedPath?: string;
};
export type GoogleCompanionResolver = {
    inspect: () => Promise<GoogleCompanionPresence>;
    resolveCredentials: () => Promise<GoogleCompanionClientCredentials>;
    clearCacheForTests: () => void;
};
export declare const agyCompanion: GoogleCompanionResolver;
export declare const geminiCliCompanion: GoogleCompanionResolver;
export {};
