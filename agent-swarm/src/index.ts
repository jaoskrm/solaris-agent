/**
 * Solaris-Agent Graph Network Infrastructure
 * 
 * Entry point for the agent swarm system.
 */

import { getConfig } from './config/index.js';
import { getFalkorDB } from './infra/falkordb.js';
import { EventBus } from './events/bus.js';

async function main() {
  console.log('╔════════════════════════════════════════════════════════╗');
  console.log('║       Solaris-Agent Graph Network Infrastructure      ║');
  console.log('╚════════════════════════════════════════════════════════╝');
  console.log();

  const config = getConfig();
  console.log(`Environment: ${config.NODE_ENV}`);
  console.log(`Log Level: ${config.LOG_LEVEL}`);
  console.log();

  // Initialize FalkorDB
  console.log('Connecting to FalkorDB...');
  const graph = getFalkorDB();
  
  try {
    await graph.connect();
    const pong = await graph.ping();
    if (pong) {
      console.log('✓ FalkorDB connected');
    } else {
      console.error('✗ FalkorDB ping failed');
    }
  } catch (error) {
    console.error('✗ Failed to connect to FalkorDB:', error);
    console.error('  Make sure your .env has correct FALKORDB_* settings');
    console.error('  Or run `docker-compose up -d` for local development');
  }

  // Initialize Event Bus
  console.log('Initializing SQLite Event Bus...');
  const eventBus = new EventBus(config.SQLITE_EVENTS_PATH);
  console.log(`✓ Event Bus ready (${config.SQLITE_EVENTS_PATH})`);

  console.log();
  console.log('╔════════════════════════════════════════════════════════╗');
  console.log('║              System Ready!                           ║');
  console.log('╚════════════════════════════════════════════════════════╝');
  console.log();
  console.log('Next: Implement your agents in src/agents/');
  console.log('See docs/SOLARIS_AGENT_MVP_GRAPH_NETWORK.md for the plan');
}

main().catch(console.error);
