# Solaris Agent

## Project Name

Solaris Agent

A dual-agent autonomous security platform that analyzes AI-generated ("vibecoded") code. A Blue Team, codenamed **VibeCheck**, statically, semantically and architecturally inspects codebases; a Red Team, codenamed **Swarm**, autonomously attacks a local target to validate whether identified vulnerabilities are actually exploitable. A React dashboard ties both teams together.

The repository also tracks a TypeScript + Bun rewrite of the Blue Team (`vibecheck-refactored/`), which is roughly 85% complete with 114 unit tests and 19 Ollama integration tests passing.

## Tech Stack

### Blue Team (VibeCheck, `vibecheck/`)
- Python 3.10+ / 3.12, FastAPI, Uvicorn, Pydantic v2, pydantic-settings
- FalkorDB (RedisGraph-compatible knowledge graph), Qdrant (vector store), Redis Streams (agent message bus), Supabase (Postgres persistence)
- Tree-Sitter (AST/structural analysis), Semgrep (SAST)
- Ollama (local LLM, `qwen2.5-coder:7b-instruct`), OpenRouter (cloud LLM fallback)
- Docker SDK (sandboxed analysis), gitpython, httpx
- structlog, tenacity, aiofiles

### Red Team (Swarm, `swarm module/`)
- Python, LangGraph 0.2.48, LangChain 0.3.19, langchain-openai 0.2.14
- Redis Streams (A2A bus), FalkorDB, Qdrant, Ollama, OpenRouter (Commander: `qwen/qwen3-235b-a22b:free`)
- Docker SDK (attack tooling), nmap, nuclei, sqlmap, OWASP Juice Shop (default target)
- FastAPI (control API)

### Frontend (`frontend/`)
- React 19, Vite 6, Tailwind CSS 4, Framer Motion, Recharts
- react-router-dom 7, lucide-react, three.js
- Supabase JS client, Google GenAI SDK (`@google/genai`)

### Refactor (`vibecheck-refactored/`)
- TypeScript, Bun, Hono, Bun test runner

## Features

### Blue Team - VibeCheck
- Three-layer RAG analysis pipeline over uploaded/analyzed codebases:
  - **Structural**: Tree-Sitter parsing into a FalkorDB knowledge graph (`:File`, `:Function`, `:Class`, `:Import` nodes; `:DEFINES`, `:IMPORTS` edges)
  - **Semantic**: code chunk embeddings in Qdrant for similarity retrieval
  - **Architectural**: semantic clone detection plus LLM-based architectural review
- Supabase persistence (`scans`, `vulnerabilities`, `missions` tables)
- Docker sandbox for safe, isolated code analysis
- Human-in-the-loop review of findings before they are promoted
- MCP server setup via `setup-mcp.sh`
- In-progress upgrades under `blue-team-upgrades/`: semantic lifting agent, behavioral flow analyzer, multi-file context builder, LLM verifier patch, file index builder (see `INTEGRATION_GUIDE.md`)

### Red Team - Swarm
- LangGraph five-phase state machine driving an agent swarm:
  - **Commander** (OpenRouter Qwen3-235B): mission planning and agent dispatch
  - **Alpha Recon** (Ollama): reconnaissance
  - **Gamma Exploit** (Ollama): exploit development and delivery
  - **Critic**: feedback and self-reflection (PentAGI-style loop)
  - **HITL Gate**: human approval checkpoint
- Redis Streams A2A bus for inter-agent messaging
- Toolkit: nmap, nuclei, sqlmap; attacks run in a Docker sandbox against OWASP Juice Shop
- Exploit attempts configurable (raised from 100 to 500), model selection centralized, nmap argument sanitization applied
- Mission state persisted via Supabase + FalkorDB graph

### Frontend
- Live dashboards for both teams: scan results, vulnerability graph, swarm mission telemetry, agent activity
- Modern stack: React 19 + Vite 6 + Tailwind 4 with Framer Motion and Recharts

## Architecture

