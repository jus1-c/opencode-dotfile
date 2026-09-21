import {
  buildLlmGateModelConfig,
  findModelMetadata,
  mergeLlmGateModelMetadata,
} from "./model-metadata.js";
import { createCipheriv, createDecipheriv, createHash, randomBytes, scryptSync } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

const PROVIDER_ID = "llmgate";
const DISPLAY_NAME = "LLMGate";
const BASE_URL = "https://llmgate.app/v1";
const LOGIN_URL = "https://llmgate.app/api/v1/user/login";
const API_KEY_LIST_URL = "https://llmgate.app/api/v1/apikey/list";
const API_KEY_REVEAL_URL = "https://llmgate.app/api/v1/apikey";
const MODELS_DEV_API_URL = "https://models.dev/api.json";
const MODELS_DEV_MODELS_URL = "https://models.dev/models.json";
const OPENROUTER_MODELS_URL = "https://openrouter.ai/api/v1/models";
const LITELLM_MODELS_URL =
  "https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json";
const KEYCHAIN_SERVICE = "opencode-llmgate-provider";
const KEYCHAIN_GATEWAY_ACCOUNT = "gateway-api-key";
const KEYCHAIN_LOGIN_ACCOUNT = "saved-login";
const KEYCHAIN_SELECTED_API_KEY_ACCOUNT = "selected-api-key-id";
const KEYCHAIN_AUTH_MARKER = "keychain-managed";
const SAVED_LOGIN_FILE_VERSION = 1;
const SAVED_LOGIN_FILE_NAME = "llmgate-login.v1.json";
const DEVICE_ID_PATHS = ["/etc/machine-id", "/var/lib/dbus/machine-id"];
const API_KEY_SELECTOR_TIMEOUT_MS = 10 * 60 * 1_000;
const MODEL_FETCH_ATTEMPTS = 3;
const MODEL_FETCH_RETRY_DELAY_MS = 250;
const MODEL_CACHE_VERSION = 3;
let modelMetadata;
let modelMetadataFetch;
let gatewayKeyRecovery;

async function keychainEntry(account) {
  const { Entry } = await import("@napi-rs/keyring");
  return new Entry(KEYCHAIN_SERVICE, account);
}

function savedLoginFilePath() {
  const dataRoot = process.env.XDG_DATA_HOME || join(homedir(), ".local", "share");
  return join(dataRoot, "opencode", SAVED_LOGIN_FILE_NAME);
}

function nonEmptyString(value) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function asRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function isModelCatalog(value) {
  const models = asRecord(value);
  const entries = Object.entries(models);
  return entries.length > 0 && entries.every(([id, model]) => nonEmptyString(asRecord(model).id) === id);
}

function modelCachePath(apiKey) {
  const cacheRoot = process.env.XDG_CACHE_HOME || join(homedir(), ".cache");
  const fingerprint = createHash("sha256").update(apiKey).digest("hex");
  return join(cacheRoot, "opencode", `llmgate-models-${fingerprint}.json`);
}

async function readModelCache(apiKey) {
  try {
    const cache = asRecord(JSON.parse(await readFile(modelCachePath(apiKey), "utf8")));
    const fingerprint = createHash("sha256").update(apiKey).digest("hex");
    return cache.version === MODEL_CACHE_VERSION
      && cache.fingerprint === fingerprint
      && isModelCatalog(cache.models)
      ? cache.models
      : {};
  } catch {
    return {};
  }
}

