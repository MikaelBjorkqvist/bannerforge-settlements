// Globals provided by Minecraft's script runtime that aren't in the ES2020 lib.
// console output goes to the Content Log (enable it in Settings → Creator).
declare const console: {
  log(...data: unknown[]): void;
  info(...data: unknown[]): void;
  warn(...data: unknown[]): void;
  error(...data: unknown[]): void;
};
