import assert from "node:assert/strict";
import test from "node:test";

import { VilaoProviderPlugin } from "../server.js";
import { VilaoTuiPlugin } from "../tui.js";

const apiKey = "sk-fake-middle-1234";
const pat = "pat-fake";

function createContext() {
  let providerTransform: ((editor: any) => void) | undefined;
  let method: any;
  let provider: any;
  let models: any[] = [];
  const history: string[][] = [];
  const notices: Array<{ name: string; data: any }> = [];
  let onNotice: (() => Promise<void>) | undefined;
  let activeConnection: any = { type: "credential", id: "cred-test", label: "Vilao", method: "key" };
  let activeCredential: any = { type: "key", key: apiKey, metadata: { vilao_pat: pat } };
  let resolveError: Error | undefined;
  const events: Array<{ event: any; done: () => void }> = [];
  let waiting: ((value: { event: any; done: () => void } | undefined) => void) | undefined;

  const ctx = {
    provider: {
      async transform(callback: (editor: any) => void) { providerTransform = callback; },
      async reload() {
        provider = { id: "vilao", name: "Vilao", settings: {}, activation: "disabled" };
        models = [];
        providerTransform?.({
          get: () => ({ provider }),
          update: (_id: string, update: (value: any) => void) => update(provider),
          models: { set: (_id: string, value: any[]) => { models = value; } },
        });
        history.push(models.map((model) => model.id));
      },
    },
    integration: {
      async transform(callback: (editor: any) => void) {
        callback({
          get: () => ({ id: "vilao" }),
          method: { update: (value: any) => { method = value.method; } },
        });
      },
      connection: {
        async active() { return activeConnection; },
        async resolve() {
          if (resolveError) throw resolveError;
          return activeCredential;
        },
      },
    },
    event: {
      async *subscribe({ signal }: { signal: AbortSignal }) {
        signal.addEventListener("abort", () => waiting?.(undefined), { once: true });
        while (!signal.aborted) {
          const item = events.shift() ?? await new Promise<typeof events[number] | undefined>((resolve) => { waiting = resolve; });
          waiting = undefined;
          if (!item) return;
          try { yield item.event; } finally { item.done(); }
        }
      },
    },
    rpc: {
      async register() {
        return { events: { async emit(name: string, data: any) { notices.push({ name, data }); await onNotice?.(); } } };
      },
    },
  };
  return {
    ctx,
    get method() { return method; },
    get provider() { return provider; },
    get models() { return models; },
    get history() { return history; },
    get notices() { return notices; },
    setCredential(value: any, id = "cred-test") {
      activeConnection = value ? { type: "credential", id, label: "Vilao", method: "key" } : undefined;
      activeCredential = value;
    },
    setResolveError(error: Error | undefined) { resolveError = error; },
    setNoticeHandler(handler: () => Promise<void>) { onNotice = handler; },
    emit(event: any) {
      return new Promise<void>((done) => {
        const item = { event, done };
        if (waiting) waiting(item);
        else events.push(item);
      });
    },
  };
}

function isolateLegacyFiles(t: test.TestContext) {
  const configHome = process.env.XDG_CONFIG_HOME;
  const dataHome = process.env.XDG_DATA_HOME;
  process.env.XDG_CONFIG_HOME = `/tmp/opencode/vilao-v2-config-${process.pid}`;
  process.env.XDG_DATA_HOME = `/tmp/opencode/vilao-v2-data-${process.pid}`;
  t.after(() => {
    if (configHome === undefined) delete process.env.XDG_CONFIG_HOME;
    else process.env.XDG_CONFIG_HOME = configHome;
    if (dataHome === undefined) delete process.env.XDG_DATA_HOME;
    else process.env.XDG_DATA_HOME = dataHome;
  });
}

function catalogResponse(mask: string, prefix = "jet") {
  return new Response(JSON.stringify({ data: [{
    id: "key-id", key_prefix: mask, active: true,
    subscriptions: [{
      active: true, model_active: true, provider_active: true, provider_model_active: true,
      provider_prefix: prefix, model_id: "model",
    }],
  }] }), { status: 200 });
}

test("V2 connect distinguishes the PAT from the LLM API key", async (t) => {
  isolateLegacyFiles(t);
  const fixture = createContext();
  fixture.setCredential(undefined);
  const cleanup = await VilaoProviderPlugin.setup(fixture.ctx);
  t.after(cleanup);

  assert.equal(fixture.method.label, "Vilao LLM API key");
  assert.deepEqual(fixture.method.form, [
    { type: "string", key: "vilao_pat", title: "Vilao PAT", placeholder: "pat-...", required: true },
  ]);
});

