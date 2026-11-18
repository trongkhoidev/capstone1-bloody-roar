export function isAllowedDatabase(url: string | undefined, override?: string): boolean {
  if (override === "1") return true;
  try {
    return ["localhost", "127.0.0.1"].includes(new URL(url!).hostname);
  } catch {
    return false;
  }
}

if ((import.meta as ImportMeta & { main?: boolean }).main) {
  for (const variable of ["DATABASE_URL", "DIRECT_URL"]) {
    if (variable === "DIRECT_URL" && process.env[variable] === undefined) continue;
    if (!isAllowedDatabase(process.env[variable], process.env.ALLOW_REMOTE_DB)) {
      console.error(`${variable} must point to localhost or 127.0.0.1; set ALLOW_REMOTE_DB=1 to override.`);
      process.exit(1);
    }
  }
}
