import type { JSX } from "@opentui/solid";
import type { Notice, QuotaRpcNoticeListOutput } from "../../rpc.js";
import { type SurfaceHost } from "../sidebar.js";
import type { WindowTheme } from "./shell.js";
/** The active maintainer notices. */
export type NoticeBoard = QuotaRpcNoticeListOutput;
export type NoticeReport = {
    state: "loading";
} | {
    state: "ready";
    board: NoticeBoard;
} | {
    state: "failed";
    message: string;
};
/** The notices, or the one line that says there is none. */
export declare function noticeItems(board: NoticeBoard): {
    items: Notice[];
    empty?: string;
};
export type StatusLine = {
    text: string;
    heading: boolean;
};
/**
 * The status report on Plugin: the /quota_status report's lines, its title ("# ") and its
 * section titles (an unindented line that ends with ":") marked so they can be bold. A list
 * joined with " | " that is wider than `width` goes on under itself between items, lined up
 * after its "key: ", so an id like `google-gemini-cli` never breaks at its "-".
 */
export declare function statusLines(text: string, width?: number): StatusLine[];
export type StatusReport = {
    state: "loading";
} | {
    state: "ready";
    text: string;
} | {
    state: "failed";
    message: string;
};
export declare function LimitsView(props: {
    host: SurfaceHost;
    sessionID: string;
    nowMs: number;
    width: number;
}): JSX.Element;
/** Plugin's notices under their title: a bullet, the message, and its link under it. */
export declare function NoticesView(props: {
    theme: WindowTheme;
    report: NoticeReport;
}): JSX.Element;
/**
 * The /quota_status report as text you can select, all in the muted color (its section titles
 * bold): it is for pasting into an issue, and reads apart from the tab's own lines.
 */
export declare function StatusView(props: {
    theme: WindowTheme;
    report: StatusReport;
    width: number;
}): JSX.Element;