async function writeModelCache(apiKey, models) {
  if (!isModelCatalog(models)) return;

  const path = modelCachePath(apiKey);
  const temporaryPath = `${path}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`;
  const fingerprint = createHash("sha256").update(apiKey).digest("hex");
  try {
    await mkdir(dirname(path), { recursive: true, mode: 0o700 });
    await writeFile(temporaryPath, JSON.stringify({
      version: MODEL_CACHE_VERSION,
      fingerprint,
      models,
    }), { encoding: "utf8", mode: 0o600 });
    await rename(temporaryPath, path);
  } catch {
    await unlink(temporaryPath).catch(() => {});
  }
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function responseRecord(payload) {
  const root = asRecord(payload);
  return Object.keys(asRecord(root.data)).length > 0 ? asRecord(root.data) : root;
}

function responseData(payload) {
  const root = asRecord(payload);
  return root.data === undefined ? payload : root.data;
}

function tokenFrom(record, names) {
  for (const name of names) {
    const value = nonEmptyString(record[name]);
    if (value) return value;
  }
  return undefined;
}

function displayError(value) {
  return String(value ?? "").replace(/[\x00-\x1F\x7F]/g, " ").trim().slice(0, 180);
}

function passwordValue(value) {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function savedLoginCipherKey(deviceId) {
  return scryptSync(deviceId, `${KEYCHAIN_SERVICE}:saved-login:v1`, 32);
}

export function encryptSavedLogin(login, deviceId) {
  const record = asRecord(login);
  const username = nonEmptyString(record.username);
  const password = passwordValue(record.password);
  if (!username || !password || !nonEmptyString(deviceId)) {
    throw new Error("LLMGate login requires a username, password, and device identifier");
  }

  const selectedApiKeyId = apiKeyId(record.selectedApiKeyId);
  const initializationVector = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", savedLoginCipherKey(deviceId), initializationVector);
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify({
      username,
      password,
      ...(selectedApiKeyId ? { selectedApiKeyId } : {}),
    }), "utf8"),
    cipher.final(),
  ]);
  return {
    version: SAVED_LOGIN_FILE_VERSION,
    iv: initializationVector.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    ciphertext: ciphertext.toString("base64"),
  };
}

