import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { VERSION } from "@mariozechner/pi-coding-agent";

// Pi logo — pixel-accurate from pi-coding-agent SVG icon
// 4×4 grid derived from SVG path coordinates (117.36-unit grid)
// P: outer path minus rectangular hole | i: rectangle at col 3 rows 2-3
const W = 3; // chars per grid cell

const LOGO = [
  [1, 1, 1, 0], // row 0: P top bar
  [1, 0, 1, 0], // row 1: P bowl sides (hole at col 1)
  [1, 1, 0, 1], // row 2: P bowl close + i
  [1, 0, 0, 1], // row 3: P stem + i
];

export default function (pi: ExtensionAPI) {
  pi.on("session_start", async (_event, ctx) => {
    if (!ctx.hasUI) return;

    ctx.ui.setHeader((_tui, theme) => {
      return {
        render(_width: number): string[] {
          const filled = theme.fg("accent", "█".repeat(W));
          const empty = " ".repeat(W);

          const lines = LOGO.map(
            (row) => " " + row.map((cell) => (cell ? filled : empty)).join(""),
          );

          const version = " " + theme.fg("dim", `v${VERSION}`);
          return ["", ...lines, "", version, ""];
        },
        invalidate() {},
      };
    });
  });
}
