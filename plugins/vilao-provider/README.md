# OpenCode Vilao Provider

Adds the `vilao` provider to OpenCode. `/connect` asks for a **Vilao LLM API
key** and a **Vilao PAT**. The API key is stored as the credential; the PAT is
stored as `vilao_pat` metadata so quota reporting can read the balance. The PAT
verifies the masked API-key record, then active subscriptions are exposed as
`<provider_prefix>/<model_id>` through the OpenAI-compatible API at
`https://api.vilao.ai/v1`.

Subscription data refreshes on provider model discovery after a five-minute
TTL. Temporary refresh failures keep the last successful catalog.

Vilao's subscription response currently omits token limits. Models therefore
use defaults of 400,000 context and 32,000 output tokens until you set exact
values with `/vilao-model`. Reasoning is enabled by default, and every model
exposes `low`, `medium`, `high`, `xhigh`, and `max` effort variants.

## Install locally

```sh
npm install
npm test
```

The V2 entrypoints are `server.js`, `tui.js`, and `rpc.js`; they load from
`dist/` for catalog helpers. OpenCode reloads plugins after a config change.

## Use

1. Run `/connect` and select **Vilao**.
2. Enter the LLM API key first, then the PAT when prompted.
3. Run `/models` and select a prefixed Vilao model.
4. Run `/vilao-model` to edit global name, context/input/output limits, or
   capability overrides.

Overrides are stored at
`$XDG_CONFIG_HOME/opencode/vilao-model-overrides.json`, falling back to
`~/.config/opencode/vilao-model-overrides.json`.