export function decryptSavedLogin(value, deviceId) {
  const record = asRecord(value);
  if (record.version !== SAVED_LOGIN_FILE_VERSION || !nonEmptyString(deviceId)) return undefined;

  try {
    const initializationVector = Buffer.from(nonEmptyString(record.iv) ?? "", "base64");
    const tag = Buffer.from(nonEmptyString(record.tag) ?? "", "base64");
    const ciphertext = Buffer.from(nonEmptyString(record.ciphertext) ?? "", "base64");
    if (initializationVector.length !== 12 || tag.length !== 16 || ciphertext.length === 0) return undefined;

    const decipher = createDecipheriv("aes-256-gcm", savedLoginCipherKey(deviceId), initializationVector);
    decipher.setAuthTag(tag);
    const login = asRecord(JSON.parse(Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8")));
    const username = nonEmptyString(login.username);
    const password = passwordValue(login.password);
    const selectedApiKeyId = apiKeyId(login.selectedApiKeyId);
    return username && password
      ? { username, password, ...(selectedApiKeyId ? { selectedApiKeyId } : {}) }
      : undefined;
  } catch {
    return undefined;
  }
}

async function readDeviceId() {
  for (const path of DEVICE_ID_PATHS) {
    try {
      const deviceId = nonEmptyString(await readFile(path, "utf8"));
      if (deviceId) return deviceId;
    } catch {
      // Try the next system device identifier.
    }
  }
  return undefined;
}

async function readSavedLoginFile() {
  const deviceId = await readDeviceId();
  if (!deviceId) return undefined;
  try {
    return decryptSavedLogin(JSON.parse(await readFile(savedLoginFilePath(), "utf8")), deviceId);
  } catch {
    return undefined;
  }
}

async function writeSavedLoginFile(login) {
  const deviceId = await readDeviceId();
  if (!deviceId) throw new Error("Unable to read a device identifier for the LLMGate saved-login file");

  const path = savedLoginFilePath();
  const temporaryPath = `${path}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`;
  try {
    await mkdir(dirname(path), { recursive: true, mode: 0o700 });
    await writeFile(temporaryPath, JSON.stringify(encryptSavedLogin(login, deviceId)), {
      encoding: "utf8",
      mode: 0o600,
    });
    await rename(temporaryPath, path);
  } catch (error) {
    await unlink(temporaryPath).catch(() => {});
    throw new Error(
      `Unable to save the LLMGate login file: ${displayError(error instanceof Error ? error.message : error)}`,
    );
  }
}

export function parseSavedLogin(value) {
  if (typeof value !== "string") return undefined;
  try {
    const record = asRecord(JSON.parse(value));
    const username = nonEmptyString(record.username);
    const password = passwordValue(record.password);
    return username && password ? { username, password } : undefined;
  } catch {
    return undefined;
  }
}

function cookieValue(headers, name) {
  const getSetCookie = headers?.getSetCookie;
  const cookies = typeof getSetCookie === "function"
    ? getSetCookie.call(headers)
    : [headers?.get?.("set-cookie")].filter(Boolean);
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`(?:^|,\\s*)${escapedName}=([^;]*)`, "u");

  for (const cookie of cookies) {
    const match = pattern.exec(cookie);
    if (match?.[1]) return match[1].trim();
  }
  return undefined;
}

async function readStoredGatewayKey() {
  try {
    return nonEmptyString((await keychainEntry(KEYCHAIN_GATEWAY_ACCOUNT)).getPassword());
  } catch {
    return undefined;
  }
}

async function saveGatewayKey(key) {
  try {
    (await keychainEntry(KEYCHAIN_GATEWAY_ACCOUNT)).setPassword(key);
  } catch (error) {
    throw new Error(
      `Unable to save the LLMGate gateway credential in the OS keychain: ${displayError(error instanceof Error ? error.message : error)}`,
    );
  }
}

async function readSelectedApiKeyId() {
  const savedLogin = await readSavedLoginFile();
  if (savedLogin?.selectedApiKeyId) return savedLogin.selectedApiKeyId;
  try {
    return apiKeyId((await keychainEntry(KEYCHAIN_SELECTED_API_KEY_ACCOUNT)).getPassword());
  } catch {
    return undefined;
  }
}

async function saveSelectedApiKeyId(id) {
  const selectedApiKeyId = apiKeyId(id);
  if (!selectedApiKeyId) throw new Error("Unable to save an invalid LLMGate API-key selection");
  const savedLogin = await readSavedLoginFile();
  if (!savedLogin) throw new Error("Unable to save an LLMGate API-key selection without a saved login");
  await writeSavedLoginFile({ ...savedLogin, selectedApiKeyId });
}

async function readSavedLogin() {
  const savedLogin = await readSavedLoginFile();
  if (savedLogin) return savedLogin;
  try {
    const legacyLogin = parseSavedLogin((await keychainEntry(KEYCHAIN_LOGIN_ACCOUNT)).getPassword());
    if (legacyLogin) await writeSavedLoginFile(legacyLogin).catch(() => {});
    return legacyLogin;
  } catch {
    return undefined;
  }
}

async function hasSavedLogin() {
  return Boolean(await readSavedLogin());
}

async function saveLogin(username, password) {
  await writeSavedLoginFile({ username, password });
}

async function requestLogin(username, password) {
  const payloads = [
    { username, password },
    { email: username, password },
  ];
  let lastError = "LLMGate login failed";

  for (const payload of payloads) {
    try {
      const response = await fetch(LOGIN_URL, {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(30_000),
      });
      const body = await response.json().catch(() => ({}));
      if (response.ok) {
        const record = responseRecord(body);
        const accessToken = tokenFrom(record, ["access_token", "accessToken", "token"]);
        if (!accessToken) {
          lastError = "LLMGate login did not return an access token";
          continue;
        }
        return {
          accessToken,
          refreshToken: tokenFrom(record, ["refresh_token", "refreshToken"])
            ?? cookieValue(response.headers, "llmgate_refresh_token"),
          expiresAt: tokenFrom(record, ["expires_at", "expiresAt", "expire_at"]),
        };
      }
      const record = responseRecord(body);
      lastError = displayError(record.message ?? record.error ?? `HTTP ${response.status}`) || lastError;
    } catch (error) {
      lastError = displayError(error instanceof Error ? error.message : error) || lastError;
    }
  }

  throw new Error(`LLMGate login failed: ${lastError}`);
}

function apiKeyId(value) {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return nonEmptyString(value);
}

async function listApiKeys(accessToken) {
  const response = await fetch(API_KEY_LIST_URL, {
    headers: { Accept: "application/json", Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(30_000),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const record = responseRecord(body);
    const detail = displayError(record.message ?? record.error ?? `HTTP ${response.status}`);
    throw new Error(`Unable to list LLMGate API keys: ${detail}`);
  }

  const entries = Array.isArray(responseData(body)) ? responseData(body) : [];
  const apiKeys = entries.flatMap((entry) => {
    const record = asRecord(entry);
    const id = apiKeyId(record.id);
    if (!id || record.is_active === false) return [];
    const name = displayError(nonEmptyString(record.name) ?? `API key ${id}`) || `API key ${id}`;
    return [{ id, name }];
  });
  if (apiKeys.length === 0) {
    throw new Error("LLMGate has no active API keys. Create or activate an API key in the LLMGate dashboard first.");
  }
  return apiKeys;
}

async function revealApiKey(accessToken, id) {
  const response = await fetch(`${API_KEY_REVEAL_URL}/${encodeURIComponent(id)}/reveal`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: "{}",
    signal: AbortSignal.timeout(30_000),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const record = responseRecord(body);
    const detail = displayError(record.message ?? record.error ?? `HTTP ${response.status}`);
    throw new Error(`Unable to reveal the selected LLMGate API key: ${detail}`);
  }

  const apiKey = tokenFrom(responseRecord(body), ["api_key", "apiKey", "key"]);
  if (!apiKey) throw new Error("LLMGate did not return the selected API key");
  return apiKey;
}

export async function recoverGatewayKey({
  login,
  selectedApiKeyId,
  requestLoginFn = requestLogin,
  listApiKeysFn = listApiKeys,
  revealApiKeyFn = revealApiKey,
  saveGatewayKeyFn = saveGatewayKey,
} = {}) {
  const savedLogin = asRecord(login);
  const username = nonEmptyString(savedLogin.username);
  const password = passwordValue(savedLogin.password);
  const selectedId = apiKeyId(selectedApiKeyId);
  if (!username || !password || !selectedId) return undefined;

  try {
    const session = await requestLoginFn(username, password);
    const apiKeys = await listApiKeysFn(session.accessToken);
    if (!Array.isArray(apiKeys) || !apiKeys.some((apiKey) => apiKey.id === selectedId)) return undefined;
    const gatewayKey = await revealApiKeyFn(session.accessToken, selectedId);
    await saveGatewayKeyFn(gatewayKey);
    return gatewayKey;
  } catch {
    return undefined;
  }
}

async function readGatewayKey() {
  const gatewayKey = await readStoredGatewayKey();
  if (gatewayKey) return gatewayKey;

  // Startup may call both config and provider hooks; recover the missing key once.
  if (!gatewayKeyRecovery) {
    gatewayKeyRecovery = (async () => recoverGatewayKey({
      login: await readSavedLogin(),
      selectedApiKeyId: await readSelectedApiKeyId(),
    }))().finally(() => {
      gatewayKeyRecovery = undefined;
    });
  }
  return gatewayKeyRecovery;
}

async function rememberSelectedApiKeyId(auth) {
  const record = asRecord(auth);
  const selectedApiKeyId = record.type === "api"
    ? apiKeyId(asRecord(record.metadata).llmgate_api_key_id)
    : undefined;
  if (selectedApiKeyId) await saveSelectedApiKeyId(selectedApiKeyId).catch(() => {});
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]);
}

function pageStyle() {
  return `<style>
      body { background: #101418; color: #edf2f7; font: 16px system-ui, sans-serif; margin: 0; }
      main { margin: 10vh auto; max-width: 34rem; padding: 0 1.5rem; }
      h1 { font-size: 1.5rem; }
      p { color: #b8c3cf; line-height: 1.5; }
      form { margin: 0.75rem 0; }
      input, button { box-sizing: border-box; font: inherit; width: 100%; }
      input { background: #1b2229; border: 1px solid #495560; border-radius: 0.5rem; color: #edf2f7; margin: 0.35rem 0 0.85rem; padding: 0.75rem; }
      button { background: #1d6fd8; border: 0; border-radius: 0.5rem; color: white; cursor: pointer; padding: 0.75rem 1rem; text-align: left; }
      button:hover { background: #2b82ee; }
      button.secondary { background: transparent; border: 1px solid #495560; color: #cdd6df; }
      button.secondary:hover { background: #1b2229; }
      label { color: #cdd6df; display: block; font-weight: 600; }
      .error { background: #5e2027; border-radius: 0.5rem; color: #ffd7dc; padding: 0.75rem 1rem; }
    </style>`;
}

function loginPage({ state, error, hasSavedLogin }) {
  const action = `/login?state=${encodeURIComponent(state)}`;
  const savedAction = `/login-saved?state=${encodeURIComponent(state)}`;
  const cancel = `/cancel?state=${encodeURIComponent(state)}`;
  const errorMessage = error ? `<p class="error">${escapeHtml(error)}</p>` : "";
  const savedLogin = hasSavedLogin ? `<form method="post" action="${escapeHtml(savedAction)}">
        <button type="submit">Sign in with saved account</button>
      </form>
      <p>Or sign in with another account:</p>` : "";

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Sign in to LLMGate</title>
    ${pageStyle()}
  </head>
  <body>
    <main>
      <h1>Sign in to LLMGate</h1>
      <p>Credentials are saved only in your operating-system keychain, never in OpenCode auth data.</p>
      ${errorMessage}
      ${savedLogin}
      <form method="post" action="${escapeHtml(action)}">
        <label>LLMGate email or username
          <input name="username" type="text" autocomplete="username" required autofocus>
        </label>
        <label>LLMGate password
          <input name="password" type="password" autocomplete="current-password" required>
        </label>
        <button type="submit">Sign in</button>
      </form>
      <form method="post" action="${escapeHtml(cancel)}">
        <button class="secondary" type="submit">Cancel</button>
      </form>
    </main>
  </body>
</html>`;
}

function selectorPage({ apiKeys, state, error }) {
  const action = `/select?state=${encodeURIComponent(state)}`;
  const cancel = `/cancel?state=${encodeURIComponent(state)}`;
  const keyButtons = apiKeys.map((apiKey) => `
    <form method="post" action="${escapeHtml(action)}">
      <button name="key_id" value="${escapeHtml(apiKey.id)}" type="submit">${escapeHtml(apiKey.name)}</button>
    </form>`).join("\n");
  const errorMessage = error ? `<p class="error">${escapeHtml(error)}</p>` : "";

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Choose LLMGate API key</title>
    ${pageStyle()}
  </head>
  <body>
    <main>
      <h1>Choose an LLMGate API key</h1>
      <p>Only active keys are shown. The selected key is stored in your operating-system keychain.</p>
      ${errorMessage}
      ${keyButtons}
      <form method="post" action="${escapeHtml(cancel)}">
        <button class="secondary" type="submit">Cancel</button>
      </form>
    </main>
  </body>
</html>`;
}

function selectorSuccessPage() {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>LLMGate key selected</title></head>
<body><p>API key selected. Return to OpenCode to finish connecting LLMGate.</p></body></html>`;
}

function sendHtml(response, status, body) {
  response.writeHead(status, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
    "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
  });
  response.end(body);
}

async function readRequestBody(request) {
  let body = "";
  for await (const chunk of request) {
    body += Buffer.from(chunk).toString("utf8");
    if (Buffer.byteLength(body) > 8_192) throw new Error("Request body is too large");
  }
  return body;
}

async function startConnectServer() {
  const state = randomBytes(32).toString("base64url");
  const savedLoginAvailable = await hasSavedLogin();
  let settled = false;
  let submitting = false;
  let login;
  let apiKeys;
  let closeServer = () => {};
  let resolveSelection;
  let rejectSelection;
  const selection = new Promise((resolve, reject) => {
    resolveSelection = resolve;
    rejectSelection = reject;
  });
  void selection.catch(() => {});
  const settle = (result) => {
    if (settled) return false;
    settled = true;
    resolveSelection(result);
    queueMicrotask(closeServer);
    return true;
  };
  const fail = (error) => {
    if (settled) return;
    settled = true;
    closeServer();
    rejectSelection(error instanceof Error ? error : new Error(String(error)));
  };

  const server = createServer((request, response) => {
    void (async () => {
      const currentPage = (error) => apiKeys
        ? selectorPage({ apiKeys, state, error })
        : loginPage({ state, error, hasSavedLogin: savedLoginAvailable });
      const requestUrl = new URL(request.url ?? "/", "http://127.0.0.1");
      if (requestUrl.searchParams.get("state") !== state) {
        sendHtml(response, 404, "Not found");
        return;
      }
      if (request.method === "GET" && requestUrl.pathname === "/") {
        sendHtml(response, 200, apiKeys
          ? selectorPage({ apiKeys, state })
          : loginPage({ state, hasSavedLogin: savedLoginAvailable }));
        return;
      }
      if (request.method !== "POST" || !["/cancel", "/login", "/login-saved", "/select"].includes(requestUrl.pathname)) {
        sendHtml(response, 404, "Not found");
        return;
      }
      if (requestUrl.pathname === "/cancel") {
        sendHtml(response, 200, selectorSuccessPage().replace("API key selected.", "LLMGate connection cancelled."));
        fail(new Error("LLMGate sign-in cancelled"));
        return;
      }
      if (submitting || settled) {
        sendHtml(response, 409, currentPage("A key is already being selected."));
        return;
      }

      const form = new URLSearchParams(await readRequestBody(request));
      if (["/login", "/login-saved"].includes(requestUrl.pathname)) {
        const savedLogin = requestUrl.pathname === "/login-saved" ? await readSavedLogin() : undefined;
        const username = savedLogin?.username ?? nonEmptyString(form.get("username"));
        const password = savedLogin?.password ?? form.get("password") ?? "";
        if (!username || !password) {
          sendHtml(response, 400, loginPage({
            state,
            hasSavedLogin: savedLoginAvailable,
            error: requestUrl.pathname === "/login-saved"
              ? "No saved LLMGate sign-in is available."
              : "LLMGate username and password are required.",
          }));
          return;
        }

        submitting = true;
        try {
          login = await requestLogin(username, password);
          await saveLogin(username, password);
          apiKeys = await listApiKeys(login.accessToken);
          sendHtml(response, 200, selectorPage({ apiKeys, state }));
        } catch (error) {
          sendHtml(response, 401, loginPage({
            state,
            hasSavedLogin: savedLoginAvailable,
            error: displayError(error instanceof Error ? error.message : error) || "Unable to sign in to LLMGate.",
          }));
        } finally {
          submitting = false;
        }
        return;
      }

      if (!login || !apiKeys) {
        sendHtml(response, 409, loginPage({
          state,
          hasSavedLogin: savedLoginAvailable,
          error: "Sign in before choosing an API key.",
        }));
        return;
      }
      const keyId = form.get("key_id");
      const apiKey = apiKeys.find((entry) => entry.id === keyId);
      if (!apiKey) {
        sendHtml(response, 400, selectorPage({ apiKeys, state, error: "Choose one of the listed API keys." }));
        return;
      }
      submitting = true;
      try {
        const gatewayKey = await revealApiKey(login.accessToken, apiKey.id);
        await fetchModels(gatewayKey);
        if (settle({ apiKey, gatewayKey, login })) sendHtml(response, 200, selectorSuccessPage());
      } catch (error) {
        submitting = false;
        sendHtml(response, 502, selectorPage({
          apiKeys,
          state,
          error: displayError(error instanceof Error ? error.message : error) || "Unable to reveal that API key.",
        }));
      }
    })().catch((error) => {
      if (!response.headersSent) {
        sendHtml(response, 500, apiKeys
          ? selectorPage({
            apiKeys,
            state,
            error: displayError(error instanceof Error ? error.message : error) || "Unable to process the selection.",
          })
          : loginPage({
            state,
            hasSavedLogin: savedLoginAvailable,
            error: displayError(error instanceof Error ? error.message : error) || "Unable to process the sign-in.",
          }));
      }
    });
  });

  await new Promise((resolve, reject) => {
    const onError = (error) => {
      server.off("listening", onListening);
      reject(error);
    };
    const onListening = () => {
      server.off("error", onError);
      resolve();
    };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(0, "127.0.0.1");
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    server.close();
    throw new Error("Unable to start the local LLMGate API-key selector");
  }
  const timeout = setTimeout(() => {
    fail(new Error("LLMGate API-key selection timed out after 10 minutes"));
  }, API_KEY_SELECTOR_TIMEOUT_MS);
  const close = () => {
    clearTimeout(timeout);
    server.close();
  };
  closeServer = close;
  server.on("error", fail);

  return {
    url: `http://127.0.0.1:${address.port}/?state=${encodeURIComponent(state)}`,
    wait: async () => {
      try {
        return await selection;
      } finally {
        close();
      }
    },
  };
}

