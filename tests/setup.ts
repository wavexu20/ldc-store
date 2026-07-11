import "@testing-library/jest-dom/vitest";

// 统一测试环境变量，避免依赖本机默认值导致不稳定。
// Next 的类型定义会把 process.env.NODE_ENV 标为 readonly；测试里仍需要显式设置时，用 Reflect.set 更稳妥。
const isSet = Reflect.set(process.env, "NODE_ENV", "test");
if (!isSet) {
  throw new Error("无法在测试环境中设置 NODE_ENV");
}

// Node 25 may expose an unusable localStorage placeholder unless a backing file is configured.
if (!globalThis.localStorage) {
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      get length() { return values.size; },
      clear: () => values.clear(),
      getItem: (key: string) => values.get(key) ?? null,
      key: (index: number) => [...values.keys()][index] ?? null,
      removeItem: (key: string) => values.delete(key),
      setItem: (key: string, value: string) => values.set(key, String(value)),
    } satisfies Storage,
  });
}
