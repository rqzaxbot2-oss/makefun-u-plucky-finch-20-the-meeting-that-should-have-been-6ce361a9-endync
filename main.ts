import { mkdirSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const MAX_LENGTH = 200;
const OUTPUT_FILENAME = "entry.txt";
const DEFAULT_OUTPUT_SUBDIR = "makefun-output";

export const ENTRY: string =
  "My boss called an hour-long meeting to read his three-line email aloud, worried we wouldn't hear the bold text.";

export function validateEntry(line: string): string {
  if (typeof line !== "string") {
    throw new TypeError("Entry must be a string.");
  }
  const trimmed = line.trim();
  if (trimmed.length === 0) {
    throw new Error("Entry must not be empty.");
  }
  if (/[\r\n\u2028\u2029]/.test(trimmed)) {
    throw new Error("Entry must be a single line of plain text.");
  }
  if (trimmed.length > MAX_LENGTH) {
    throw new Error(`Entry exceeds ${MAX_LENGTH} characters (${trimmed.length}).`);
  }
  for (let i = 0; i < trimmed.length; i += 1) {
    const code = trimmed.charCodeAt(i);
    if (code < 0x20 || code === 0x7f) {
      throw new Error(`Entry contains non-printable control character at index ${i}.`);
    }
    if (code > 0x7e) {
      throw new Error(`Entry contains non-ASCII character at index ${i}.`);
    }
  }
  return trimmed;
}

export function resolveOutputDir(env: NodeJS.ProcessEnv = process.env): string {
  const rawDir = env.MAKEFUN_OUTPUT_DIR;
  if (typeof rawDir === "string") {
    const trimmed = rawDir.trim();
    if (trimmed.length > 0) {
      if (trimmed.includes("\0")) {
        throw new Error("MAKEFUN_OUTPUT_DIR must not contain NUL bytes.");
      }
      return resolve(trimmed);
    }
  }
  return join(tmpdir(), DEFAULT_OUTPUT_SUBDIR);
}

export function main(): void {
  const entry = validateEntry(ENTRY);
  const outputDir = resolveOutputDir();
  const payload = `${entry}\n`;

  mkdirSync(outputDir, { recursive: true });
  writeFileSync(join(outputDir, OUTPUT_FILENAME), payload, { encoding: "utf8", flag: "w" });
  process.stdout.write(payload);
}

function isMainModule(): boolean {
  const entryArg = process.argv[1];
  if (!entryArg) {
    return false;
  }
  const modulePath = fileURLToPath(import.meta.url);
  const resolvedArg = resolve(entryArg);
  if (modulePath === resolvedArg) {
    return true;
  }
  try {
    return realpathSync(modulePath) === realpathSync(resolvedArg);
  } catch {
    return false;
  }
}

if (isMainModule()) {
  try {
    main();
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`Error: ${message}\n`);
    process.exitCode = 1;
  }
}