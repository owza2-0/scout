import { useState, useRef, useEffect } from "react";
import { Telescope, FolderOpen, RefreshCw, Copy, Check, Send, Bot, AlertCircle, Package, ChevronRight, ChevronDown, File, Loader2, X } from "lucide-react";

const API = import.meta.env.BASE_URL.replace(/\/$/, "").replace("/scout", "") + "/api";

type FileCategory = "components" | "routes" | "hooks" | "lib" | "types" | "config" | "tests" | "context" | "api" | "styles" | "other";

interface ScoutFile {
  path: string;
  name: string;
  category: FileCategory;
  size: number;
}

interface Dep {
  name: string;
  version: string;
  type: "dep" | "dev";
  opensrcPath?: string | null;
  opensrcStatus?: "fetching" | "ready" | "unavailable" | "idle";
}

interface ScanResult {
  projectName: string;
  projectType: string;
  summary: string;
  files: ScoutFile[];
  deps: Dep[];
}

interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

const CATEGORY_META: Record<FileCategory, { label: string; color: string; icon: string }> = {
  components: { label: "Components", color: "text-cyan-400 bg-cyan-400/10 border-cyan-400/20", icon: "⬡" },
  routes:     { label: "Routes / Pages", color: "text-violet-400 bg-violet-400/10 border-violet-400/20", icon: "⇒" },
  hooks:      { label: "Hooks", color: "text-amber-400 bg-amber-400/10 border-amber-400/20", icon: "↩" },
  lib:        { label: "Lib / Utils", color: "text-emerald-400 bg-emerald-400/10 border-emerald-400/20", icon: "◈" },
  types:      { label: "Types", color: "text-blue-400 bg-blue-400/10 border-blue-400/20", icon: "T" },
  config:     { label: "Config", color: "text-orange-400 bg-orange-400/10 border-orange-400/20", icon: "⚙" },
  tests:      { label: "Tests", color: "text-pink-400 bg-pink-400/10 border-pink-400/20", icon: "✓" },
  context:    { label: "Context / State", color: "text-teal-400 bg-teal-400/10 border-teal-400/20", icon: "◎" },
  api:        { label: "API", color: "text-indigo-400 bg-indigo-400/10 border-indigo-400/20", icon: "⟳" },
  styles:     { label: "Styles", color: "text-rose-400 bg-rose-400/10 border-rose-400/20", icon: "◐" },
  other:      { label: "Other", color: "text-zinc-400 bg-zinc-400/10 border-zinc-400/20", icon: "·" },
};

function CategoryBadge({ cat }: { cat: FileCategory }) {
  const m = CATEGORY_META[cat];
  return (
    <span className={`category-badge border font-mono ${m.color}`}>
      {m.icon} {m.label}
    </span>
  );
}

function FileRow({ file, checked, onToggle }: { file: ScoutFile; checked: boolean; onToggle: () => void }) {
  return (
    <label className={`flex items-center gap-2 px-2 py-1 rounded cursor-pointer text-xs group transition-colors ${checked ? "bg-primary/10" : "hover:bg-secondary/60"}`}>
      <input type="checkbox" checked={checked} onChange={onToggle} className="accent-primary shrink-0" />
      <File className={`size-3 shrink-0 ${checked ? "text-primary" : "text-muted-foreground"}`} />
      <span className={`truncate font-mono ${checked ? "text-primary" : "text-foreground/80"}`}>{file.path}</span>
      <span className="ml-auto text-muted-foreground shrink-0">{(file.size / 1024).toFixed(1)}k</span>
    </label>
  );
}