test("V2 provider loads subscriptions using the active connection", async (t) => {
  isolateLegacyFiles(t);
  t.mock.method(globalThis, "fetch", async (input, init) => {
    assert.equal(String(input), "https://vilao.ai/api/v2/llm/keys");
    assert.equal((init?.headers as Record<string, string>).Authorization, `Bearer ${pat}`);
    return new Response(JSON.stringify({ data: [{
      id: "key-id",
      key_prefix: "sk-fake...1234",
      active: true,
      subscriptions: [{
        active: true,
        model_active: true,
        provider_active: true,
        provider_model_active: true,
        provider_prefix: "jet",
        model_id: "kimi-k3.1-pro",
        model_options: { supports_tools: true },
      }],
    }] }), { status: 200, headers: { "Content-Type": "application/json" } });
  });
  const fixture = createContext();
  const cleanup = await VilaoProviderPlugin.setup(fixture.ctx);
  t.after(cleanup);

  assert.equal(fixture.provider.activation, "enabled");
  assert.equal(fixture.provider.settings.apiKey, apiKey);
  assert.equal(fixture.provider.settings.baseURL, "https://api.vilao.ai/v1");
  assert.deepEqual(fixture.models.map((model) => model.id), ["jet/kimi-k3.1-pro"]);
});

test("switching to a rejected PAT does not retain the previous account's models", async (t) => {
  isolateLegacyFiles(t);
  const warn = t.mock.method(console, "warn", () => {});
  t.mock.method(globalThis, "fetch", async (_input, init) => {
    if ((init?.headers as Record<string, string>).Authorization !== `Bearer ${pat}`) {
      return new Response(JSON.stringify({ error: { code: "auth/invalid-token" } }), { status: 401 });
    }
    return new Response(JSON.stringify({ data: [{
      id: "key-id", key_prefix: "sk-fake...1234", active: true,
      subscriptions: [{
        active: true, model_active: true, provider_active: true, provider_model_active: true,
        provider_prefix: "jet", model_id: "kimi-k3.1-pro",
      }],
    }] }), { status: 200 });
  });
  const fixture = createContext();
  const cleanup = await VilaoProviderPlugin.setup(fixture.ctx);
  t.after(cleanup);
  assert.deepEqual(fixture.models.map((model) => model.id), ["jet/kimi-k3.1-pro"]);

  fixture.setCredential({ type: "key", key: apiKey, metadata: { vilao_pat: "pat-rejected" } }, "cred-next");
  await fixture.emit({ type: "credential.switched", data: { integrationID: "vilao" } });

  assert.equal(fixture.provider.activation, "disabled");
  assert.deepEqual(fixture.models, []);
  assert.deepEqual(fixture.notices, [{ name: "error", data: { code: "pat_rejected" } }]);
  assert.equal(JSON.stringify(warn.mock.calls).includes("pat-rejected"), false);
  assert.equal(JSON.stringify(warn.mock.calls).includes(apiKey), false);
});

test("a slow refresh cannot publish models after another account becomes active", async (t) => {
  isolateLegacyFiles(t);
  let releaseSlow!: () => void;
  let markSlowStarted!: () => void;
  const slowStarted = new Promise<void>((resolve) => { markSlowStarted = resolve; });
  const waitForSlow = new Promise<void>((resolve) => { releaseSlow = resolve; });
  t.mock.method(globalThis, "fetch", async (_input, init) => {
    const authorization = (init?.headers as Record<string, string>).Authorization;
    if (authorization === "Bearer pat-slow") {
      markSlowStarted();
      await waitForSlow;
    }
    const record = authorization === "Bearer pat-slow"
      ? { key_prefix: "sk-slow...2222", provider_prefix: "slow" }
      : authorization === "Bearer pat-current"
        ? { key_prefix: "sk-current...3333", provider_prefix: "current" }
        : { key_prefix: "sk-fake...1234", provider_prefix: "initial" };
    return new Response(JSON.stringify({ data: [{
      id: "key-id", key_prefix: record.key_prefix, active: true,
      subscriptions: [{
        active: true, model_active: true, provider_active: true, provider_model_active: true,
        provider_prefix: record.provider_prefix, model_id: "model",
      }],
    }] }), { status: 200 });
  });
  const fixture = createContext();
  const cleanup = await VilaoProviderPlugin.setup(fixture.ctx);
  t.after(cleanup);

  fixture.setCredential({ type: "key", key: "sk-slow-middle-2222", metadata: { vilao_pat: "pat-slow" } }, "cred-slow");
  const slowEvent = fixture.emit({ type: "credential.switched", data: { integrationID: "vilao" } });
  await slowStarted;
  fixture.setCredential({ type: "key", key: "sk-current-middle-3333", metadata: { vilao_pat: "pat-current" } }, "cred-current");
  const historyStart = fixture.history.length;
  const currentEvent = fixture.emit({ type: "credential.switched", data: { integrationID: "vilao" } });
  releaseSlow();
  await Promise.all([slowEvent, currentEvent]);

  assert.equal(fixture.history.slice(historyStart).some((ids) => ids.includes("slow/model")), false);
  assert.deepEqual(fixture.models.map((model) => model.id), ["current/model"]);
});

