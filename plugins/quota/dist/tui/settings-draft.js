/**
 * A settings window's draft over the server's settings.jsonc, apart from any schema module: the
 * TUI's Settings tabs and the GUI's Settings page both edit through it, and both save with the
 * quota RPC's `saveSettings`, which writes only the changed keys and keeps the file's comments.
 * The rules a draft needs (each key's default, which keys hold records) come in as a
 * `SettingsShape`, which `settingsShape` makes from the schema's rules: the TUI's from
 * `settings/schema.ts`, the GUI's from the RPC's `settingsSchema`.
 */
import { createSignal } from "solid-js";
import { isRecord } from "../lib/json-guards.js";
import { CHANGED_SINCE_REVIEW, RECORD_KINDS, UNSET_IS_NOT_DEFAULT } from "../settings/shared.js";
export function settingsShape(rules) {
    const entries = Object.entries(rules).filter(([key, rule]) => key !== "version" && rule.fileOnly !== true);
    return {
        defaults: Object.fromEntries(entries
            .filter(([, rule]) => rule.default !== undefined)
            .map(([key, rule]) => [key, structuredClone(rule.default)])),
        recordKeys: new Set(entries.filter(([, rule]) => RECORD_KINDS.includes(rule.kind)).map(([key]) => key)),
    };
}
/** The ids switched off; every other provider is checked when found. */
export const PROVIDERS_KEY = "providers.off";
export function isTicked(off, id) {
    return !off.includes(id);
}
export function withTick(off, id, on) {
    return on ? off.filter((other) => other !== id) : [...new Set([...off, id])];
}
/** Changes by dotted key as the JSON merge patch `saveSettings` takes. */
export function settingsPatch(changes) {
    const patch = {};
    for (const [key, value] of Object.entries(changes)) {
        const parts = key.split(".");
        let group = patch;
        for (const part of parts.slice(0, -1)) {
            group[part] ??= {};
            group = group[part];
        }
        group[parts[parts.length - 1]] = value;
    }
    return patch;
}
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
/** One entry of `record` set to `value`, or removed when `value` is the saved one. */
function changed(record, key, value, saved) {
    const next = { ...record };
    if (same(value, saved))
        delete next[key];
    else
        next[key] = value;
    return next;
}
/** The saved server settings, and this window's changes and custom provider switches on top. */
export function createSettingsDraft(rpc, initialShape) {
    /** The rules' shape; a GUI page gives a new one when the server's schema changes. */
    const [shape, setShape] = createSignal(initialShape);
    const isRecordSetting = (key) => shape().recordKeys.has(key);
    const [saved, setSaved] = createSignal();
    const [changes, setChanges] = createSignal({});
    const [switches, setSwitches] = createSignal({});
    /** Custom providers the server would not switch on: their definition changed since shown. */
    const [changedIds, setChangedIds] = createSignal([]);
    const defaults = () => shape().defaults;
    /** The definition shown when each custom switch was changed, kept across live updates. */
    const reviewedFingerprints = new Map();
    let received = 0;
    let reads = 0;
    let saving;
    let savingEdits;
    let savingSwitches;
    /** Keys reset since the last Save: a change back to the default keeps their removal. */
    const resets = new Set();
    /** The keys reset since Save started. */
    let savingResets;
    const savedValue = (key) => saved()?.values[key] ?? defaults()[key];
    /** Without `fromFile` (an older server), a value other than the default counts as set. */
    const savedInFile = (key) => {
        const current = saved();
        if (current === undefined)
            return false;
        if (!Array.isArray(current.fromFile))
            return !same(savedValue(key), defaults()[key]);
        return current.fromFile.includes(key);
    };
    /** The saved value a draft is compared with: null for an unset key whose unset isn't its default. */
    const savedBase = (key) => UNSET_IS_NOT_DEFAULT.has(key) && !savedInFile(key) ? null : savedValue(key);
    const savedCustom = (id) => saved()?.custom.find((entry) => entry.id === id);
    const value = (key) => {
        const patch = changes()[key];
        if (!Object.hasOwn(changes(), key))
            return savedValue(key);
        if (isRecordSetting(key) && isRecord(patch)) {
            const next = { ...savedValue(key) };
            for (const [id, item] of Object.entries(patch)) {
                if (item === null)
                    delete next[id];
                else
                    next[id] = item;
            }
            return next;
        }
        return patch === null ? defaults()[key] : patch;
    };
    const draftValue = (key, next) => {
        if (!isRecordSetting(key) || !isRecord(next))
            return next === undefined ? null : next;
        const before = savedValue(key);
        return Object.fromEntries([...new Set([...Object.keys(before), ...Object.keys(next)])]
            .filter((id) => !same(before[id], next[id]))
            .map((id) => [id, next[id] ?? null]));
    };
    const customOn = (id) => switches()[id] ?? savedCustom(id)?.enabled ?? false;
    const count = () => Object.keys(changes()).length + Object.keys(switches()).length;
    const dirty = () => count() > 0;
    async function readSaved() {
        const read = ++reads;
        const at = received;
        const next = await rpc.settings();
        if (read === reads && at === received)
            setSaved(next);
    }
    async function saveDraft() {
        const sentChanges = changes();
        const sentSwitches = switches();
        const customEnabled = Object.fromEntries(Object.entries(sentSwitches).map(([id, enabled]) => [
            id,
            {
                enabled,
                fingerprint: reviewedFingerprints.get(id) ?? savedCustom(id)?.fingerprint ?? "",
            },
        ]));
        savingEdits = new Map();
        savingSwitches = new Map();
        const resetDuringSave = new Set();
        savingResets = resetDuringSave;
        try {
            const result = await rpc.saveSettings({
                patch: settingsPatch(sentChanges),
                ...(Object.keys(customEnabled).length > 0 ? { customEnabled } : {}),
            });
            const changedSince = result.issues
                .filter((issue) => issue.message === CHANGED_SINCE_REVIEW)
                .map((issue) => issue.key.slice("providers.custom.".length));
            if (changedSince.length > 0) {
                await readSaved();
                setChangedIds(changedSince);
                for (const id of changedSince)
                    reviewedFingerprints.delete(id);
                setSwitches((current) => Object.fromEntries(Object.entries(current).filter(([id]) => !changedSince.includes(id))));
            }
            if (!result.ok) {
                throw new Error(result.issues.map((issue) => `${issue.key}: ${issue.message}`).join("; "));
            }
            await readSaved();
            // Only edits made after Save started remain drafts, over the latest saved settings.
            const remaining = {};
            for (const [key, patch] of savingEdits) {
                if (isRecordSetting(key) && isRecord(patch) && resetDuringSave.has(key)) {
                    // Reset, then edited: the whole record replaces the saved one.
                    const draft = draftValue(key, patch);
                    if (Object.keys(draft).length > 0)
                        remaining[key] = draft;
                }
                else if (isRecordSetting(key) && isRecord(patch)) {
                    const before = savedValue(key);
                    const entries = Object.entries(patch).filter(([id, item]) => !same(item === null ? undefined : item, before[id]));
                    if (entries.length > 0)
                        remaining[key] = Object.fromEntries(entries);
                }
                else if (patch === null ? savedInFile(key) : !same(patch, savedBase(key))) {
                    remaining[key] = patch;
                }
            }
            setChanges(remaining);
            resets.clear();
            for (const key of resetDuringSave)
                resets.add(key);
            setSwitches(Object.fromEntries([...savingSwitches].filter(([id, on]) => on !== (savedCustom(id)?.enabled ?? false))));
        }
        finally {
            savingEdits = undefined;
            savingSwitches = undefined;
            savingResets = undefined;
        }
    }
    /**
     * Puts one setting back to its default: Save removes it from settings.jsonc, so it follows the
     * default from then on, also a later one. A key the file does not set needs no change.
     */
    function reset(key) {
        resets.add(key);
        savingResets?.add(key);
        savingEdits?.set(key, null);
        setChanges((current) => {
            const result = { ...current };
            if (savedInFile(key))
                result[key] = null;
            else
                delete result[key];
            return result;
        });
    }
    return {
        /** Undefined until the first server answer. */
        saved,
        /**
         * Settings a snapshot carries; the same ones as the saved settings change nothing, and a read
         * that waits (Save's too) still counts.
         */
        receive(next) {
            if (same(next, saved()))
                return;
            received += 1;
            setSaved(next);
        },
        /** The rules' new shape (defaults, record keys); the draft's changes stay. */
        reshape(next) {
            setShape(next);
        },
        value,
        /**
         * Whether settings.jsonc leaves a key whose unset isn't its default (the request timeout)
         * unset, with this window's draft on top.
         */
        unset(key) {
            if (!UNSET_IS_NOT_DEFAULT.has(key))
                return false;
            return Object.hasOwn(changes(), key) ? changes()[key] === null : !savedInFile(key);
        },
        set(key, next) {
            if (resets.has(key) && same(next, defaults()[key]) && !UNSET_IS_NOT_DEFAULT.has(key)) {
                reset(key);
                return;
            }
            if (savingEdits) {
                if (isRecordSetting(key) && isRecord(next) && savingResets?.has(key)) {
                    savingEdits.set(key, next);
                }
                else if (isRecordSetting(key) && isRecord(next)) {
                    const before = value(key);
                    const edits = Object.fromEntries([...new Set([...Object.keys(before), ...Object.keys(next)])]
                        .filter((id) => !same(before[id], next[id]))
                        .map((id) => [id, next[id] ?? null]));
                    savingEdits.set(key, { ...savingEdits.get(key), ...edits });
                }
                else {
                    savingEdits.set(key, next === undefined ? null : next);
                }
            }
            const patch = draftValue(key, next);
            const unchanged = same(UNSET_IS_NOT_DEFAULT.has(key) ? (next ?? null) : next, savedBase(key)) ||
                (isRecordSetting(key) && isRecord(patch) && Object.keys(patch).length === 0);
            setChanges((current) => {
                const result = { ...current };
                if (unchanged)
                    delete result[key];
                else
                    result[key] = patch;
                return result;
            });
        },
        reset,
        customOn,
        switchCustom(id, on) {
            reviewedFingerprints.set(id, savedCustom(id)?.fingerprint ?? "");
            savingSwitches?.set(id, on);
            setChangedIds((current) => current.filter((other) => other !== id));
            setSwitches((current) => changed(current, id, on, savedCustom(id)?.enabled));
        },
        changedSinceReview: (id) => changedIds().includes(id),
        /**
         * Every custom provider switch back to its saved state: the flips not saved yet are dropped,
         * also one made while Save waits. settings.jsonc is not touched.
         */
        discardSwitches() {
            for (const id of Object.keys(switches()))
                reviewedFingerprints.delete(id);
            savingSwitches?.clear();
            setSwitches({});
        },
        dirty,
        /** How many settings and custom provider switches the draft changes. */
        count,
        changedKeys: () => Object.keys(changes()),
        async load() {
            await readSaved();
        },
        /**
         * Saves one setting straight away, apart from the window's draft (the Plugin tab's
         * switches), then reads the saved settings again. The error says why the server refused it.
         */
        async saveNow(key, next) {
            const result = await rpc.saveSettings({ patch: settingsPatch({ [key]: next }) });
            if (!result.ok) {
                throw new Error(result.issues.map((issue) => `${issue.key}: ${issue.message}`).join("; "));
            }
            await readSaved();
        },
        /**
         * Sends the changes and switches in one save; nothing is saved when the server refuses any
         * of them, and the error says why. A switch-on carries the fingerprint of the definition
         * shown: one that changed since is reloaded and marked, not switched on. A change made while
         * it saves (one back to the old value too) stays unsaved.
         */
        save() {
            if (saving)
                return saving;
            if (!dirty())
                return Promise.resolve();
            saving = saveDraft().finally(() => {
                saving = undefined;
            });
            return saving;
        },
        discard() {
            reviewedFingerprints.clear();
            resets.clear();
            savingResets?.clear();
            savingEdits?.clear();
            savingSwitches?.clear();
            setChanges({});
            setSwitches({});
            setChangedIds([]);
        },
    };
}
//# sourceMappingURL=settings-draft.js.map