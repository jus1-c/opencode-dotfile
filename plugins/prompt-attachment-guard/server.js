// OpenCode 2 drops the whole prompt with HTTP 500 when an attachment's base64
// payload crosses ~7,077,880 characters, because SessionPrompt.normalizeImageAttachment
// fails the Prompt.Base64 schema check after the file is already read. The prompt
// is never admitted, so the user loses the message instead of the attachment.
//
// Catch it at admission: an oversized attachment is removed from the prompt and a
// note is appended to the text, so the rest of the message still sends.
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const LIMIT = 5 * 1024 * 1024;

function attachmentBytes(uri) {
  if (uri.startsWith("data:")) {
    const comma = uri.indexOf(",");
    if (comma === -1) return undefined;
    const meta = uri.slice(5, comma);
    const payload = uri.slice(comma + 1);
    if (meta.split(";").some((part) => part.toLowerCase() === "base64")) {
      return Math.floor((payload.length * 3) / 4);
    }
    try {
      return Buffer.byteLength(decodeURIComponent(payload));
    } catch {
      return undefined;
    }
  }
  if (!uri.startsWith("file:")) return undefined;
  try {
    const url = new URL(uri);
    url.search = "";
    url.hash = "";
    return fs.statSync(fileURLToPath(url)).size;
  } catch {
    return undefined;
  }
}

export default {
  id: "prompt-attachment-guard",
  async setup(ctx) {
    await ctx.session.hook("prompt", (event) => {
      const files = event.prompt.files;
      if (!files || files.length === 0) return;

      const dropped = [];
      const kept = files.filter((file) => {
        const bytes = file?.uri ? attachmentBytes(file.uri) : undefined;
        // Unknown size stays attached: OpenCode's own read error is clearer than
        // silently discarding a file we could not measure.
        if (bytes === undefined || bytes < LIMIT) return true;
        dropped.push({ file, bytes });
        return false;
      });
      if (dropped.length === 0) return;

      event.prompt.files = kept;
      const notes = dropped.map(({ file, bytes }) => {
        const label = file.name ?? (file.uri.startsWith("file:") ? file.uri.slice(7) : file.uri);
        return `[attachment not sent: ${label} (${(bytes / 1024 / 1024).toFixed(1)} MB, over the 5 MB limit)]`;
      });
      event.prompt.text = [event.prompt.text, ...notes].filter((part) => part && part.trim()).join("\n\n");
    });
  },
};