test("a rejected request from the previous account does not notify the current account", async (t) => {
  isolateLegacyFiles(t);
  t.mock.method(console, "warn", () => {});
  let releaseSlow!: () => void;
  let markSlowStarted!: () => void;
  const slowStarted = new Promise<void>((resolve) => { markSlowStarted = resolve; });
  const waitForSlow = new Promise<void>((resolve) => { releaseSlow = resolve; });
  t.mock.method(globalThis, "fetch", async (_input, init) => {
    const authorization = (init?.headers as Record<string, string>).Authorization;
    if (authorization === "Bearer pat-slow") {
      markSlowStarted();
      await waitForSlow;
      return new Response(JSON.stringify({ error: { message: "pat-slow" } }), { status: 401 });
    }
    const mask = authorization === "Bearer pat-current" ? "sk-current...3333" : "sk-fake...1234";
    return new Response(JSON.stringify({ data: [{ id: "key-id", key_prefix: mask, active: true, subscriptions: [] }] }), { status: 200 });
  });
  const fixture = createContext();
  const cleanup = await VilaoProviderPlugin.setup(fixture.ctx);
  t.after(cleanup);

  fixture.setCredential({ type: "key", key: "sk-slow-middle-2222", metadata: { vilao_pat: "pat-slow" } }, "cred-slow");
  const slowEvent = fixture.emit({ type: "credential.switched", data: { integrationID: "vilao" } });
  await slowStarted;
  fixture.setCredential({ type: "key", key: "sk-current-middle-3333", metadata: { vilao_pat: "pat-current" } }, "cred-current");
  const currentEvent = fixture.emit({ type: "credential.switched", data: { integrationID: "vilao" } });
  releaseSlow();
  await Promise.all([slowEvent, currentEvent]);

  assert.deepEqual(fixture.notices, []);
  assert.equal(fixture.provider.settings.apiKey, "sk-current-middle-3333");
});

test("credential resolution failures leave the provider disabled and report a safe error", async (t) => {
  isolateLegacyFiles(t);
  const warn = t.mock.method(console, "warn", () => {});
  const fixture = createContext();
  fixture.setResolveError(new Error("pat-fake sk-fake-middle-1234"));
  let cleanup: (() => void) | undefined;
  await assert.doesNotReject(async () => { cleanup = await VilaoProviderPlugin.setup(fixture.ctx); });
  t.after(() => cleanup?.());

  assert.equal(fixture.provider.activation, "disabled");
  assert.deepEqual(fixture.models, []);
  assert.deepEqual(fixture.notices, [{ name: "error", data: { code: "unavailable" } }]);
  assert.equal(JSON.stringify(warn.mock.calls).includes(pat), false);
  assert.equal(JSON.stringify(warn.mock.calls).includes(apiKey), false);
});

test("missing PAT disables the provider without sending the LLM key", async (t) => {
  isolateLegacyFiles(t);
  t.mock.method(console, "warn", () => {});
  t.mock.method(globalThis, "fetch", async () => { assert.fail("fetch must not be called"); });
  const fixture = createContext();
  fixture.setCredential({ type: "key", key: apiKey, metadata: {} });
  const cleanup = await VilaoProviderPlugin.setup(fixture.ctx);
  t.after(cleanup);

  assert.equal(fixture.provider.activation, "disabled");
  assert.deepEqual(fixture.models, []);
  assert.deepEqual(fixture.notices, [{ name: "error", data: { code: "missing_pat" } }]);
});

