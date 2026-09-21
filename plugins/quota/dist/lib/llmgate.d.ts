/** LLMGate billing-overview quota client. */
import type { QuotaError } from "./types.js";
export declare const LLMGATE_ACCESS_TOKEN_METADATA_KEY = "llmgate_access_token";
export declare const LLMGATE_REFRESH_TOKEN_METADATA_KEY = "llmgate_refresh_token";
export interface LlmGateQuotaWindow {
    limit: number;
    used: number;
    remaining: number;
    percentRemaining: number;
    resetTimeIso?: string;
}
export interface LlmGateQuotaSuccess {
    success: true;
    planCode?: string;
    planName?: string;
    planStatus?: string;
    creditBalance?: number;
    windows: {
        fiveHour?: LlmGateQuotaWindow;
        weekly?: LlmGateQuotaWindow;
    };
}
export type LlmGateQuotaResult = LlmGateQuotaSuccess | QuotaError | null;
export declare function queryLlmGateQuota(options?: {
    requestTimeoutMs?: number;
}): Promise<LlmGateQuotaResult>;
export declare function hasLlmGateAuthTokens(): Promise<boolean>;
export declare function getLlmGateAuthDiagnostics(): Promise<{
    configured: boolean;
    accessTokenConfigured: boolean;
    refreshTokenConfigured: boolean;
    authPaths: string[];
}>;
//# sourceMappingURL=llmgate.d.ts.map