```
                        ┌─────────────────────┐
                        │    FastAPI / Hono    │
                        │   (Blue Team API)    │
                        └──────────┬──────────┘
                                   │
                ┌──────────────────┼──────────────────┐
                │                  │                  │
        ┌───────▼────────┐ ┌──────▼────────┐ ┌───────▼────────┐
        │ Structural     │ │ Semantic      │ │ Architectural  │
        │ (Tree-Sitter → │ │ (Qdrant       │ │ (clone detect +│
        │  FalkorDB)     │ │  embeddings)  │ │  LLM review)   │
        └───────┬────────┘ └──────┬────────┘ └───────┬────────┘
                │                 │                  │
        ┌───────▼─────────────────▼──────────────────▼────────┐
        │                 Supabase (Postgres)                 │
        │          scans · vulnerabilities · missions         │
        └─────────────────────────┬───────────────────────────┘
                                  │ (mission hand-off)
        ┌─────────────────────────▼───────────────────────────┐
        │              Swarm Red Team (LangGraph)             │
        │  Commander → Alpha Recon → Gamma Exploit → Critic   │
        │              → HITL Gate → Redis Streams A2A        │
        │                 FalkorDB graph, Qdrant              │
        └─────────────────────────┬───────────────────────────┘
                                  │
        ┌─────────────────────────▼───────────────────────────┐
        │        Docker sandbox → OWASP Juice Shop (8080)     │
        └─────────────────────────────────────────────────────┘
```

The Blue Team pipeline is orchestrated by an LLM "semantic lifting" step that connects structural graph facts with semantic embeddings, producing a merged picture of how a codebase works before vulnerabilities are assessed.

## Project Structure

```
solaris-agent/
├── vibecheck/                  # Blue Team (Python / FastAPI)
│   ├── main.py                 # API entry point
│   ├── analyzers/              # Tree-Sitter, Semgrep, clone detection
│   ├── pipeline/               # three-layer RAG pipeline
│   ├── graph/                  # FalkorDB knowledge graph layer
│   ├── vector/                 # Qdrant embeddings
│   ├── storage/                # Supabase persistence
│   ├── requirements.txt
│   └── .env.example
├── vibecheck-refactored/       # TypeScript + Bun + Hono rewrite
│   ├── src/
│   ├── tests/                  # 114 unit tests
│   └── .env.example
├── swarm module/               # Red Team (LangGraph agents)
│   ├── Red_team/               # commander, recon, exploit, critic
│   ├── Blue_team/              # integrations with VibeCheck
│   ├── shared/                 # message bus, graph helpers
│   ├── scripts/                # A2A, health checks
│   └── README.md
├── frontend/                   # React 19 dashboard
├── docs/                       # PRD v4.0, project report
├── plans/                      # SWARM Phase 2, migrations, schemas
├── blue-team-upgrades/         # next-gen analyzers (work in progress)
├── playwright-screenshots/     # UI iteration captures
├── SWARM.md                    # Red Team overview
├── VIBECHECK.md                # Blue Team overview
└── FRONTEND.md                 # Frontend overview
```

## Getting Started

### Prerequisites
- Python 3.10+ (Blue Team / Red Team)
- Docker (sandboxing, OWASP Juice Shop, FalkorDB, Qdrant, Redis)
- Node.js 20+ and npm (frontend)
- Ollama with a local coder model (e.g. `qwen2.5-coder:7b-instruct`), plus an OpenRouter API key for cloud fallback

### Installation

Blue Team (Python):

```bash
cd vibecheck
pip install -r requirements.txt
cp .env.example .env   # fill in API keys and URLs
```

Red Team (Python):

```bash
cd "swarm module"
pip install -r requirements.txt
cp Red_team/.env.example Red_team/.env
```

Frontend:

```bash
cd frontend
npm install
cp .env.example .env.local
```

Refactored Blue Team (Bun):

```bash
cd vibecheck-refactored
bun install
cp .env.example .env
```

Infrastructure:

