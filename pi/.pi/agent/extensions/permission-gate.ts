import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { isToolCallEventType } from "@earendil-works/pi-coding-agent";

const DANGEROUS_PATTERNS: Array<[RegExp, string]> = [
  [/rm\s+(-rf|-fr)\s+[\/~]/, "rm -rf on absolute/home path"],
  [/>\s*\/dev\/sd/, "write to block device"],
  [/mkfs\./, "format filesystem"],
  [/dd\s+if=/, "raw disk write"],
  [/chmod\s+777/, "chmod 777"],
  [/curl.*\|\s*(ba)?sh/, "pipe curl to shell"],
  [/wget.*\|\s*(ba)?sh/, "pipe wget to shell"],
  [/base64\s+-d.*\|\s*(ba)?sh/, "decode-and-exec"],
  [/python3?\s+-c\s+['"].*exec\s*\(/, "inline python eval"],
  [/git\s+push\s+(--force|-f)\b/, "force push"],
  [/systemctl\s+(disable|mask|stop)\s/, "service disruption"],
  [/sudo\s+/, "sudo"],
];

export default function (pi: ExtensionAPI) {
  pi.on("tool_call", async (event, ctx) => {
    if (!isToolCallEventType("bash", event)) return;

    const command = event.input.command;

    for (const [pattern, label] of DANGEROUS_PATTERNS) {
      if (pattern.test(command)) {
        if (ctx.hasUI) {
          const allow = await ctx.ui.confirm(
            `Dangerous command: ${label}`,
            `${command}\n\nAllow anyway?`
          );
          if (allow) return;
        }
        return { block: true, reason: `Blocked: ${label} — ${command}` };
      }
    }
  });
}
