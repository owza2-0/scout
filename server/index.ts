import express from "express";
import cors from "cors";
import { promises as fs } from "fs";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);
const app = express();
app.use(cors());
app.use(express.json());

const PORT = Number(process.env.PORT ?? 3001);

type FileCategory =
  | "components" | "routes" | "hooks" | "lib" | "types"
  | "config" | "tests" | "context" | "api" | "styles" | "other";

function categorize(filePath: string): FileCategory {
  const lower = filePath.toLowerCase();
  const name = path.basename(lower);
  const parts = lower.split("/");
  if (parts.some(p => p === "components" || p === "component")) return "components";
  if (parts.some(p => p === "pages" || p === "routes" || p === "app" || p === "views")) return "routes";
  if (parts.some(p => p === "hooks")) return "hooks";
  if (parts.some(p => p === "context" || p === "store" || p === "state" || p === "providers")) return "context";
  if (parts.some(p => p === "lib" || p === "utils" || p === "helpers" || p === "shared")) return "lib";
  if (parts.some(p => p === "types" || p === "typings" || p === "interfaces")) return "types";
  if (parts.some(p => p === "api" || p === "services" || p === "endpoints")) return "api";
  if (parts.some(p => p === "__tests__" || p === "tests" || p === "test" || p === "spec")) return "tests";
  if (name.match(/\.(test|spec)\.(ts|tsx|js|jsx)$/)) return "tests";
  if (name.match(/\.(css|scss|sass|less|styl)$/)) return "styles";
  if (name.match(/^(vite|webpack|rollup|babel|jest|vitest|tsconfig|tailwind|postcss|eslint|prettier|next|nuxt)[\.\-]/)) return "config";
  if (name.match(/\.(env|gitignore|dockerignore|editorconfig)/) || name === "package.json" || name === "pnpm-lock.yaml") return "config";
  if (name.match(/\.types?\.(ts|tsx)$/)) return "types";
  if (name.match(/^use[A-Z]/)) return "hooks";
  if (name.match(/\.(ts|tsx|js|jsx)$/)) {
    if (name.match(/^[A-Z]/)) return "components";
    return "lib";
  }
  return "other";
}

const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "build", ".next", ".nuxt", "out", ".cache", "coverage", ".turbo", "__pycache__", ".venv"]);
const ALLOWED_EXT = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".css", ".scss", ".json", ".yaml", ".yml", ".md", ".py", ".rs", ".go"]);

async function walkDir(
  dir: string, base: string,
  results: { path: string; name: string; category: FileCategory; size: number }[],
  depth = 0
) {
  if (depth > 8 || results.length > 2000) return;
  let entries: import("fs").Dirent[];
  try { entries = await fs.readdir(dir, { withFileTypes: true }); } catch { return; }
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walkDir(full, base, results, depth + 1);
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (!ALLOWED_EXT.has(ext)) continue;
      const rel = path.relative(base, full).replace(/\\/g, "/");
      let size = 0;
      try { size = (await fs.stat(full)).size; } catch { /* skip */ }
      results.push({ path: rel, name: entry.name, category: categorize(rel), size });
    }
  }
}

function guessProjectType(files: { path: string }[], pkg: Record<string, unknown> | null): string {
  const paths = files.map(f => f.path.toLowerCase());
  if (paths.some(p => p.includes("next.config"))) return "Next.js";
  if (paths.some(p => p.includes("vite.config"))) return "Vite";
  if (paths.some(p => p.includes("nuxt.config"))) return "Nuxt";
  if (paths.some(p => p.includes("svelte.config"))) return "SvelteKit";
  if (paths.some(p => p.includes("cargo.toml"))) return "Rust";
  if (paths.some(p => p.includes("go.mod"))) return "Go";
  if (paths.some(p => p.includes("requirements.txt") || p.includes("pyproject.toml"))) return "Python";
  if (pkg?.dependencies && typeof pkg.dependencies === "object") {
    const deps = Object.keys(pkg.dependencies as object);
    if (deps.includes("react")) return "React";
    if (deps.includes("vue")) return "Vue";
  }
  if (pkg) return "Node.js";
  return "Unknown";
}

