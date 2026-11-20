/**
 * Shows the home dir as "~" so pasted reports do not reveal the computer's user name:
 * "/Users/alice/.config" -> "~/.config", "/Users/alice" -> "~". Only whole home-dir
 * matches change; "/Users/alicesmith" stays as it is. Display only, never for reading files.
 */
export declare function replaceHomeDirWithTilde(text: string, homeDir: string): string;
