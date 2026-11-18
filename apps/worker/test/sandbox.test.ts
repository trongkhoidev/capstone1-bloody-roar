import { expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { validTestPath } from "@bloody-roar/shared/test-runner";
import { completeResults, parseJunit, parseVitest, runInSandbox } from "../src/runner/sandbox";
import { command } from "../src/runner/command";

test("parses vitest results and never counts a missing or skipped test as passed", () => {
  const results = parseVitest(JSON.stringify({ testResults: [{ assertionResults: [{ fullName: "[TC:a] fixes the bug", status: "passed" }, { fullName: "[TC:b] regression", status: "pending" }] }] }));
  expect(completeResults(["a", "b", "missing"], results).map((r) => r.status)).toEqual(["passed", "skipped", "failed"]);
  expect(validTestPath("__bloodyroar__/../secret.test.ts")).toBe(false);
  expect(validTestPath("/tmp/a.test.ts")).toBe(false);
});
test("parses pytest JUnit failures and skips", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "br-junit-"));
  try {
    const file = path.join(dir, "report.xml");
    await writeFile(file, '<testsuite><testcase name="test_fix[TC:a]"/><testcase name="test_fail[TC:b]"><failure>wrong</failure></testcase><testcase name="test_skip[TC:c]"><skipped/></testcase></testsuite>');
    expect((await parseJunit(file)).map((r) => r.status)).toEqual(["passed", "failed", "skipped"]);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
test.skipIf(!process.env.DOCKER_TESTS)("a passing test added by the patch cannot affect locked red tests", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "br-locked-tests-")), source = path.join(root, "source");
  try {
    await mkdir(source);
    await writeFile(path.join(source, "package.json"), JSON.stringify({ type: "module", devDependencies: { vitest: "2.1.9" } }));
    const snapshotPath = path.join(root, "base.tar.gz"), patchPath = path.join(root, "evil.patch");
    expect((await command(["tar", "czf", snapshotPath, "-C", source, "."], root)).code).toBe(0);
    await writeFile(patchPath, 'diff --git a/__bloodyroar__/evil.test.ts b/__bloodyroar__/evil.test.ts\nnew file mode 100644\n--- /dev/null\n+++ b/__bloodyroar__/evil.test.ts\n@@ -0,0 +1 @@\n+import {test,expect} from "vitest"; test("[TC:evil] always passes",()=>{ console.log("EVIL_TEST_EXECUTED"); expect(true).toBe(true); });\n');
    const result = await runInSandbox({ snapshotPath, patchPath, framework: "VITEST", installCommand: "", files: [
      { id: "red", path: "__bloodyroar__/locked.test.ts", code: 'import {test,expect} from "vitest"; test("[TC:red] locked red",()=>expect(1).toBe(2));' },
      { id: "clean", path: "__bloodyroar__/quoted dir/clean's.test.ts", code: 'import {test,expect} from "vitest"; import {existsSync} from "node:fs"; test("[TC:clean] only locked files remain",()=>expect(existsSync("__bloodyroar__/evil.test.ts")).toBe(false));' },
    ] });
    expect(result.status, result.log).toBe("failed");
    expect(result.results).toMatchObject([{ testCaseId: "red", status: "failed" }, { testCaseId: "clean", status: "passed" }]);
    expect(result.log).not.toContain("EVIL_TEST_EXECUTED");
  } finally { await rm(root, { recursive: true, force: true }); }
}, 300_000);
test.skipIf(!process.env.DOCKER_TESTS)("Docker runs base red, fixed patch green, bad patch red and blocks traversal", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "br-docker-fixture-")), source = path.join(root, "source");
  try {
    await mkdir(source);
    await writeFile(path.join(source, "package.json"), JSON.stringify({ type: "module", devDependencies: { vitest: "2.1.9" } }));
    await writeFile(path.join(source, "sum.ts"), "export const sum = (a: number, b: number) => a - b;\n");
    const snapshotPath = path.join(root, "base.tar.gz");
    expect((await command(["tar", "czf", snapshotPath, "-C", source, "."], root)).code).toBe(0);
    const input = { snapshotPath, files: [{ id: "fix", path: "__bloodyroar__/sum.test.ts", code: 'import {test,expect} from "vitest"; import {sum} from "../sum"; test("[TC:fix] addition",()=>expect(sum(2,3)).toBe(5));' }], framework: "VITEST" as const, installCommand: "bun install --ignore-scripts", timeoutMs: 60_000 };
    const red = await runInSandbox(input);
    expect(red.status, red.log).toBe("failed");
    expect(red.results).toMatchObject([{ testCaseId: "fix", status: "failed" }]);
    const patchPath = path.join(root, "fix.patch");
    await writeFile(patchPath, 'diff --git a/sum.ts b/sum.ts\n--- a/sum.ts\n+++ b/sum.ts\n@@ -1 +1 @@\n-export const sum = (a: number, b: number) => a - b;\n+export const sum = (a: number, b: number) => a + b;\n');
    const green = await runInSandbox({ ...input, patchPath });
    expect(green.status, green.log).toBe("passed");
    await writeFile(patchPath, (await readFile(patchPath, "utf8")).replace("=> a + b", "=> a * b"));
    expect((await runInSandbox({ ...input, patchPath })).status).toBe("failed");
    expect((await runInSandbox({ ...input, files: [{ ...input.files[0]!, path: "../escape.test.ts" }] })).status).toBe("error");
  } finally { await rm(root, { recursive: true, force: true }); }
}, 300_000);