app.post("/api/scout/scan", async (req, res) => {
  const { path: rawPath } = req.body ?? {};
  if (!rawPath || typeof rawPath !== "string") {
    res.status(400).json({ error: "path is required" });
    return;
  }
  const resolved = path.resolve(rawPath.trim());
  try {
    const stat = await fs.stat(resolved);
    if (!stat.isDirectory()) { res.status(400).json({ error: "Not a directory" }); return; }
  } catch {
    res.status(400).json({ error: `Cannot access: ${resolved}` }); return;
  }

  const files: { path: string; name: string; category: FileCategory; size: number }[] = [];
  await walkDir(resolved, resolved, files);
  files.sort((a, b) => a.path.localeCompare(b.path));

  let pkg: Record<string, unknown> | null = null;
  try { pkg = JSON.parse(await fs.readFile(path.join(resolved, "package.json"), "utf-8")); } catch { /* ok */ }

  const projectType = guessProjectType(files, pkg);
  const projectName = (pkg?.name as string) ?? path.basename(resolved);

  const deps: { name: string; version: string; type: "dep" | "dev"; opensrcStatus: "idle" }[] = [];
  if (pkg) {
    for (const [n, v] of Object.entries(pkg.dependencies ?? {})) deps.push({ name: n, version: String(v), type: "dep", opensrcStatus: "idle" });
    for (const [n, v] of Object.entries(pkg.devDependencies ?? {})) deps.push({ name: n, version: String(v), type: "dev", opensrcStatus: "idle" });
  }

  const cats: Partial<Record<FileCategory, number>> = {};
  for (const f of files) cats[f.category] = (cats[f.category] ?? 0) + 1;
  const parts: string[] = [`${projectType} project`];
  if (cats.components) parts.push(`${cats.components} components`);
  if (cats.routes) parts.push(`${cats.routes} routes`);
  if (cats.hooks) parts.push(`${cats.hooks} hooks`);
  if (deps.length) parts.push(`${deps.length} dependencies`);

  let opensrcAvailable = false;
  try { await execFileAsync("opensrc", ["--version"], { timeout: 3000 }); opensrcAvailable = true; } catch { /* not installed */ }

  res.json({ projectName, projectType, summary: parts.join(" · "), files, deps, opensrcAvailable });
});

const AI_KEY = process.env.OPENAI_API_KEY ?? process.env.AI_KEY ?? "";
const AI_BASE = process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1";
const AI_MODEL = process.env.SCOUT_AI_MODEL ?? "gpt-4o-mini";

app.post("/api/scout/chat", async (req, res) => {
  const { messages, checkedFiles, projectSummary } = req.body ?? {};
  if (!AI_KEY) {
    res.json({
      reply:
        "⚠ AI not configured.\n\n" +
        "Add your OpenAI API key to .env:\n\n  OPENAI_API_KEY=sk-...\n\n" +
        "Then restart the server. See README.md for details.\n\n" +
        "File tree and scanning work without an AI key.",
    });
    return;
  }
  const fileList = (checkedFiles as string[] ?? []).join("\n");
  const systemPrompt = `You are Scout, a code inspector assistant. Project: ${projectSummary ?? "Unknown"}.\nSelected files:\n${fileList || "(none)"}`;
  try {
    const r = await fetch(`${AI_BASE}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${AI_KEY}` },
      body: JSON.stringify({ model: AI_MODEL, messages: [{ role: "system", content: systemPrompt }, ...(messages ?? [])], max_tokens: 1024, temperature: 0.3 }),
    });
    if (!r.ok) throw new Error(r.statusText);
    const data = await r.json() as { choices: { message: { content: string } }[] };
    res.json({ reply: data.choices[0]?.message?.content ?? "No response." });
  } catch (e) {
    res.status(502).json({ reply: `Error: ${(e as Error).message}` });
  }
});

app.listen(PORT, () => console.log(`Scout server running on http://localhost:${PORT}`));
