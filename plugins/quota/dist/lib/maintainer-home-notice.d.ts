import type { Notice } from "../rpc.js";
/**
 * The active notices.
 * @param providerIds the providers quota shows (a notice can target some of them).
 */
export declare function listNotices(params: {
    providerIds: string[];
    nowMs?: number;
}): Promise<Notice[]>;
/**
 * The Home line that counts the active notices, or "" when there is none to show now.
 * @param providerIds the providers quota shows (a notice can target some of them).
 */
export declare function homeNoticeLine(params: {
    providerIds: string[];
    nowMs?: number;
}): Promise<string>;
export declare function __resetMaintainerHomeNoticeForTests(): void;