test.skipIf(!process.env.DOCKER_TESTS)("Python sandbox runs pytest with a red base and a green patch", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "br-python-")), source = path.join(root, "source");
  try {
    await mkdir(source); await writeFile(path.join(source, "requirements.txt"), "pytest==8.3.5\n");
    await writeFile(path.join(source, "sum.py"), "def add(a, b):\n    return a - b\n");
    const snapshotPath = path.join(root, "base.tar.gz");
    expect((await command(["tar", "czf", snapshotPath, "-C", source, "."], root)).code).toBe(0);
    const input = { snapshotPath, files: [{ id: "py-fix", path: "__bloodyroar__/test_sum.py", code: 'import pytest\nfrom sum import add\n@pytest.mark.parametrize("a,b,expected", [(2,3,5)], ids=["TC:py-fix"])\ndef test_add(a,b,expected):\n    assert add(a,b)==expected\n' }], framework: "PYTEST" as const, installCommand: "pip install -r requirements.txt pytest", timeoutMs: 60_000 };
    const red = await runInSandbox(input); expect(red.status, red.log).toBe("failed");
    expect(red.results).toMatchObject([{ testCaseId: "py-fix", status: "failed" }]);
    const patchPath = path.join(root, "fix.patch");
    await writeFile(patchPath, 'diff --git a/sum.py b/sum.py\n--- a/sum.py\n+++ b/sum.py\n@@ -1,2 +1,2 @@\n def add(a, b):\n-    return a - b\n+    return a + b\n');
    const green = await runInSandbox({ ...input, patchPath }); expect(green.status, green.log).toBe("passed");
  } finally { await rm(root, { recursive: true, force: true }); }
}, 300_000);

test.skipIf(!process.env.DOCKER_TESTS)("Python installs binary dependencies without executing project setup.py", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "br-python-setup-"));
  try {
    const source = path.join(root, "source"); await mkdir(source);
    await writeFile(path.join(source, "pyproject.toml"), '[build-system]\nrequires=["setuptools"]\nbuild-backend="setuptools.build_meta"\n[project]\nname="malicious"\nversion="1.0.0"\ndependencies=["pytest==8.3.5"]\n');
    await writeFile(path.join(source, "setup.py"), 'from pathlib import Path\nPath("SETUP_EXECUTED").touch()\nraise RuntimeError("Project build must never run")\n');
    const snapshotPath = path.join(root, "base.tar.gz");
    expect((await command(["tar", "czf", snapshotPath, "-C", source, "."], root)).code).toBe(0);
    const result = await runInSandbox({ snapshotPath, framework: "PYTEST", installCommand: "pip install . pytest", files: [{ id: "safe", path: "__bloodyroar__/test_safe.py", code: 'from pathlib import Path\nimport pytest\n@pytest.mark.parametrize("value", [1], ids=["TC:safe"])\ndef test_safe(value):\n    assert not Path("SETUP_EXECUTED").exists()\n' }] });
    expect(result.status, result.log).toBe("passed");
  } finally { await rm(root, { recursive: true, force: true }); }
}, 300_000);

test.skipIf(!process.env.DOCKER_TESTS)("Python sandbox imports packages from the src layout", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "br-python-src-"));
  try {
    const source = path.join(root, "source");
    await mkdir(path.join(source, "src/mypkg"), { recursive: true });
    await writeFile(path.join(source, "requirements.txt"), "pytest==8.3.5\n");
    await writeFile(path.join(source, "src/mypkg/__init__.py"), "VALUE = 42\n");
    const snapshotPath = path.join(root, "base.tar.gz");
    expect((await command(["tar", "czf", snapshotPath, "-C", source, "."], root)).code).toBe(0);
    const result = await runInSandbox({ snapshotPath, framework: "PYTEST", installCommand: "", files: [{ id: "src-import", path: "__bloodyroar__/test_x.py", code: 'import pytest\nfrom mypkg import VALUE\n@pytest.mark.parametrize("expected", [42], ids=["TC:src-import"])\ndef test_import(expected):\n    assert VALUE == expected\n' }] });
    expect(result.status, result.log).toBe("passed");
    expect(result.results).toMatchObject([{ testCaseId: "src-import", status: "passed" }]);
  } finally { await rm(root, { recursive: true, force: true }); }
}, 300_000);
