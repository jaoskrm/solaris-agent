# Solaris-Agent Graph Network Infrastructure

Graph-based memory and event infrastructure for the Solaris-Agent swarm system.

## Quick Start

### 1. Install Dependencies

```bash
cd agent-swarm
bun install
```

### 2. Configure Environment

```bash
# Copy example env and edit with your values
cp .env.example .env
```

**Railway FalkorDB (Production):**
```env
FALKORDB_HOST=your-falkordb-host.railway.app
FALKORDB_PORT=6379
FALKORDB_USERNAME=falkordb
FALKORDB_PASSWORD=your-password
```

**Local Development (Alternative):**
```bash
docker-compose up -d
# Then in .env:
# FALKORDB_HOST=localhost
# FALKORDB_PASSWORD=falkordb_dev_password
```

### 3. Initialize FalkorDB

```bash
bun run falkordb:init
```

### 4. Run Tests

```bash
bun test
```

### 5. Start Development

```bash
bun run dev
```

## Project Structure

```
agent-swarm/
├── src/
│   ├── config/          # Environment configuration (Zod validation)
│   ├── graph/           # Graph schema, edges, missions
│   ├── events/           # SQLite event bus
│   ├── infra/           # FalkorDB client
│   └── index.ts         # Main exports
├── tests/
│   └── unit/            # Unit tests
├── docker-compose.yml   # Local dev infrastructure
└── package.json
```

## Core Components

### FalkorDB Client (`src/infra/falkordb.ts`)

Graph database client using Redis protocol:

```typescript
import { getFalkorDB } from './infra/falkordb';

const graph = getFalkorDB();
await graph.connect();

// Create nodes
await graph.createNode('Target', 'target:api.example.com', {
  name: 'Example API',
  base_url: 'https://api.example.com',
});

// Query nodes
const targets = await graph.findNodesByLabel('Target', { status: 'active' });

// Create relationships
await graph.createEdge(fromId, toId, 'PART_OF');

// Atomic mission claiming
const missionId = await graph.claimMission('gamma', 'gamma-1');
```

### Event Bus (`src/events/bus.ts`)

SQLite-based event system for agent communication:

```typescript
import { EventBus } from './events/bus';

const eventBus = new EventBus();

// Emit events
await eventBus.emit('mission_queued', { mission_id: 'm-001' }, 'planner');

// Consume events (with subscription filter)
const events = await eventBus.consume('gamma-1', ['mission_authorized']);
```

### Graph Schema (`src/graph/schema.ts`)

Zod-validated node types:

- `TargetNode`, `EndpointNode`, `ComponentNode`
- `CredentialNode`, `VulnerabilityNode`, `UserNode`
- `MissionNode`, `ExploitNode`, `FindingNode`
- `ChainNode`, `LessonNode`, `IntelNode`
- Plus Phase 2+ types: `BeliefNode`, `GammaHandoffNode`, `WafDuelNode`

## Scripts

| Command | Description |
|---------|-------------|
| `bun run dev` | Start development server |
| `bun run build` | Compile TypeScript |
| `bun run test` | Run all tests |
| `bun run typecheck` | TypeScript type checking |
| `bun run lint` | Run ESLint |
| `bun run falkordb:init` | Initialize FalkorDB indexes |

## Documentation

See `docs/SOLARIS_AGENT_MVP_GRAPH_NETWORK.md` for the full implementation plan.
