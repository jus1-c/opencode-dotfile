/**
 * What every surface knows about each built-in provider, in display order: its names, the
 * OpenCode ids that count as it, its row keys and where its API key lives. No fetch code, so
 * the TUI may import it. The provider itself is `src/providers/<vendor>.ts`, bound to its id in
 * `src/providers/registry.ts`; the compiler checks that every id here has one.
 */
import type { ApiKeyLoginSpec } from "./api-key-resolver.js";
export interface QuotaProviderRegistrationSourceEntry {
    id: string;
    label: string;
    labelAliases?: readonly string[];
    runtimeIds: readonly string[];
    synonyms: readonly string[];
    liveLocalUsage?: true;
    /** Brand words at the start of its account names ("Claude Work" → "Work"). Default: its label. */
    groupBrands?: readonly string[];
    /**
     * The v6 row keys it may emit (`${id}.${key}` is the row id that hide, rename and order
     * settings use). `*` stands for one segment taken from provider data, such as a model, a
     * window family or a currency. Changing a key breaks users' settings.
     */
    rowKeys: readonly string[];
    /**
     * Where its API key may live (see `API_KEY_VENDORS`). `displayName` defaults to its label,
     * `authKeys` to its `providerKeys`.
     */
    apiKey?: Omit<ApiKeyLoginSpec, "displayName" | "authKeys"> & Partial<Pick<ApiKeyLoginSpec, "displayName" | "authKeys">>;
}
export declare const QUOTA_PROVIDER_REGISTRATION_SOURCE: readonly [{
    readonly id: "anthropic";
    readonly label: "Anthropic";
    readonly runtimeIds: readonly ["anthropic", "claude-code", "claude-agent"];
    readonly synonyms: readonly ["claude", "claude-code"];
    readonly groupBrands: readonly ["Claude"];
    readonly rowKeys: readonly ["five_hour", "weekly", "weekly_fable", "extra_usage"];
}, {
    readonly id: "copilot";
    readonly label: "Copilot";
    readonly runtimeIds: readonly ["copilot", "github-copilot", "copilot-chat", "github-copilot-chat"];
    readonly synonyms: readonly ["github-copilot", "copilot-chat", "github-copilot-chat"];
    readonly rowKeys: readonly ["allowance", "additional_budget"];
}, {
    readonly id: "openai";
    readonly label: "OpenAI";
    readonly runtimeIds: readonly ["openai", "chatgpt", "codex"];
    readonly synonyms: readonly [];
    readonly rowKeys: readonly ["five_hour", "weekly", "monthly", "code_review", "codex_credits", "status"];
}, {
    readonly id: "anthropic-api";
    readonly label: "Claude API";
    readonly runtimeIds: readonly ["anthropic", "claude-code", "claude-agent"];
    readonly synonyms: readonly [];
    readonly rowKeys: readonly ["balance"];
}, {
    readonly id: "openrouter";
    readonly label: "OpenRouter";
    readonly runtimeIds: readonly ["openrouter"];
    readonly synonyms: readonly [];
    readonly rowKeys: readonly ["key"];
}, {
    readonly id: "cursor";
    readonly label: "Cursor";
    readonly runtimeIds: readonly ["cursor", "cursor-acp"];
    readonly synonyms: readonly ["cursor-acp", "open-cursor", "@rama_nigg/open-cursor"];
    readonly liveLocalUsage: true;
    readonly rowKeys: readonly ["api", "auto_composer"];
}, {
    readonly id: "commandcode";
    readonly label: "Command Code";
    readonly runtimeIds: readonly ["commandcode"];
    readonly synonyms: readonly [];
    readonly rowKeys: readonly ["five_hour", "weekly"];
    readonly apiKey: {
        readonly envVars: readonly ["CMD_API_KEY"];
        readonly providerKeys: readonly ["commandcode"];
    };
}, {
    readonly id: "alibaba-coding-plan";
    readonly label: "Alibaba Coding Plan";
    readonly runtimeIds: readonly ["alibaba-coding-plan", "alibaba-coding-plan-cn", "alibaba", "alibaba-cn"];
    readonly synonyms: readonly ["alibaba", "alibaba-coding-plan-cn"];
    readonly rowKeys: readonly ["five_hour", "weekly", "monthly"];
}, {
    readonly id: "alibaba-token-plan";
    readonly label: "Alibaba Token Plan";
    readonly runtimeIds: readonly ["alibaba-token-plan", "alibaba-token-plan-cn"];
    readonly synonyms: readonly ["alibaba-token-plan-cn"];
    readonly rowKeys: readonly ["personal.monthly", "personal.weekly", "personal.five_hour", "personal.*", "team.*"];
}, {
    readonly id: "google-gemini-cli";
    readonly label: "Gemini CLI";
    readonly runtimeIds: readonly ["google-gemini-cli", "gemini-cli", "gemini", "opencode-gemini-auth", "google"];
    readonly synonyms: readonly ["gemini-cli", "google-gemini", "opencode-gemini-auth", "gemini"];
    readonly rowKeys: readonly ["pro", "flash", "flash_lite", "model.*"];
}, {
    readonly id: "google-agy";
    readonly label: "Google AGY";
    readonly runtimeIds: readonly ["google-agy", "opencode-agy-auth", "google-agy-auth"];
    readonly synonyms: readonly ["opencode-agy-auth", "google-agy-auth"];
    readonly groupBrands: readonly ["Google AGY", "AGY"];
    readonly rowKeys: readonly ["gemini.weekly", "gemini.five_hour", "claude_gpt.weekly", "claude_gpt.five_hour", "*.weekly", "*.five_hour"];
}, {
    readonly id: "zai";
    readonly label: "Z.ai";
    readonly runtimeIds: readonly ["zai", "glm", "zai-coding-plan"];
    readonly synonyms: readonly [];
    readonly rowKeys: readonly ["five_hour", "weekly", "mcp"];
    readonly apiKey: {
        readonly envVars: readonly ["ZAI_API_KEY", "ZAI_CODING_PLAN_API_KEY"];
        readonly providerKeys: readonly ["zai", "zai-coding-plan", "glm"];
        readonly authKeys: readonly ["zai-coding-plan"];
    };
}, {
    readonly id: "zhipu";
    readonly label: "Zhipu";
    readonly runtimeIds: readonly ["zhipu", "glm-coding-plan", "zhipu-coding-plan", "zhipuai-coding-plan"];
    readonly synonyms: readonly ["glm-coding-plan", "zhipu-coding-plan", "zhipuai-coding-plan"];
    readonly rowKeys: readonly ["five_hour", "weekly", "mcp"];
    readonly apiKey: {
        readonly envVars: readonly ["ZHIPU_API_KEY", "ZHIPU_CODING_PLAN_API_KEY"];
        readonly providerKeys: readonly ["zhipu", "zhipu-coding-plan", "zhipuai-coding-plan", "glm-coding-plan"];
        readonly authKeys: readonly ["zhipu-coding-plan", "zhipuai-coding-plan"];
    };
}, {
    readonly id: "minimax-coding-plan";
    readonly label: "MiniMax Token Plan";
    readonly runtimeIds: readonly ["minimax-coding-plan", "minimax"];
    readonly synonyms: readonly ["minimax"];
    readonly rowKeys: readonly ["five_hour", "weekly"];
    readonly apiKey: {
        readonly displayName: "MiniMax";
        readonly envVars: readonly ["MINIMAX_CODING_PLAN_API_KEY", "MINIMAX_API_KEY"];
        readonly providerKeys: readonly ["minimax-coding-plan", "minimax"];
        readonly authKeys: readonly ["minimax-coding-plan"];
    };
}, {
    readonly id: "minimax-china-coding-plan";
    readonly label: "MiniMax Token Plan (CN)";
    readonly labelAliases: readonly ["minimax-cn-coding-plan"];
    readonly runtimeIds: readonly ["minimax-china-coding-plan", "minimax-cn-coding-plan", "minimax-cn", "minimax-china"];
    readonly synonyms: readonly ["minimax-cn", "minimax-china", "minimax-cn-coding-plan"];
    readonly groupBrands: readonly ["MiniMax Token Plan (CN)", "MiniMax Token Plan"];
    readonly rowKeys: readonly ["five_hour", "weekly"];
    readonly apiKey: {
        readonly displayName: "MiniMax";
        readonly envVars: readonly ["MINIMAX_CHINA_CODING_PLAN_API_KEY"];
        readonly providerKeys: readonly ["minimax-china-coding-plan", "minimax-cn-coding-plan", "minimax-cn", "minimax-china"];
        readonly authKeys: readonly ["minimax-china-coding-plan", "minimax-cn-coding-plan"];
    };
}, {
    readonly id: "kimi-code-plan-global";
    readonly label: "Kimi Code";
    readonly runtimeIds: readonly ["kimi-code-plan-global"];
    readonly synonyms: readonly [];
    readonly rowKeys: readonly ["weekly", "limit.*"];
    readonly apiKey: {
        readonly displayName: "Kimi";
        readonly envVars: readonly ["KIMI_GLOBAL_API_KEY"];
        readonly providerKeys: readonly ["kimi-code-plan-global"];
    };
}, {
    readonly id: "kimi-code-plan-cn";
    readonly label: "Kimi Code (CN)";
    readonly labelAliases: readonly ["kimi-code"];
    readonly runtimeIds: readonly ["kimi-code-plan-cn", "kimi-for-coding", "kimi", "kimi-code"];
    readonly synonyms: readonly ["kimi", "kimi-for-code", "kimi-code", "kimi-for-coding"];
    readonly groupBrands: readonly ["Kimi Code (CN)", "Kimi Code"];
    readonly rowKeys: readonly ["weekly", "limit.*"];
    readonly apiKey: {
        readonly displayName: "Kimi";
        readonly envVars: readonly ["KIMI_CN_API_KEY", "KIMI_API_KEY", "KIMI_CODE_API_KEY"];
        readonly providerKeys: readonly ["kimi-code-plan-cn", "kimi-for-coding", "kimi-code", "kimi"];
    };
}, {
    readonly id: "deepseek";
    readonly label: "DeepSeek";
    readonly runtimeIds: readonly ["deepseek"];
    readonly synonyms: readonly ["deep-seek"];
    readonly rowKeys: readonly ["total_balance.*", "granted_balance.*", "topped_up_balance.*", "available"];
    readonly apiKey: {
        readonly envVars: readonly ["DEEPSEEK_API_KEY"];
        readonly providerKeys: readonly ["deepseek"];
        readonly skipBrokenLogins: true;
    };
}, {
    readonly id: "vilao";
    readonly label: "Vilao";
    readonly runtimeIds: readonly ["vilao"];
    readonly synonyms: readonly [];
    readonly rowKeys: readonly ["balance"];
}, {
    readonly id: "xai";
    readonly label: "xAI";
    readonly runtimeIds: readonly ["xai"];
    readonly synonyms: readonly [];
    readonly rowKeys: readonly ["credits"];
}, {
    readonly id: "xiaomi";
    readonly label: "Xiaomi MiMo";
    readonly runtimeIds: readonly ["xiaomi", "xiaomi-token-plan-cn", "xiaomi-token-plan-ams", "xiaomi-token-plan-sgp"];
    readonly synonyms: readonly ["xiaomi-token-plan-cn", "xiaomi-token-plan-ams", "xiaomi-token-plan-sgp"];
    readonly rowKeys: readonly ["monthly_tokens", "total_balance", "cash_balance", "gift_balance"];
}, {
    readonly id: "opencode-go";
    readonly label: "OpenCode Go";
    readonly runtimeIds: readonly ["opencode-go"];
    readonly synonyms: readonly ["opencode-go-subscription"];
    readonly rowKeys: readonly ["five_hour", "weekly", "monthly"];
    readonly apiKey: {
        readonly envVars: readonly ["OPENCODE_API_KEY"];
        readonly providerKeys: readonly ["opencode-go", "opencode"];
        readonly keyLoginsOnly: true;
        readonly unsupportedTypeError: "OpenCode Go auth entry has unsupported type";
    };
}, {
    readonly id: "opencode";
    readonly label: "OpenCode Zen";
    readonly runtimeIds: readonly ["opencode", "opencode-zen"];
    readonly synonyms: readonly ["opencode-zen"];
    readonly rowKeys: readonly ["monthly", "balance", "auto_reload"];
}, {
    readonly id: "ollama-cloud";
    readonly label: "Ollama Cloud";
    readonly runtimeIds: readonly ["ollama-cloud"];
    readonly synonyms: readonly [];
    readonly rowKeys: readonly ["session", "weekly", "monthly", "purchased"];
    readonly apiKey: {
        readonly envVars: readonly ["OLLAMA_API_KEY"];
        readonly providerKeys: readonly ["ollama-cloud"];
        readonly skipBrokenLogins: true;
    };
}, {
    readonly id: "quota-providers";
    readonly label: "Custom providers";
    readonly runtimeIds: readonly [];
    readonly synonyms: readonly [];
    readonly rowKeys: readonly ["custom.*.*"];
}];
export type CanonicalQuotaProviderId = (typeof QUOTA_PROVIDER_REGISTRATION_SOURCE)[number]["id"];
