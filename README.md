# Scout — Project Inspector

A standalone dev tool for understanding codebases. Mount any local project path and Scout categorizes your files, detects dependencies, and lets you ask an AI about selected files — completely isolated from the main Deepflow chat.

## Running locally

Scout runs against the same backend as Deepflow (default: `http://localhost:3000`).

```bash
# 1. Start the shared backend
cd ai-ui && node server.js   # or however you start Deepflow's backend

# 2. Start Scout
cd artifacts/scout
pnpm dev
```

## Enabling AI Chat

The file tree, categorization, and dependency scanning work without any API key.

To enable the "Ask" tab (AI chat about selected files):

1. Open the backend's `.env` file (same server Deepflow uses)
2. Add your OpenAI API key:

```env
OPENAI_API_KEY=sk-...your-key-here...
```

3. Optionally override the model (default: `gpt-4o-mini`):

```env
SCOUT_AI_MODEL=gpt-4o
```

4. Restart the backend — Scout will automatically detect the key and enable chat.

> **No key?** The Ask tab will show a message explaining what to add. Everything else works fine.

## Using opensrc (deeper dependency analysis)

Scout can use [`opensrc`](https://github.com/vercel-labs/opensrc) to fetch the real source code of your project's dependencies, giving the AI much deeper context.

```bash
npm install -g opensrc
```

Once installed, Scout detects it automatically and marks dependencies with a green dot (●) when their source has been fetched.

## How Scout categorizes files

| Category | What goes here |
|---|---|
| Components | Files in `components/`, PascalCase `.tsx` files |
| Routes / Pages | Files in `pages/`, `routes/`, `views/`, `app/` |
| Hooks | Files in `hooks/`, files starting with `use` |
| Context / State | Files in `context/`, `store/`, `providers/` |
| Lib / Utils | Files in `lib/`, `utils/`, `helpers/` |
| Types | Files in `types/`, `*.types.ts` files |
| API | Files in `api/`, `services/`, `endpoints/` |
| Tests | `*.test.*`, `*.spec.*`, `__tests__/` |
| Config | Config files, `package.json`, lock files |
| Styles | `.css`, `.scss`, `.sass` files |
| Other | Everything else |

## Workflow

1. Enter a project path and click **Mount**
2. Browse the categorized file tree — check the files you want to understand
3. Switch to the **Ask** tab — Scout's AI sees exactly which files you selected
4. Ask anything: "Explain these 3 files", "How is state managed?", "What does this hook do?"
5. Use **Copy** (top right) to copy the full tree as context for any other AI chat
