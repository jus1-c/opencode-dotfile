# OpenCode LLMGate Provider

Local OpenCode provider for LLMGate. `/connect` opens a local, loopback-only
sign-in page. It logs in to LLMGate, lists active API keys, reveals only the
selected key, and stores both the gateway key and saved username/password in
separate operating-system keychain entries. Later `/connect` runs can choose
the saved account to reauthenticate. OpenCode auth metadata keeps only the
login token pair for `opencode-quota`, never the username/password. The
provider exposes only models returned by the selected gateway key. It retries
temporary catalog failures, then uses a cached copy of generated model configs
for that same key. The cache contains no gateway credential or login token.

The provider merges model metadata from the gateway, `models.dev`, OpenRouter,
and LiteLLM. If merged metadata contains a more-expensive context-pricing tier,
it caps that model's context and input limits at the tier threshold. Missing or
malformed metadata leaves the gateway's native limits unchanged.
