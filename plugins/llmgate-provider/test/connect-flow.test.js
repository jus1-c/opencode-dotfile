import assert from "node:assert/strict";
import test from "node:test";

import {
  decryptSavedLogin,
  encryptSavedLogin,
  LLMGateProviderPlugin,
  parseSavedLogin,
  recoverGatewayKey,
} from "../index.js";

test("parses only complete saved keychain logins", () => {
  assert.deepEqual(
    parseSavedLogin(JSON.stringify({ username: "person@example.com", password: "correct horse battery staple" })),
    { username: "person@example.com", password: "correct horse battery staple" },
  );
  assert.equal(parseSavedLogin(JSON.stringify({ username: "person@example.com" })), undefined);
  assert.equal(parseSavedLogin("not json"), undefined);
});

test("encrypts saved logins with the device identifier", () => {
  const login = {
    username: "person@example.com",
    password: "saved-password",
    selectedApiKeyId: "selected-key",
  };
  const encrypted = encryptSavedLogin(login, "test-device-id");

  assert.equal(JSON.stringify(encrypted).includes(login.username), false);
  assert.equal(JSON.stringify(encrypted).includes(login.password), false);
  assert.deepEqual(decryptSavedLogin(encrypted, "test-device-id"), login);
  assert.equal(decryptSavedLogin(encrypted, "other-device-id"), undefined);
});

test("restores only the previously selected active API key", async () => {
  let revealed;
  let saved;
  const gatewayKey = await recoverGatewayKey({
    login: { username: "person@example.com", password: "saved-password" },
    selectedApiKeyId: "selected-key",
    requestLoginFn: async (username, password) => {
      assert.equal(username, "person@example.com");
      assert.equal(password, "saved-password");
      return { accessToken: "session-token" };
    },
    listApiKeysFn: async (accessToken) => {
      assert.equal(accessToken, "session-token");
      return [{ id: "other-key" }, { id: "selected-key" }];
    },
    revealApiKeyFn: async (accessToken, id) => {
      revealed = { accessToken, id };
      return "restored-gateway-key";
    },
    saveGatewayKeyFn: async (key) => {
      saved = key;
    },
  });

  assert.equal(gatewayKey, "restored-gateway-key");
  assert.deepEqual(revealed, { accessToken: "session-token", id: "selected-key" });
  assert.equal(saved, "restored-gateway-key");
});

test("does not select a different API key during recovery", async () => {
  let revealed = false;
  const gatewayKey = await recoverGatewayKey({
    login: { username: "person@example.com", password: "saved-password" },
    selectedApiKeyId: "selected-key",
    requestLoginFn: async () => ({ accessToken: "session-token" }),
    listApiKeysFn: async () => [{ id: "other-key" }],
    revealApiKeyFn: async () => {
      revealed = true;
      return "wrong-gateway-key";
    },
  });

  assert.equal(gatewayKey, undefined);
  assert.equal(revealed, false);
});

test("does not attempt login without a selected API key", async () => {
  let requested = false;
  const gatewayKey = await recoverGatewayKey({
    login: { username: "person@example.com", password: "saved-password" },
    requestLoginFn: async () => {
      requested = true;
      return { accessToken: "session-token" };
    },
  });

  assert.equal(gatewayKey, undefined);
  assert.equal(requested, false);
});

test("does not load keychain credentials or models after OpenCode logout", async () => {
  const plugin = await LLMGateProviderPlugin();

  assert.deepEqual(await plugin.auth.loader(async () => undefined), {});
  assert.deepEqual(await plugin.provider.models({ models: { stale: {} } }, {}), {});

  const config = {};
  await plugin.config(config);
  assert.deepEqual(config.provider.llmgate.models, {});
});

test("connect uses an OAuth callback and leaves login fields out of OpenCode prompts", async () => {
  const plugin = await LLMGateProviderPlugin();
  const method = plugin.auth.methods[0];

  assert.equal(method.type, "oauth");
  assert.equal(method.prompts, undefined);

  const authorization = await method.authorize();
  const selectorUrl = new URL(authorization.url);
  assert.equal(selectorUrl.protocol, "http:");
  assert.equal(selectorUrl.hostname, "127.0.0.1");
  assert.equal(authorization.method, "auto");

  const page = await fetch(authorization.url);
  const html = await page.text();
  assert.equal(page.status, 200);
  assert.match(html, /type="password"/u);
  assert.match(html, /never in OpenCode auth data/u);

  const cancelled = await fetch(`${selectorUrl.origin}/cancel?${selectorUrl.searchParams}`, {
    method: "POST",
  });
  assert.equal(cancelled.status, 200);
  await assert.rejects(authorization.callback(), /LLMGate sign-in cancelled/u);
});