```bash
docker run -d --name falkordb -p 6379:6379 falkordb/falkordb:latest
docker run -d --name qdrant -p 6333:6333 qdrant/qdrant:latest
docker run -d --name redis-bus -p 6380:6379 redis:7-alpine
docker run -d --name juice-shop -p 8080:3000 bkimminich/juice-shop
```

### Running

Blue Team API:

```bash
cd vibecheck
uvicorn main:app --reload --port 8000
```

Red Team API:

```bash
cd "swarm module"
uvicorn api:app --reload --port 8001
```

Frontend dashboard:

```bash
cd frontend
npm run dev          # expects VITE_API_URL=http://localhost:8000
```

Tests:

```bash
cd vibecheck && pytest            # Python Blue Team tests
cd vibecheck-refactored && bun test   # TypeScript unit + Ollama integration tests
```

## Configuration / Environment Variables

### vibecheck (Blue Team, Python)
| Variable | Description |
| --- | --- |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_ANON_KEY` | Supabase anon key |
| `OPENROUTER_API_KEY` | OpenRouter key for cloud LLM fallback |
| `OPENROUTER_PRIMARY_MODEL` | Primary cloud model (`qwen/qwen3-235b-a22b:free`) |
| `OPENROUTER_FALLBACK_MODEL` | Fallback model (`deepseek/deepseek-r1-0528:free`) |
| `OPENROUTER_HTTP_REFERER` | Referer for OpenRouter attribution |
| `FALKORDB_URL` | `redis://localhost:6379` |
| `QDRANT_URL` | `http://localhost:6333` |
| `REDIS_URL` | `redis://localhost:6380` |
| `OLLAMA_BASE_URL` | Ollama endpoint |
| `OLLAMA_MODEL` | Local model (`qwen2.5-coder:7b-instruct`) |

### Red Team (`swarm module` / `Red_team/.env.example`)
| Variable | Description |
| --- | --- |
| `JUICE_SHOP_URL` | `http://localhost:8080` |
| `JUICE_SHOP_PORT` | `8080` |
| `REDIS_URL` | `redis://localhost:6380` |
| `REDIS_PORT` | `6381` |
| `OLLAMA_BASE_URL` | Ollama endpoint |
| `OPENROUTER_API_KEY` | OpenRouter key for Commander |
| `OPENROUTER_BASE_URL` | OpenRouter base URL |
| `BLUE_TEAM_API_URL` | VibeCheck API, `http://localhost:8000` |
| model selection | Agent model overrides (Commander / Recon / Exploit) |

### Frontend
| Variable | Description |
| --- | --- |
| `VITE_API_URL` | Blue Team API base URL, `http://localhost:8000` |

### vibecheck-refactored (TypeScript)
| Variable | Description |
| --- | --- |
| `NODE_ENV` | `development` / `production` |
| `PORT` | `8000` |
| `LOG_LEVEL` | Log verbosity |
| `LLM_PROVIDER` | `ollama` or `openrouter` |
| `NEO4J_URI` / `NEO4J_USERNAME` / `NEO4J_PASSWORD` | Graph database credentials |
| `QDRANT_URL` / `QDRANT_API_KEY` | Vector store credentials |
| Upstash Redis | Message bus connection settings |
| Supabase | Project URL and keys |

## Notes

- 27 commits; the most recent work moved the Blue Team toward a TypeScript + Bun + Hono implementation (`vibecheck-refactored/`), tracking the original PRD v4.0.
- The Red Team's model selection evolved over time (`qwen2.5-coder:7b-instruct` → experimental uncensored model → back to `qwen2.5-coder:7b-instruct`); exploit attempt limits were raised from 100 to 500 and nmap argument sanitization was added for safe command construction.
- `plans/` documents the next phases: SWARM integration, database schema, SQL migrations, and a week 2 implementation plan for the frontend/backend integration.
- Playwright screenshots in `playwright-screenshots/` capture the evolution of the swarm monitoring UI.
- The Blue Team roadmap (blue-team-upgrades) targets behavioral flow analysis, multi-file context and semantic lifting to close the gap between what code looks like and what it actually does.
