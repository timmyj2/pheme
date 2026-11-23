const FLAGS = new Set(["--fake", "--no-open", "-h", "--help"]);
const VALUE_FLAGS = new Set(["--port", "--data-dir"]);

/** Returns a plain-language problem with the command line, or null when it is fine. A typo must never fall through to the real engine. */
export function checkArgs(args: string[]): string | null {
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (i === 0 && a === "doctor") continue;
    if (FLAGS.has(a)) continue;
    if (VALUE_FLAGS.has(a)) {
      const v = args[i + 1];
      if (v === undefined || v.startsWith("--")) return `${a} needs a value, for example: ${a} ${a === "--port" ? "7676" : "./my-data"}`;
      i++;
      continue;
    }
    const eq = a.indexOf("=");
    if (a.startsWith("--") && eq > 0 && VALUE_FLAGS.has(a.slice(0, eq))) return `Write it with a space instead: ${a.slice(0, eq)} ${a.slice(eq + 1)}`;
    return a.startsWith("-") ? `Unknown option "${a}". Run with --help to see the options.` : `Unexpected "${a}". Run with --help to see the options.`;
  }
  return null;
}
