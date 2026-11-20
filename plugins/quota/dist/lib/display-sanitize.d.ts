/**
 * Shared display sanitization for user-visible output.
 *
 * Strips ANSI escape sequences and other control characters so that
 * remote/provider error text cannot inject terminal control codes into
 * toasts or transcript output.
 */
export declare function sanitizeDisplayText(text: string): string;
export declare function sanitizeSingleLineDisplayText(text: string): string;
export declare function sanitizeDisplaySnippet(text: string, maxLength: number): string;
export declare function sanitizeSingleLineDisplaySnippet(text: string, maxLength: number): string;
