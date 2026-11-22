import os from "node:os";
import path from "node:path";

/** Data folder: %USERPROFILE%\.pheme on Windows, ~/.pheme elsewhere. Never inside the repo. */
export function dataDir(override?: string): string {
  return override ?? process.env.PHEME_HOME ?? path.join(os.homedir(), ".pheme");
}
