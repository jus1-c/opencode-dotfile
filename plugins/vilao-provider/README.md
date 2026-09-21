# OpenCode Vilao Provider

Adds the `vilao` provider to OpenCode. `/connect` asks for a Vilao PAT and API
key, verifies the masked API-key record, then exposes active subscriptions as
`<provider_prefix>/<model_id>` through `https://api.vilao.ai/v1`.

Subscription data refreshes on provider model discovery after a five-minute
TTL. Temporary refresh failures keep the last successful catalog.

Vilao's subscription response currently omits token limits. Models therefore
use conservative defaults of 128,000 context and 8,192 output tokens until you
set exact values with `/vilao-model`.

## Install locally

```sh
npm install
npm run build
opencode plugin ./vilao-provider -g
```

The install command registers both `./server` and `./tui` package targets. Quit
and restart OpenCode after installation or model-override changes.

## Use

1. Run `/connect` and select **Vilao**.
2. Enter PAT and full API key.
3. Run `/models` and select a prefixed Vilao model.
4. Run `/vilao-model` to edit global name, context/input/output limits, or
   capability overrides.

Overrides are stored at
`$XDG_CONFIG_HOME/opencode/vilao-model-overrides.json`, falling back to
`~/.config/opencode/vilao-model-overrides.json`.