async function fetchMetadataJson(url) {
  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(10_000),
    });
    return response.ok ? await response.json() : {};
  } catch {
    return {};
  }
}

function openRouterModelIndex(payload) {
  const entries = Array.isArray(asRecord(payload).data) ? asRecord(payload).data : [];
  return Object.fromEntries(entries.flatMap((entry) => {
    const record = asRecord(entry);
    const id = nonEmptyString(record.id);
    return id ? [[id, record]] : [];
  }));
}

function modelsDevApiModel(payload, modelId) {
  const provider = modelId.startsWith("claude-") ? "anthropic"
    : modelId.startsWith("deepseek-") ? "deepseek"
      : modelId.startsWith("gemini-") ? "google"
        : modelId.startsWith("glm-") ? "zhipuai"
          : modelId.startsWith("gpt-") ? "openai"
            : modelId.startsWith("grok-") ? "xai"
              : modelId.startsWith("kimi-") ? "moonshotai"
                : modelId.startsWith("minimax-") ? "minimax"
                  : undefined;
  return provider ? asRecord(asRecord(asRecord(payload)[provider]).models)[modelId] ?? {} : {};
}

async function fetchModelMetadata() {
  if (modelMetadata) return modelMetadata;
  if (modelMetadataFetch) return modelMetadataFetch;

  modelMetadataFetch = (async () => {
    try {
      const [modelsDevApi, modelsDev, openRouter, liteLlm] = await Promise.all([
        fetchMetadataJson(MODELS_DEV_API_URL),
        fetchMetadataJson(MODELS_DEV_MODELS_URL),
        fetchMetadataJson(OPENROUTER_MODELS_URL),
        fetchMetadataJson(LITELLM_MODELS_URL),
      ]);
      const result = {
        modelsDevApi: asRecord(modelsDevApi),
        modelsDev: asRecord(modelsDev),
        openRouter: openRouterModelIndex(openRouter),
        liteLlm: asRecord(liteLlm),
      };
      if (Object.values(result).some((source) => Object.keys(source).length > 0)) {
        modelMetadata = result;
      }
      return result;
    } finally {
      modelMetadataFetch = undefined;
    }
  })();
  return modelMetadataFetch;
}