test("missing LLM key is not reported as a missing PAT", async (t) => {
  isolateLegacyFiles(t);
  t.mock.method(console, "warn", () => {});
  t.mock.method(globalThis, "fetch", async () => { assert.fail("fetch must not be called"); });
  const fixture = createContext();
  fixture.setCredential({ type: "key", key: "", metadata: { vilao_pat: pat } });
  const cleanup = await VilaoProviderPlugin.setup(fixture.ctx);
  t.after(cleanup);

  assert.equal(fixture.provider.activation, "disabled");
  assert.deepEqual(fixture.notices, [{ name: "error", data: { code: "missing_llm_key" } }]);
});

test("a PAT belonging to another LLM key reports a mismatch", async (t) => {
  isolateLegacyFiles(t);
  t.mock.method(console, "warn", () => {});
  t.mock.method(globalThis, "fetch", async () => catalogResponse("sk-other...9999"));
  const fixture = createContext();
  const cleanup = await VilaoProviderPlugin.setup(fixture.ctx);
  t.after(cleanup);

  assert.equal(fixture.provider.activation, "disabled");
  assert.deepEqual(fixture.models, []);
  assert.deepEqual(fixture.notices, [{ name: "error", data: { code: "key_mismatch" } }]);
});

test("a malformed subscription response is not reported as a key mismatch", async (t) => {
  isolateLegacyFiles(t);
  t.mock.method(console, "warn", () => {});
  t.mock.method(globalThis, "fetch", async () => new Response("not-json", { status: 200 }));
  const fixture = createContext();
  const cleanup = await VilaoProviderPlugin.setup(fixture.ctx);
  t.after(cleanup);

  assert.equal(fixture.provider.activation, "disabled");
  assert.deepEqual(fixture.notices, [{ name: "error", data: { code: "unavailable" } }]);
});

test("a temporary server failure retains the same account's last successful models", async (t) => {
  isolateLegacyFiles(t);
  t.mock.method(console, "warn", () => {});
  let requests = 0;
  t.mock.method(globalThis, "fetch", async () => ++requests === 1
    ? catalogResponse("sk-fake...1234")
    : new Response("temporary failure", { status: 503 }));
  const fixture = createContext();
  const cleanup = await VilaoProviderPlugin.setup(fixture.ctx);
  t.after(cleanup);
  await fixture.emit({ type: "credential.updated", data: {} });

  assert.equal(fixture.provider.activation, "enabled");
  assert.deepEqual(fixture.models.map((model) => model.id), ["jet/model"]);
  assert.deepEqual(fixture.notices, [{ name: "error", data: { code: "unavailable" } }]);
});

test("revoked credentials disable models before notifying the UI", async (t) => {
  isolateLegacyFiles(t);
  t.mock.method(console, "warn", () => {});
  let requests = 0;
  t.mock.method(globalThis, "fetch", async () => ++requests === 1
    ? catalogResponse("sk-fake...1234")
    : new Response("rejected", { status: 401 }));
  const fixture = createContext();
  const cleanup = await VilaoProviderPlugin.setup(fixture.ctx);
  t.after(cleanup);
  let releaseNotice!: () => void;
  let markNoticeStarted!: () => void;
  const noticeStarted = new Promise<void>((resolve) => { markNoticeStarted = resolve; });
  const noticeReleased = new Promise<void>((resolve) => { releaseNotice = resolve; });
  fixture.setNoticeHandler(async () => { markNoticeStarted(); await noticeReleased; });
  const event = fixture.emit({ type: "credential.updated", data: {} });
  await noticeStarted;
  try {
    assert.equal(fixture.provider.activation, "disabled");
    assert.deepEqual(fixture.models, []);
  } finally {
    releaseNotice();
    await event;
  }
});

test("TUI displays a clear credential error without displaying secrets", async () => {
  let onError: ((event: any) => void) | undefined;
  const toasts: any[] = [];
  const ctx = {
    location: { directory: "/test" },
    client: { rpc: () => ({ events: { on: (_name: string, callback: (event: any) => void) => {
      onError = callback;
      return () => { onError = undefined; };
    } } }) },
    ui: { toast: { show: (value: any) => toasts.push(value) } },
    keymap: { layer: () => () => {} },
  };
  const cleanup = await VilaoTuiPlugin.setup(ctx);

  assert.equal(typeof onError, "function");
  onError?.({ location: { directory: "/test" }, data: { code: "pat_rejected" } });
  assert.deepEqual(toasts, [{ title: "Vilao", message: "Vilao PAT was rejected. Reconnect with a valid PAT.", variant: "error" }]);
  cleanup?.();
  assert.equal(onError, undefined);
});
