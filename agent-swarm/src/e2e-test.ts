import { EventBus } from './events/bus.js';
import { FalkorDBClient } from './infra/falkordb.js';
import { AlphaAgent } from './agents/alpha.js';
import { getConfig } from './config/index.js';
import { generateMissionId } from './utils/id.js';

const config = getConfig();

interface ReconNode {
  label: string;
  target?: string;
  port?: number;
  protocol?: string;
  path?: string;
  discovered_by?: string;
  name?: string;
  version?: string;
  evidence?: string;
}

async function main() {
  console.log('=== Alpha Agent E2E Test (Direct Scan) ===\n');

  const graph = new FalkorDBClient({
    host: process.env.FALKORDB_HOST || 'caboose.proxy.rlwy.net',
    port: parseInt(process.env.FALKORDB_PORT || '50353'),
    password: process.env.FALKORDB_PASSWORD || 'uLkhZrFuAgKdopfJyxMFGoiVgpTStcRC',
  });
  await graph.connect();
  console.log('✓ FalkorDB connected');

  const bus = new EventBus(config.SQLITE_EVENTS_PATH);
  console.log('✓ Event Bus ready');

  const missionId = generateMissionId();
  console.log(`Mission ID: ${missionId}\n`);

  const alpha = new AlphaAgent({
    agentId: 'alpha-e2e-test',
    agentType: 'alpha',
  });

  await alpha.start();
  console.log('✓ Alpha agent started\n');

  console.log('Emitting scan_initiated event...');
  await bus.emit('scan_initiated', {
    missionId,
    target: '127.0.0.1',
    targetUrl: 'http://127.0.0.1:3000',
    scanType: 'full',
  }, 'alpha-e2e-test');
  console.log('✓ Event emitted\n');

  console.log('Waiting 300 seconds for scan to complete...');
  await new Promise(resolve => setTimeout(resolve, 300000));

  console.log('\n=== Checking FalkorDB for results ===');
  
  const allReconNodes = await graph.findNodesByLabel<ReconNode>('reconNode', {});
  
  const ports = allReconNodes.filter((n: ReconNode) => n.label === 'PortNode');
  const endpoints = allReconNodes.filter((n: ReconNode) => n.label === 'EndpointNode');
  const components = allReconNodes.filter((n: ReconNode) => n.label === 'ComponentNode');
  const findings = allReconNodes.filter((n: ReconNode) => n.label === 'FindingNode');

  console.log(`\nTotal reconNode count: ${allReconNodes.length}`);
  console.log(`PortNodes: ${ports.length}`);
  ports.slice(0, 10).forEach((p: ReconNode) => console.log(`  - ${p.target}:${p.port} (${p.protocol}) discovered_by=${p.discovered_by}`));

  console.log(`\nEndpointNodes: ${endpoints.length}`);
  endpoints.slice(0, 10).forEach((e: ReconNode) => console.log(`  - ${e.target}${e.path} [${e.discovered_by}]`));

  console.log(`\nComponentNodes: ${components.length}`);
  components.slice(0, 10).forEach((c: ReconNode) => console.log(`  - ${c.name} ${c.version || ''}`));

  console.log(`\nFindingNodes: ${findings.length}`);
  findings.slice(0, 5).forEach((f: ReconNode) => console.log(`  - ${f.evidence?.substring(0, 60)}`));

  alpha.stop?.();
  console.log('\n✓ Test complete');

  process.exit(0);
}

main().catch(async (err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