function FileTree({ files, checked, onToggle }: { files: ScoutFile[]; checked: Set<string>; onToggle: (p: string) => void }) {
  const [collapsed, setCollapsed] = useState<Set<FileCategory>>(new Set());
  const grouped = Object.entries(CATEGORY_META)
    .map(([cat]) => ({ cat: cat as FileCategory, items: files.filter(f => f.category === cat) }))
    .filter(g => g.items.length > 0);

  const toggle = (cat: FileCategory) =>
    setCollapsed(s => { const n = new Set(s); n.has(cat) ? n.delete(cat) : n.add(cat); return n; });

  return (
    <div className="flex flex-col gap-1">
      {grouped.map(({ cat, items }) => (
        <div key={cat} className="rounded border border-border/50 overflow-hidden">
          <button
            onClick={() => toggle(cat)}
            className="flex items-center gap-2 w-full px-2 py-1.5 bg-card hover:bg-secondary/40 transition-colors text-left"
          >
            {collapsed.has(cat) ? <ChevronRight className="size-3 text-muted-foreground" /> : <ChevronDown className="size-3 text-muted-foreground" />}
            <CategoryBadge cat={cat} />
            <span className="ml-auto text-xs text-muted-foreground">{items.length}</span>
          </button>
          {!collapsed.has(cat) && (
            <div className="bg-background/40 px-1 py-1 flex flex-col gap-0.5">
              {items.map(f => (
                <FileRow key={f.path} file={f} checked={checked.has(f.path)} onToggle={() => onToggle(f.path)} />
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function DepsPanel({ deps }: { deps: Dep[] }) {
  const prod = deps.filter(d => d.type === "dep");
  const dev = deps.filter(d => d.type === "dev");
  return (
    <div className="flex flex-col gap-2 text-xs">
      {[{ label: "Dependencies", items: prod }, { label: "Dev Dependencies", items: dev }].map(({ label, items }) =>
        items.length > 0 ? (
          <div key={label}>
            <div className="text-muted-foreground mb-1 text-[10px] uppercase tracking-widest">{label} ({items.length})</div>
            <div className="flex flex-col gap-0.5">
              {items.map(d => (
                <div key={d.name} className="flex items-center gap-2 px-2 py-1 rounded bg-card border border-border/40">
                  <Package className="size-3 text-muted-foreground shrink-0" />
                  <span className="font-mono text-foreground/90 truncate">{d.name}</span>
                  <span className="ml-auto text-muted-foreground shrink-0">{d.version}</span>
                  {d.opensrcStatus === "ready" && <span className="text-emerald-400 shrink-0" title="Source fetched via opensrc">●</span>}
                  {d.opensrcStatus === "unavailable" && <span className="text-zinc-500 shrink-0" title="opensrc unavailable">○</span>}
                </div>
              ))}
            </div>
          </div>
        ) : null
      )}
    </div>
  );
}

function ChatPanel({ checkedFiles, allFiles, projectSummary }: { checkedFiles: string[]; allFiles: ScoutFile[]; projectSummary: string }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const send = async () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput("");
    const userMsg: ChatMessage = { role: "user", content: text };
    setMessages(prev => [...prev, userMsg]);
    setLoading(true);
    try {
      const res = await fetch(`${API}/scout/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [...messages, userMsg],
          checkedFiles,
          projectSummary,
          fileContents: allFiles.filter(f => checkedFiles.includes(f.path)).map(f => f.path),
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const { reply } = await res.json();
      setMessages(prev => [...prev, { role: "assistant", content: reply }]);
    } catch (e) {
      setMessages(prev => [...prev, { role: "assistant", content: `⚠ ${(e as Error).message}` }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto flex flex-col gap-3 p-3 min-h-0">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground text-xs text-center px-4">
            <Bot className="size-8 opacity-30" />
            <p>Check files in the tree, then ask anything —<br />&ldquo;Explain these 3 files&rdquo;, &ldquo;What does this hook do?&rdquo;, &ldquo;How is state managed?&rdquo;</p>
            {checkedFiles.length === 0 && <p className="text-amber-400/60 mt-1">← Select files first</p>}
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`text-xs rounded p-2.5 ${m.role === "user" ? "bg-primary/10 border border-primary/20 text-foreground ml-4" : "bg-card border border-border text-foreground/90 mr-4"}`}>
            {m.role === "assistant" && <div className="text-primary text-[10px] mb-1 uppercase tracking-widest">Scout</div>}
            <pre className="whitespace-pre-wrap font-mono leading-relaxed">{m.content}</pre>
          </div>
        ))}
        {loading && (
          <div className="bg-card border border-border rounded p-2.5 mr-4">
            <Loader2 className="size-3 animate-spin text-primary" />
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {checkedFiles.length > 0 && (
        <div className="px-3 pb-1">
          <div className="flex flex-wrap gap-1">
            {checkedFiles.map(f => (
              <span key={f} className="text-[10px] bg-primary/10 border border-primary/20 text-primary rounded px-1.5 py-0.5 font-mono truncate max-w-[160px]" title={f}>{f.split("/").pop()}</span>
            ))}
          </div>
        </div>
      )}

      <div className="border-t border-border p-2 flex gap-2">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), send())}
          placeholder={checkedFiles.length > 0 ? `Ask about ${checkedFiles.length} file${checkedFiles.length > 1 ? "s" : ""}…` : "Select files to start…"}
          className="flex-1 bg-input border border-border rounded px-2.5 py-1.5 text-xs font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
        <button
          onClick={send}
          disabled={!input.trim() || loading || checkedFiles.length === 0}
          className="p-1.5 rounded bg-primary text-primary-foreground disabled:opacity-40 hover:opacity-90 transition-opacity"
        >
          <Send className="size-3.5" />
        </button>
      </div>
    </div>
  );
}

export default function App() {
  const [path, setPath] = useState("");
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<"tree" | "deps" | "chat">("tree");

  const mount = async () => {
    const p = path.trim();
    if (!p) return;
    setScanning(true);
    setError(null);
    setResult(null);
    setChecked(new Set());
    try {
      const res = await fetch(`${API}/scout/scan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: p }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setResult(data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setScanning(false);
    }
  };

  const toggleFile = (p: string) =>
    setChecked(s => { const n = new Set(s); n.has(p) ? n.delete(p) : n.add(p); return n; });

  const checkedList = Array.from(checked);

  const copyTree = () => {
    if (!result) return;
    const lines = result.files
      .filter(f => checked.size === 0 || checked.has(f.path))
      .map(f => `[${f.category}] ${f.path}`);
    navigator.clipboard.writeText(`# ${result.projectName}\n${result.summary}\n\n${lines.join("\n")}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden">
      {/* Header */}
      <header className="shrink-0 border-b border-border bg-card/60 backdrop-blur px-4 py-2.5 flex items-center gap-3">
        <div className="flex items-center gap-2">
          <Telescope className="size-4 text-primary" />
          <span className="font-mono text-sm font-semibold text-primary tracking-wide">SCOUT</span>
          <span className="text-muted-foreground text-xs">/ project inspector</span>
        </div>
        {result && (
          <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
            <span className="bg-primary/10 border border-primary/20 text-primary rounded px-2 py-0.5 font-mono">{result.projectType}</span>
            <span>{result.files.length} files</span>
            {checked.size > 0 && <span className="text-primary">· {checked.size} selected</span>}
          </div>
        )}
      </header>

      {/* Path bar */}
      <div className="shrink-0 border-b border-border bg-background/80 px-4 py-2 flex gap-2 items-center">
        <FolderOpen className="size-4 text-muted-foreground shrink-0" />
        <input
          value={path}
          onChange={e => setPath(e.target.value)}
          onKeyDown={e => e.key === "Enter" && mount()}
          placeholder="Enter project path  e.g. /home/user/my-project"
          className="flex-1 bg-transparent text-xs font-mono text-foreground placeholder:text-muted-foreground focus:outline-none"
        />
        <button
          onClick={mount}
          disabled={scanning || !path.trim()}
          className="flex items-center gap-1.5 px-3 py-1 rounded bg-primary text-primary-foreground text-xs font-mono disabled:opacity-50 hover:opacity-90 transition-opacity scout-glow"
        >
          {scanning ? <Loader2 className="size-3 animate-spin" /> : <RefreshCw className="size-3" />}
          {scanning ? "Scanning…" : "Mount"}
        </button>
        {result && (
          <button onClick={copyTree} className="flex items-center gap-1 px-2 py-1 rounded border border-border text-xs text-muted-foreground hover:text-foreground transition-colors">
            {copied ? <Check className="size-3 text-primary" /> : <Copy className="size-3" />}
          </button>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="shrink-0 mx-4 mt-3 flex items-start gap-2 text-xs bg-destructive/10 border border-destructive/30 rounded p-3 text-destructive-foreground">
          <AlertCircle className="size-3.5 shrink-0 mt-0.5 text-destructive" />
          <span>{error}</span>
          <button onClick={() => setError(null)} className="ml-auto shrink-0"><X className="size-3" /></button>
        </div>
      )}

      {/* Welcome / empty */}
      {!result && !scanning && !error && (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center px-8">
          <Telescope className="size-12 text-primary/20" />
          <div>
            <p className="text-sm text-foreground/70 font-mono">Enter a project path and click <strong className="text-primary">Mount</strong></p>
            <p className="text-xs text-muted-foreground mt-1">Scout will categorize your files and let you ask the AI about any of them</p>
          </div>
          <div className="text-xs text-muted-foreground/50 font-mono border border-border/30 rounded px-3 py-2 text-left max-w-sm">
            <div className="text-primary/50 mb-1"># examples</div>
            <div>/home/user/my-app</div>
            <div>C:\Users\me\projects\deepflow</div>
            <div>./relative/path</div>
          </div>
        </div>
      )}

      {/* Main layout */}
      {result && (
        <div className="flex-1 flex flex-col min-h-0">
          {/* Summary bar */}
          <div className="shrink-0 px-4 py-2 border-b border-border bg-card/30 text-xs text-muted-foreground font-mono">
            <span className="text-foreground font-semibold">{result.projectName}</span>
            <span className="mx-2 text-border">·</span>
            {result.summary}
          </div>

          {/* Tabs */}
          <div className="shrink-0 flex gap-0 border-b border-border bg-card/20">
            {(["tree", "deps", "chat"] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-2 text-xs font-mono transition-colors border-b-2 ${activeTab === tab ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
              >
                {tab === "tree" && `Files (${result.files.length})`}
                {tab === "deps" && `Deps (${result.deps.length})`}
                {tab === "chat" && (checked.size > 0 ? `Ask (${checked.size} selected)` : "Ask")}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div className="flex-1 min-h-0 overflow-y-auto">
            {activeTab === "tree" && (
              <div className="p-3">
                {checked.size > 0 && (
                  <div className="mb-2 flex items-center gap-2 text-xs">
                    <span className="text-primary">{checked.size} file{checked.size > 1 ? "s" : ""} selected</span>
                    <button onClick={() => setChecked(new Set())} className="text-muted-foreground hover:text-foreground">clear</button>
                    <button onClick={() => setActiveTab("chat")} className="ml-auto text-primary underline">Ask Scout →</button>
                  </div>
                )}
                <FileTree files={result.files} checked={checked} onToggle={toggleFile} />
              </div>
            )}
            {activeTab === "deps" && (
              <div className="p-3">
                <DepsPanel deps={result.deps} />
              </div>
            )}
            {activeTab === "chat" && (
              <div className="h-full">
                <ChatPanel
                  checkedFiles={checkedList}
                  allFiles={result.files}
                  projectSummary={result.summary}
                />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
