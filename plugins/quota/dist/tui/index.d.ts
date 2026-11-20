/** @jsxImportSource @opentui/solid */
/**
 * OpenCode Quota's TUI plugin. It draws the server's quota snapshot: the Quota panel in the
 * session sidebar, the status line under the message box (and on Home when turned on), the
 * toasts, and the quota window that `/quota`, `/quota_usage`, `/quota_status` and
 * `/quota_settings` open above the message box (`window/`).
 * It reads all settings through the quota RPC; plugin storage keeps only the sidebar state.
 *
 * The quota slash commands typed in the prompt run in the TUI: on Enter, before OpenCode submits
 * the prompt, a prompt that starts with /quota, /quota_usage, /quota_status or /quota_settings is
 * cleared and runs its TUI action with the rest of the prompt as its arguments. So no report
 * shows in the chat, and on Home no session is created for one. The "/" list names each once:
 * the server lists /quota, /quota_usage and /quota_status, the TUI /quota_settings.
 * The 4.x and 5.x names run here too: each /tokens_* opens the Usage tab on its range while
 * `system.oldCommands` is on (the server lists them then), and names its /quota_usage range while
 * it is off (an open TUI's "/" list keeps them until OpenCode restarts).
 */
import { Plugin } from "@opencode/plugin/tui";
declare const plugin: Plugin.Definition;
export default plugin;
