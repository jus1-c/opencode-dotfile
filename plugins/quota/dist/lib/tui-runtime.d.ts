import type { TuiPluginApi } from "@opencode-ai/plugin/tui";
import { type RuntimeContextRootHints } from "./config-file-utils.js";
import { type MaintainerAnnouncement } from "./maintainer-announcements.js";
import type { SessionModelMeta } from "./quota-render-data.js";
import type { CompactStatusState, HomeBottomState, SidebarPanelState } from "./tui-panel-state.js";
import type { TuiCommandDisplay } from "./types.js";
export declare function getTuiRuntimeRootHints(api: TuiPluginApi): RuntimeContextRootHints;
export declare function resolveWorkspaceDir(api: TuiPluginApi): string;
export declare function createTuiQuotaClient(api: TuiPluginApi): {
    config: {
        providers: () => Promise<{
            data: {
                providers: {
                    id: string;
                }[];
            };
        }>;
        get: () => Promise<{
            data: Record<string, unknown>;
        }>;
    };
};
export declare function normalizeTuiSessionID(sessionID: unknown): string | undefined;
export declare function getTuiSessionModelMeta(api: TuiPluginApi, sessionID: string): Promise<SessionModelMeta>;
export type TuiSidebarPanelRegistration = {
    enabled: boolean;
};
export type TuiCompactStatusRegistration = {
    enabled: boolean;
    homeBottom: boolean;
    sessionPrompt: boolean;
    hasNativeProviderQuota: boolean;
    suppressedByNativeProviderQuota: boolean;
};
export type TuiMaintainerAnnouncementsRegistration = {
    homeBottom: boolean;
};
export type TuiSurfaceRegistration = {
    commandDisplay: TuiCommandDisplay;
    sidebar: TuiSidebarPanelRegistration;
    compact: TuiCompactStatusRegistration;
    announcements: TuiMaintainerAnnouncementsRegistration;
    homeBottom: boolean;
};
export type TuiSessionQuotaSurfaces = {
    sidebar: SidebarPanelState;
    compact: CompactStatusState;
};
export declare function resolveTuiSurfaceRegistration(api: TuiPluginApi): Promise<TuiSurfaceRegistration>;
export declare function loadTuiSessionQuotaSurfaces(params: {
    api: TuiPluginApi;
    sessionID: string;
}): Promise<TuiSessionQuotaSurfaces>;
export declare function loadTuiHomeBottomStatus(params: {
    api: TuiPluginApi;
    nowMs?: number;
    announcements?: readonly MaintainerAnnouncement[];
}): Promise<HomeBottomState>;
export declare function loadTuiHomeCompactStatus(params: {
    api: TuiPluginApi;
}): Promise<CompactStatusState>;
/**
 * Writes the quota export file if `config.export.enabled` is true.
 *
 * Called from the TUI home bottom status refresh loop. Errors propagate to
 * the caller; the call-site in `tui.tsx` is responsible for catching and
 * logging them so a failed write never affects rendering.
 */
export declare function writeTuiQuotaExportIfEnabled(params: {
    api: TuiPluginApi;
}): Promise<void>;
//# sourceMappingURL=tui-runtime.d.ts.map