async function fetchModels(apiKey) {
  const metadataPromise = fetchModelMetadata();
  const response = await fetch(`${BASE_URL}/models`, {
    method: "GET",
    headers: { Accept: "application/json", Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`LLMGate gateway rejected the credential (HTTP ${response.status})`);

  const payload = await response.json();
  const entries = Array.isArray(asRecord(payload).data)
    ? asRecord(payload).data
    : Array.isArray(payload)
      ? payload
      : [];
  const metadata = await metadataPromise;
  const models = {};
  for (const item of entries) {
    const record = asRecord(item);
    const id = nonEmptyString(record.id ?? record.model ?? item);
    if (!id) continue;
    const gateway = { ...record, id };
    models[id] = buildLlmGateModelConfig({
      gateway,
        metadata: mergeLlmGateModelMetadata({
          gateway,
          modelsDev: {
            ...findModelMetadata(metadata.modelsDev, id),
            ...asRecord(modelsDevApiModel(metadata.modelsDevApi, id)),
          },
        openRouter: findModelMetadata(metadata.openRouter, id),
        liteLlm: findModelMetadata(metadata.liteLlm, id, { allowSuffixFallback: false }),
      }),
    });
  }
  if (Object.keys(models).length === 0) throw new Error("LLMGate gateway returned no models");
  return models;
}

export async function loadModelsWithFallback(
  apiKey,
  fetchCatalog = fetchModels,
  retryDelayMs = MODEL_FETCH_RETRY_DELAY_MS,
) {
  for (let attempt = 1; attempt <= MODEL_FETCH_ATTEMPTS; attempt += 1) {
    try {
      const models = await fetchCatalog(apiKey);
      if (!isModelCatalog(models)) throw new Error("LLMGate gateway returned no models");
      await writeModelCache(apiKey, models);
      return models;
    } catch {
      if (attempt < MODEL_FETCH_ATTEMPTS) await wait(retryDelayMs);
    }
  }
  return readModelCache(apiKey);
}

function loginMetadata(login) {
  if (!login.accessToken || !login.refreshToken) {
    throw new Error("LLMGate login did not return the required access and refresh token pair");
  }

  return {
    llmgate_access_token: login.accessToken,
    llmgate_refresh_token: login.refreshToken,
    ...(login.expiresAt ? { llmgate_expires_at: login.expiresAt } : {}),
  };
}

async function authorize() {
  const selector = await startConnectServer();

  return {
    url: selector.url,
    instructions: "Open the local link, sign in to LLMGate, choose the API key to use, then return here.",
    method: "auto",
    callback: async () => {
      const { apiKey, gatewayKey, login } = await selector.wait();
      await saveGatewayKey(gatewayKey);
      await saveSelectedApiKeyId(apiKey.id);
      return {
        type: "success",
        provider: PROVIDER_ID,
        key: KEYCHAIN_AUTH_MARKER,
        metadata: {
          ...loginMetadata(login),
          llmgate_api_key_id: apiKey.id,
          llmgate_api_key_name: apiKey.name,
        },
      };
    },
  };
}

export const LLMGateProviderPlugin = async () => ({
  auth: {
    provider: PROVIDER_ID,
    loader: async (getAuth) => {
      const auth = await getAuth().catch(() => undefined);
      if (asRecord(auth).type !== "api") return {};
      await rememberSelectedApiKeyId(auth);
      const apiKey = await readGatewayKey();
      return apiKey ? { apiKey, baseURL: BASE_URL } : {};
    },
    methods: [
      {
        type: "oauth",
        label: "Sign in to LLMGate",
        authorize,
      },
    ],
  },
  provider: {
    id: PROVIDER_ID,
    models: async (_provider, context) => {
      if (asRecord(context?.auth).type !== "api") return {};
      await rememberSelectedApiKeyId(context?.auth);
      const apiKey = await readGatewayKey();
      return apiKey ? await loadModelsWithFallback(apiKey) : {};
    },
  },
  config: async (config) => {
    config.provider ??= {};
    const existing = asRecord(config.provider[PROVIDER_ID]);
    config.provider[PROVIDER_ID] = {
      ...existing,
      name: nonEmptyString(existing.name) ?? DISPLAY_NAME,
      npm: nonEmptyString(existing.npm) ?? "@ai-sdk/openai-compatible",
      options: { ...asRecord(existing.options), baseURL: BASE_URL },
      models: asRecord(existing.models),
    };
  },
});

export default {
  id: "opencode-llmgate-provider",
  server: LLMGateProviderPlugin,
};
