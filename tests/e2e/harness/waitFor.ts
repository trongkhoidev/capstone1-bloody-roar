export async function waitFor<T>(condition: () => Promise<T | false | null | undefined>, timeoutMs = 60_000): Promise<T> {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    const result = await condition();
    if (result) return result;
    await Bun.sleep(250);
  }
  throw new Error(`Condition did not become true within ${timeoutMs}ms`);
}
