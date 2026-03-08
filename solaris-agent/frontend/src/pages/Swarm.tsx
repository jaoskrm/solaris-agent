import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import {
  triggerSwarmMission,
  getSwarmMission,
  getSwarmAgentStates,
  getSwarmEvents,
  getSwarmFindings,
  createSwarmWebSocket,
  type AgentStateResponse,
  type SwarmFindingResponse,
} from '../lib/api';

// Types
interface NodeDef {
  id: string;
  lbl: string;
  team: 'purple' | 'blue' | 'blue2' | 'red' | 'sand';
  x: number;
  y: number;
  z: number;
  r: number;
  desc: string;
}

interface EdgeDef {
  a: string;
  b: string;
  p: boolean;
}

interface AgentLog {
  t: string;
  k: string;
  m: string;
}

interface AgentData {
  team: string;
  eyebrow: string;
  name: string;
  status: string;
  iter: string;
  task: string;
  logs: AgentLog[];
}

interface Finding {
  sev: 'critical' | 'high' | 'medium' | 'low';
  title: string;
  type: string;
  src: string;
  confirmed: boolean;
  agent: string;
  cve: string;
}

// Constants
const NODES: NodeDef[] = [
  { id: 'purple-cmd', lbl: 'PURPLE CMD', team: 'purple', x: 0, y: 2.4, z: 0, r: 0.26, desc: 'Purple Commander' },
  { id: 'kg-agent', lbl: 'KNOWLEDGE GR.', team: 'blue', x: -3.9, y: 1.0, z: -0.7, r: 0.17, desc: 'Knowledge Graph' },
  { id: 'sast-agent', lbl: 'SAST ENGINE', team: 'blue', x: -4.8, y: -0.2, z: 0.7, r: 0.17, desc: 'SAST Semgrep' },
  { id: 'llm-verify', lbl: 'LLM VERIFIER', team: 'blue', x: -3.6, y: -1.4, z: -0.3, r: 0.15, desc: 'LLM Verifier' },
  { id: 'traffic-mon', lbl: 'TRAFFIC MON', team: 'blue2', x: -2.0, y: 0.7, z: -2.9, r: 0.17, desc: 'Traffic Monitor' },
  { id: 'sig-detect', lbl: 'SIG DETECTOR', team: 'blue2', x: -2.9, y: -0.3, z: -3.9, r: 0.15, desc: 'Signature Det.' },
  { id: 'redis-pub', lbl: 'REDIS BRIDGE', team: 'blue2', x: -1.2, y: -1.1, z: -3.7, r: 0.14, desc: 'Redis IPC' },
  { id: 'red-cmd', lbl: 'RED COMMANDER', team: 'red', x: 3.0, y: 1.0, z: -0.7, r: 0.22, desc: 'Red Commander' },
  { id: 'alpha-recon', lbl: 'ALPHA RECON', team: 'red', x: 4.3, y: -0.1, z: 0.7, r: 0.17, desc: 'Alpha Recon' },
  { id: 'gamma-exploit', lbl: 'GAMMA EXPLOIT', team: 'red', x: 3.9, y: -1.3, z: -0.7, r: 0.17, desc: 'Gamma Exploit' },
  { id: 'critic', lbl: 'CRITIC AGENT', team: 'red', x: 2.2, y: -1.2, z: 0.7, r: 0.14, desc: 'Critic Agent' },
  { id: 'sandbox', lbl: 'SANDBOX CTR', team: 'sand', x: 0, y: -2.7, z: 0, r: 0.24, desc: 'vibecheck-sandbox' },
];

const EDGES: EdgeDef[] = [
  { a: 'purple-cmd', b: 'kg-agent', p: true },
  { a: 'purple-cmd', b: 'traffic-mon', p: false },
  { a: 'purple-cmd', b: 'red-cmd', p: true },
  { a: 'kg-agent', b: 'sast-agent', p: false },
  { a: 'sast-agent', b: 'llm-verify', p: false },
  { a: 'traffic-mon', b: 'sig-detect', p: false },
  { a: 'sig-detect', b: 'redis-pub', p: false },
  { a: 'redis-pub', b: 'red-cmd', p: true },
  { a: 'red-cmd', b: 'alpha-recon', p: false },
  { a: 'red-cmd', b: 'gamma-exploit', p: false },
  { a: 'red-cmd', b: 'critic', p: false },
  { a: 'alpha-recon', b: 'sandbox', p: true },
  { a: 'gamma-exploit', b: 'sandbox', p: true },
  { a: 'kg-agent', b: 'sandbox', p: false },
];

const TC: Record<string, [number, number, number]> = {
  purple: [0.68, 0.64, 0.92],
  blue: [0.52, 0.74, 0.95],
  blue2: [0.38, 0.56, 0.82],
  red: [0.92, 0.58, 0.58],
  sand: [0.80, 0.70, 0.46],
};

const TC_CSS: Record<string, string> = {
  purple: 'rgba(174,164,235,0.75)',
  blue: 'rgba(133,189,242,0.72)',
  blue2: 'rgba(97,143,210,0.65)',
  red: 'rgba(235,148,148,0.75)',
  sand: 'rgba(200,175,118,0.80)',
};

const AGENT_DATA: Record<string, AgentData> = {
  'purple-cmd': {
    team: 'purple',
    eyebrow: 'PURPLE TEAM',
    name: 'Purple Commander',
    status: 'ORCHESTRATING',
    iter: 'ITERATION 2/3',
    task: 'Coordinating Blue + Red team strategy. Consuming defense analytics. Adapting attack surface in real time.',
    logs: [
      { t: '16:19:01', k: 'info', m: 'Mission b6dda26e initialized — target localhost:3000' },
      { t: '16:19:03', k: 'action', m: 'Dispatching Alpha Recon: nmap + service fingerprint' },
      { t: '16:19:15', k: 'warn', m: 'Blue intel: HIGH severity /api/login (SQLi)' },
      { t: '16:19:16', k: 'action', m: 'FORBIDDEN: /api/login — 5-iteration cooldown applied' },
      { t: '16:19:20', k: 'info', m: 'Routing Gamma → CUPS :631 (CVE-2022-2587)' },
      { t: '16:19:45', k: 'warn', m: 'CUPS exploit inconclusive — requesting Critic review' },
      { t: '16:19:50', k: 'info', m: 'Critic: try /api/SecurityQuestion + SSRF via file upload' },
    ],
  },
  'kg-agent': {
    team: 'blue',
    eyebrow: 'BLUE ANALYTIC',
    name: 'Knowledge Graph',
    status: 'COMPLETE',
    iter: 'PHASE: COMPLETE',
    task: 'Full AST parse with tree-sitter. Call graph and dependency map built and passed to SAST engine.',
    logs: [
      { t: '16:18:20', k: 'info', m: 'Initializing tree-sitter parser' },
      { t: '16:18:31', k: 'cmd', m: 'tree-sitter parse src/**/*.js --output graph.json' },
      { t: '16:18:44', k: 'success', m: '847 files — 21,403 AST nodes parsed' },
      { t: '16:18:52', k: 'success', m: 'Graph complete: 1,204 nodes / 3,891 edges' },
      { t: '16:18:53', k: 'info', m: 'Forwarding to SAST Semgrep Engine' },
    ],
  },
  'sast-agent': {
    team: 'blue',
    eyebrow: 'BLUE ANALYTIC',
    name: 'SAST Semgrep',
    status: 'COMPLETE',
    iter: 'PHASE: COMPLETE',
    task: 'Full ruleset scan. Deduped 47 → 12 findings. All candidates forwarded for LLM verification.',
    logs: [
      { t: '16:18:54', k: 'cmd', m: 'semgrep --config=auto --json -o findings.json ./src' },
      { t: '16:19:00', k: 'info', m: 'Scan complete. Raw: 47' },
      { t: '16:19:01', k: 'info', m: 'Deduplication: 47 → 12 unique' },
      { t: '16:19:02', k: 'warn', m: 'routes/user.js:142 — SQLi sink' },
      { t: '16:19:03', k: 'warn', m: 'frontend/basket.js:89 — XSS innerHTML' },
      { t: '16:19:05', k: 'info', m: '12 candidates → LLM Verifier' },
    ],
  },
  'llm-verify': {
    team: 'blue',
    eyebrow: 'BLUE ANALYTIC',
    name: 'LLM Verifier',
    status: 'COMPLETE',
    iter: 'PHASE: COMPLETE',
    task: 'Verified SAST candidates via chain-of-thought reasoning. 8 false positives removed. 4 confirmed.',
    logs: [
      { t: '16:19:06', k: 'info', m: '12 candidates received' },
      { t: '16:19:07', k: 'action', m: 'CONFIRMED: routes/user.js:142 — SQLi' },
      { t: '16:19:09', k: 'action', m: 'CONFIRMED: basket.js:89 — Stored XSS' },
      { t: '16:19:11', k: 'info', m: 'FALSE POS: models/order.js:201 — parameterized query' },
      { t: '16:19:13', k: 'success', m: '4 confirmed / 8 false positive' },
      { t: '16:19:14', k: 'info', m: 'Publishing to Purple Report' },
    ],
  },
  'traffic-mon': {
    team: 'blue2',
    eyebrow: 'BLUE DEFENSIVE',
    name: 'Traffic Monitor',
    status: 'ACTIVE',
    iter: 'LIVE',
    task: 'Real-time request analysis on localhost:3000. Publishing severity-classified alerts to Redis stream.',
    logs: [
      { t: '16:19:10', k: 'warn', m: 'POST /api/login — SQLi pattern in body' },
      { t: '16:19:15', k: 'error', m: 'ALERT: SQL_INJECTION /api/login — HIGH' },
      { t: '16:19:16', k: 'action', m: 'Published to defense_analytics' },
      { t: '16:19:22', k: 'warn', m: 'GET /rest/products/search — XSS in ?q=' },
      { t: '16:19:38', k: 'warn', m: 'GET /api/users/1→2 — IDOR probe detected' },
    ],
  },
  'sig-detect': {
    team: 'blue2',
    eyebrow: 'BLUE DEFENSIVE',
    name: 'Signature Detector',
    status: 'ACTIVE',
    iter: 'LIVE',
    task: 'Pattern matching: SQLi, XSS, IDOR, SSRF, path traversal. Severity classification engine.',
    logs: [
      { t: '16:19:10', k: 'warn', m: 'Match: UNION SELECT — SQLi' },
      { t: '16:19:15', k: 'error', m: 'HIGH: SQLi on /api/login' },
      { t: '16:19:22', k: 'warn', m: 'Match: <script>alert — XSS' },
      { t: '16:19:38', k: 'warn', m: 'Match: sequential ID enum — IDOR' },
    ],
  },
  'redis-pub': {
    team: 'blue2',
    eyebrow: 'BLUE DEFENSIVE',
    name: 'Redis IPC Bridge',
    status: 'ACTIVE',
    iter: 'STREAM: defense_analytics',
    task: 'Publishing defense_analytics stream on :6381. Red Commander consumes for real-time strategy adaptation.',
    logs: [
      { t: '16:19:15', k: 'action', m: 'XADD: {type:SQLi, sev:HIGH, ep:/api/login}' },
      { t: '16:19:23', k: 'action', m: 'XADD: {type:XSS, sev:MEDIUM, ep:/rest/products/search}' },
      { t: '16:19:40', k: 'success', m: 'Red Commander consumed. /api/login FORBIDDEN.' },
    ],
  },
  'red-cmd': {
    team: 'red',
    eyebrow: 'RED TEAM',
    name: 'Red Commander',
    status: 'ADAPTING',
    iter: 'ITERATION 2/3',
    task: 'LangGraph orchestrator. OBSERVE → ACT loop. Consuming Blue intel. FORBIDDEN list active on 1 endpoint.',
    logs: [
      { t: '16:19:01', k: 'info', m: 'Commander online — LangGraph state machine init' },
      { t: '16:19:03', k: 'action', m: 'OBSERVE: dispatch Alpha Recon' },
      { t: '16:19:16', k: 'warn', m: 'Intel recv: /api/login FORBIDDEN' },
      { t: '16:19:20', k: 'action', m: 'ADAPT: route Gamma → CUPS :631' },
      { t: '16:19:50', k: 'info', m: 'Critic: try /api/SecurityQuestion + SSRF' },
    ],
  },
  'alpha-recon': {
    team: 'red',
    eyebrow: 'RED TEAM',
    name: 'Alpha Recon',
    status: 'COMPLETE',
    iter: 'PHASE: COMPLETE',
    task: 'Port scan, service enumeration, endpoint discovery. 3 open ports found, 9 API endpoints mapped.',
    logs: [
      { t: '16:19:04', k: 'cmd', m: 'nmap -sV -p 1-65535 --open localhost' },
      { t: '16:19:08', k: 'success', m: '3000: Juice Shop (Node.js)' },
      { t: '16:19:08', k: 'success', m: '631: CUPS 2.4.1 — CVE-2022-2587' },
      { t: '16:19:08', k: 'success', m: '8000: uvicorn ASGI' },
      { t: '16:19:11', k: 'info', m: 'Target map forwarded to Commander' },
    ],
  },
  'gamma-exploit': {
    team: 'red',
    eyebrow: 'RED TEAM',
    name: 'Gamma Exploit',
    status: 'RUNNING',
    iter: 'ITERATION 2/3',
    task: 'Payload delivery. SQLi, XSS, auth bypass, IDOR attempts. Adapting dynamically to FORBIDDEN list.',
    logs: [
      { t: '16:19:18', k: 'cmd', m: "POST /api/login '{\"email\":\"' OR 1=1--\"}'" },
      { t: '16:19:19', k: 'error', m: 'BLOCKED — FORBIDDEN endpoint (Blue HIGH)' },
      { t: '16:19:21', k: 'cmd', m: 'GET /rest/products/search?q=<img src=x onerror=alert(1)>' },
      { t: '16:19:22', k: 'warn', m: 'XSS payload in response — pending Critic' },
      { t: '16:19:24', k: 'cmd', m: 'GET localhost:631/printers — IDOR probe' },
      { t: '16:19:25', k: 'info', m: 'Empty printer list — no path found' },
    ],
  },
  'critic': {
    team: 'red',
    eyebrow: 'RED TEAM',
    name: 'Critic Agent',
    status: 'REVIEWING',
    iter: 'REVIEW CYCLE 2',
    task: 'Validating exploit attempts. Filtering false positives. Recommending strategy pivots to Commander.',
    logs: [
      { t: '16:19:45', k: 'info', m: 'Reviewing 3 Gamma attempts' },
      { t: '16:19:46', k: 'error', m: 'FAILED: /api/login — FORBIDDEN' },
      { t: '16:19:47', k: 'warn', m: 'PARTIAL: XSS delivered, not reflected' },
      { t: '16:19:48', k: 'error', m: 'FAILED: CUPS IDOR — empty resource' },
      { t: '16:19:49', k: 'action', m: 'Pivot: /api/SecurityQuestion' },
      { t: '16:19:50', k: 'action', m: 'Pivot: SSRF via file upload' },
    ],
  },
  'sandbox': {
    team: 'sand',
    eyebrow: 'SHARED INFRA',
    name: 'vibecheck-sandbox',
    status: 'RUNNING',
    iter: 'CONTAINER: ALIVE',
    task: 'Shared Docker container. Privileged + host network. All team tooling executes here. Auto-restart on failure.',
    logs: [
      { t: '16:19:03', k: 'info', m: 'Container init: privileged + network=host' },
      { t: '16:19:04', k: 'cmd', m: '[alpha] nmap -sV -p 1-65535 localhost' },
      { t: '16:19:08', k: 'success', m: 'nmap: 3 services' },
      { t: '16:19:18', k: 'cmd', m: '[gamma] curl POST /api/login SQLi' },
      { t: '16:19:21', k: 'cmd', m: '[gamma] curl GET /rest/products/search XSS' },
      { t: '16:19:24', k: 'cmd', m: '[gamma] curl GET :631/printers' },
    ],
  },
};

const FINDINGS: Finding[] = [
  { sev: 'high', title: 'SQL Injection — /api/login', type: 'SQLi', src: 'SAST+DAST', confirmed: true, agent: 'sast / gamma', cve: '' },
  { sev: 'high', title: 'CUPS RCE — port 631', type: 'RCE', src: 'RECON', confirmed: false, agent: 'alpha-recon', cve: 'CVE-2022-2587' },
  { sev: 'medium', title: 'Stored XSS — Basket/Product', type: 'XSS', src: 'SAST', confirmed: true, agent: 'sast / gamma', cve: '' },
  { sev: 'medium', title: 'IDOR — /api/users/* enumeration', type: 'IDOR', src: 'DAST', confirmed: false, agent: 'gamma', cve: '' },
  { sev: 'medium', title: 'NoSQL Injection — Product model', type: 'NoSQLi', src: 'SAST', confirmed: false, agent: 'sast', cve: '' },
  { sev: 'low', title: 'uvicorn debug endpoint exposed', type: 'DISC', src: 'RECON', confirmed: false, agent: 'alpha-recon', cve: '' },
  { sev: 'low', title: 'Unauth /api/SecurityQuestions', type: 'AUTH', src: 'RECON', confirmed: false, agent: 'alpha-recon', cve: '' },
];

// Shaders
const crystalVert = `
  attribute vec3 faceNormal;
  attribute float aFaceId;
  varying vec3 vFN;
  varying float vFaceId;
  void main() {
    vFN = normalize(normalMatrix * faceNormal);
    vFaceId = aFaceId;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const crystalFrag = `
  varying vec3 vFN;
  varying float vFaceId;
  uniform vec3 uColor;
  uniform float uTime;
  uniform float uSelected;
  uniform float uPhase;
  void main() {
    vec3 N = normalize(vFN);
    float d1 = max(dot(N, normalize(vec3(-0.3, 1.0, 0.7))), 0.0);
    float d2 = max(dot(N, normalize(vec3(0.7, -0.4, 0.3))), 0.0) * 0.35;
    float d3 = max(dot(N, normalize(vec3(0.0, 0.0, 1.0))), 0.0) * 0.2;
    float light = 0.15 + d1 * 0.72 + d2 + d3;
    float fv = fract(sin(vFaceId * 127.1 + 311.7) * 43758.5) * 0.14;
    float spec = pow(max(dot(N, normalize(vec3(-0.3, 1.0, 0.7) + vec3(0.0, 0.0, 1.0))), 0.0), 32.0) * 0.55;
    float pulse = sin(uTime * 3.0 + uPhase) * 0.5 + 0.5;
    vec3 col = uColor * (light + fv + uSelected * pulse * 0.22);
    col += vec3(0.85, 0.92, 1.0) * spec * (0.4 + uSelected * 0.5);
    gl_FragColor = vec4(clamp(col, 0.0, 1.6), 0.78 + uSelected * 0.14);
  }
`;

const wireVert = `void main() { gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

const wireFrag = `
  uniform vec3 uColor;
  uniform float uSelected;
  uniform float uTime;
  uniform float uPhase;
  void main() {
    float p = sin(uTime * 2.5 + uPhase) * 0.5 + 0.5;
    float a = 0.28 + uSelected * (0.28 + p * 0.22);
    gl_FragColor = vec4(uColor * 1.5, a);
  }
`;

const reticleVert = `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

const reticleFrag = `
  varying vec2 vUv;
  uniform vec3 uColor;
  uniform float uTime;
  uniform float uSelected;
  uniform float uPhase;
  #define PI 3.14159265359
  #define TAU 6.28318530718
  void main() {
    vec2 uv = vUv - 0.5;
    float d = length(uv);
    float angle = atan(uv.y, uv.x);
    float norm = (angle + PI) / TAU;
    float rot1 = fract(norm + uTime * 0.07);
    float outerR = smoothstep(0.008, 0.0, abs(d - 0.44));
    float maj = step(fract(rot1 * 8.0), 0.05);
    float mino = step(fract(rot1 * 24.0), 0.03) * (1.0 - maj);
    float tickR = smoothstep(0.007, 0.0, abs(d - (0.44 + maj * 0.045 + mino * 0.022))) * (maj * 0.6 + mino * 0.35);
    float rot2 = fract(norm - uTime * 0.13 + uPhase);
    float dash = step(fract(rot2 * 12.0), 0.58);
    float innerR = smoothstep(0.007, 0.0, abs(d - 0.31)) * dash;
    float crossAngle = norm * 4.0;
    float crossA = fract(crossAngle + uTime * 0.29);
    float isCross = step(crossA, 0.06);
    float crossMask = step(0.32, d) * step(d, 0.42);
    float cross = isCross * crossMask * 0.45;
    float pipAngle = fract(norm * 4.0 + 0.125);
    float isPip = step(pipAngle, 0.08);
    float pipMask = smoothstep(0.008, 0.0, abs(d - 0.17)) * isPip;
    float a = (outerR * 0.65 + tickR + innerR * 0.5 + cross + pipMask * 0.8) * (0.38 + uSelected * 0.55);
    gl_FragColor = vec4(uColor + 0.2, a);
  }
`;

const bgVert = `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

const bgFrag = `
  varying vec2 vUv;
  uniform float uTime;
  float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float n(vec2 p) { vec2 i = floor(p), f = fract(p), u = f * f * (3.0 - 2.0 * f); return mix(mix(h(i), h(i + vec2(1, 0)), u.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), u.x), u.y); }
  float fbm(vec2 p) { float v = 0.0, a = 0.5; for(int i = 0; i < 4; i++) { v += a * n(p); p *= 2.1; a *= 0.5; } return v; }
  void main() {
    vec2 uv = vUv;
    float n1 = fbm(uv * 2.2 + vec2(uTime * 0.012, uTime * 0.008));
    float n2 = fbm(uv * 4.5 - vec2(uTime * 0.007, uTime * 0.018));
    float blueZ = smoothstep(0.7, 0.1, uv.x) * smoothstep(0.0, 0.5, uv.y);
    float amberZ = smoothstep(0.3, 0.9, uv.x) * smoothstep(0.5, 0.9, uv.y);
    vec2 c = uv - 0.5;
    float vig = 1.0 - dot(c, c) * 1.1;
    vec3 col = vec3(0.010, 0.015, 0.022);
    col += vec3(0.02, 0.05, 0.12) * n1 * blueZ * 1.6;
    col += vec3(0.10, 0.06, 0.02) * n2 * amberZ * 0.8;
    col += vec3(0.005, 0.01, 0.025) * n1 * (1.0 - blueZ) * 0.5;
    col *= vig;
    gl_FragColor = vec4(col, 1.0);
  }
`;

function buildFlatGeo(baseGeo: THREE.BufferGeometry): THREE.BufferGeometry {
  const idx = baseGeo.toNonIndexed();
  const pos = idx.getAttribute('position');
  const count = pos.count;
  const faceNormals = new Float32Array(count * 3);
  const faceIds = new Float32Array(count);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), tmp = new THREE.Vector3();
  for (let i = 0; i < count; i += 3) {
    a.fromBufferAttribute(pos, i);
    b.fromBufferAttribute(pos, i + 1);
    c.fromBufferAttribute(pos, i + 2);
    tmp.crossVectors(b.clone().sub(a), c.clone().sub(a)).normalize();
    const fid = i / 3;
    for (let v = 0; v < 3; v++) {
      faceNormals[(i + v) * 3] = tmp.x;
      faceNormals[(i + v) * 3 + 1] = tmp.y;
      faceNormals[(i + v) * 3 + 2] = tmp.z;
      faceIds[i + v] = fid;
    }
  }
  idx.setAttribute('faceNormal', new THREE.BufferAttribute(faceNormals, 3));
  idx.setAttribute('aFaceId', new THREE.BufferAttribute(faceIds, 1));
  return idx;
}

export function Swarm() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const labelsRef = useRef<HTMLDivElement>(null);
  const tickerRef = useRef<HTMLDivElement>(null);
  const [selID, setSelID] = useState<string | null>('purple-cmd');
  const [inspectorData, setInspectorData] = useState<AgentData | null>(AGENT_DATA['purple-cmd']);
  const [inspectorId, setInspectorId] = useState<string>('purple-cmd');
  const [logs, setLogs] = useState<AgentLog[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const [terminalLines, setTerminalLines] = useState<{ t: string; s: string }[]>([]);
  const [execCount, setExecCount] = useState(0);
  const [findingsList, setFindingsList] = useState<Finding[]>([]);

  // Mission state
  const [missionId, setMissionId] = useState<string | null>(null);
  const [missionStatus, setMissionStatus] = useState<string>('idle');
  const [missionProgress, setMissionProgress] = useState(0);
  const [agentStates, setAgentStates] = useState<Record<string, AgentStateResponse>>({});
  const [wsConnected, setWsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  // Clock
  useEffect(() => {
    const timer = setInterval(() => setElapsed(e => e + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  const formatTime = (sec: number) => {
    const h = String(Math.floor(sec / 3600)).padStart(2, '0');
    const m = String(Math.floor((sec % 3600) / 60)).padStart(2, '0');
    const s = String(sec % 60).padStart(2, '0');
    return `${h}:${m}:${s}`;
  };

  // Three.js setup
  useEffect(() => {
    if (!canvasRef.current || !containerRef.current) return;

    const canvas = canvasRef.current;
    const container = containerRef.current;

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x030406, 1);

    const scene = new THREE.Scene();
    const cam = new THREE.PerspectiveCamera(44, 1, 0.1, 80);
    cam.position.z = 13.5;

    const pivot = new THREE.Group();
    scene.add(pivot);

    const nodeByID: Record<string, NodeDef> = {};
    NODES.forEach(n => nodeByID[n.id] = n);

    // Background
    const bgMat = new THREE.ShaderMaterial({
      vertexShader: bgVert,
      fragmentShader: bgFrag,
      uniforms: { uTime: { value: 0 } },
      depthWrite: false,
    });
    const bgMesh = new THREE.Mesh(new THREE.PlaneGeometry(65, 45), bgMat);
    bgMesh.position.z = -20;
    scene.add(bgMesh);

    // Stars
    const sGeo = new THREE.BufferGeometry();
    const sPos = new Float32Array(220 * 3);
    for (let i = 0; i < 220; i++) {
      sPos[i * 3] = (Math.random() - 0.5) * 55;
      sPos[i * 3 + 1] = (Math.random() - 0.5) * 38;
      sPos[i * 3 + 2] = -11 + (Math.random() - 0.5) * 4;
    }
    sGeo.setAttribute('position', new THREE.BufferAttribute(sPos, 3));
    scene.add(new THREE.Points(sGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.038, transparent: true, opacity: 0.09 })));

    // Nodes
    const meshes: THREE.Mesh[] = [];
    const nodeMap: Record<string, {
      m: THREE.Mesh;
      wf: THREE.LineSegments;
      ret: THREE.Mesh;
      glow: THREE.Mesh;
      uniforms: { uColor: { value: THREE.Color }; uTime: { value: number }; uSelected: { value: number }; uPhase: { value: number } };
      wireUni: { uColor: { value: THREE.Color }; uTime: { value: number }; uSelected: { value: number }; uPhase: { value: number } };
      retUni: { uColor: { value: THREE.Color }; uTime: { value: number }; uSelected: { value: number }; uPhase: { value: number } };
      glowMat: THREE.MeshBasicMaterial;
      def: NodeDef;
    }> = {};

    NODES.forEach(def => {
      const [r, g, b] = TC[def.team];
      const ph = Math.random() * Math.PI * 2;

      const uniforms = {
        uColor: { value: new THREE.Color(r, g, b) },
        uTime: { value: 0 },
        uSelected: { value: 0 },
        uPhase: { value: ph },
      };

      const baseGeo = new THREE.OctahedronGeometry(def.r, 1);
      const scales: Record<string, [number, number, number]> = {
        purple: [1, 1.18, 1],
        blue: [0.88, 1.12, 0.88],
        blue2: [1, 1, 1],
        red: [1.08, 0.95, 1.08],
        sand: [1, 0.88, 1],
      };
      const [sx, sy, sz] = scales[def.team];
      const pa = baseGeo.getAttribute('position');
      for (let i = 0; i < pa.count; i++) {
        pa.setXYZ(i, pa.getX(i) * sx, pa.getY(i) * sy, pa.getZ(i) * sz);
      }
      pa.needsUpdate = true;
      baseGeo.computeVertexNormals();

      const mat = new THREE.ShaderMaterial({
        vertexShader: crystalVert,
        fragmentShader: crystalFrag,
        uniforms,
        transparent: true,
        side: THREE.DoubleSide,
      });
      const m = new THREE.Mesh(buildFlatGeo(baseGeo), mat);
      m.position.set(def.x, def.y, def.z);
      m.userData = { id: def.id, phase: ph };
      pivot.add(m);
      meshes.push(m);

      const wireUni = {
        uColor: { value: new THREE.Color(Math.min(r + 0.2, 1), Math.min(g + 0.2, 1), Math.min(b + 0.2, 1)) },
        uTime: { value: 0 },
        uSelected: { value: 0 },
        uPhase: { value: ph },
      };
      const wireMat = new THREE.ShaderMaterial({ vertexShader: wireVert, fragmentShader: wireFrag, uniforms: wireUni, transparent: true });
      const wf = new THREE.LineSegments(new THREE.EdgesGeometry(baseGeo, 12), wireMat);
      wf.position.set(def.x, def.y, def.z);
      pivot.add(wf);

      const retSize = def.r * 6.8;
      const retUni = {
        uColor: { value: new THREE.Color(r, g, b) },
        uTime: { value: 0 },
        uSelected: { value: 0 },
        uPhase: { value: ph },
      };
      const retMat = new THREE.ShaderMaterial({
        vertexShader: reticleVert,
        fragmentShader: reticleFrag,
        uniforms: retUni,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      const ret = new THREE.Mesh(new THREE.PlaneGeometry(retSize, retSize), retMat);
      ret.position.set(def.x, def.y, def.z);
      pivot.add(ret);

      const glowMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(r, g, b), transparent: true, opacity: 0.02, side: THREE.BackSide });
      const glow = new THREE.Mesh(new THREE.SphereGeometry(def.r * 3.5, 6, 6), glowMat);
      glow.position.set(def.x, def.y, def.z);
      pivot.add(glow);

      nodeMap[def.id] = { m, wf, ret, glow, uniforms, wireUni, retUni, glowMat, def };
    });

    // Edges
    const edgeObjs: { mat: THREE.LineBasicMaterial; ba: number }[] = [];
    EDGES.forEach(e => {
      const a = nodeByID[e.a];
      const b = nodeByID[e.b];
      const pts = [new THREE.Vector3(a.x, a.y, a.z), new THREE.Vector3(b.x, b.y, b.z)];
      const ba = e.p ? 0.12 : 0.05;
      const mat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: ba });
      pivot.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), mat));
      edgeObjs.push({ mat, ba });
    });

    // Particles
    const PC = 80;
    const pPos = new Float32Array(PC * 3);
    const pGeo = new THREE.BufferGeometry();
    pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
    pivot.add(new THREE.Points(pGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.038, transparent: true, opacity: 0.36 })));
    const pState = Array.from({ length: PC }, (_, i) => ({ eid: i % EDGES.length, t: Math.random(), spd: 0.003 + Math.random() * 0.006 }));

    // Controls
    let rX = 0.14, rY = 0, dragging = false, lx = 0, ly = 0, zoom = 13.5;

    canvas.addEventListener('mousedown', e => { dragging = true; lx = e.clientX; ly = e.clientY; });
    window.addEventListener('mouseup', () => { dragging = false; });
    window.addEventListener('mousemove', e => {
      if (!dragging) return;
      rY += (e.clientX - lx) * 0.007;
      rX += (e.clientY - ly) * 0.004;
      rX = Math.max(-0.85, Math.min(0.85, rX));
      lx = e.clientX;
      ly = e.clientY;
    });
    canvas.addEventListener('wheel', e => { zoom = Math.max(7.5, Math.min(20, zoom + e.deltaY * 0.016)); });

    // Raycasting
    const rc = new THREE.Raycaster();
    const mv = new THREE.Vector2();
    canvas.addEventListener('click', e => {
      const rect = canvas.getBoundingClientRect();
      mv.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mv.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      rc.setFromCamera(mv, cam);
      const hits = rc.intersectObjects(meshes);
      if (hits.length) {
        const id = hits[0].object.userData.id as string;
        setSelID(id);
        openInspector(id);
      }
    });

    function openInspector(id: string) {
      const d = AGENT_DATA[id];
      if (!d) return;
      setInspectorId(id);
      setInspectorData(d);
      setLogs([]);
      // Animate logs
      d.logs.forEach((l, i) => {
        setTimeout(() => {
          setLogs(prev => [...prev, l]);
        }, i * 75);
      });
    }

    // Resize
    function resize() {
      const w = container.clientWidth;
      const h = container.clientHeight;
      renderer.setSize(w, h);
      cam.aspect = w / h;
      cam.updateProjectionMatrix();
    }
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(container);

    // Labels
    function updateLabels() {
      if (!labelsRef.current) return;
      const lo = labelsRef.current;
      lo.innerHTML = '';
      const rect = canvas.getBoundingClientRect();
      NODES.forEach(def => {
        const p = new THREE.Vector3(def.x, def.y, def.z);
        p.applyEuler(new THREE.Euler(rX, rY, 0, 'XYZ'));
        const proj = p.clone().project(cam);
        if (proj.z >= 1) return;
        const x = (proj.x * 0.5 + 0.5) * rect.width;
        const y = (1 - (proj.y * 0.5 + 0.5)) * rect.height;
        const lbl = document.createElement('div');
        lbl.className = 'nlabel' + (selID === def.id ? ' sel' : '');
        lbl.style.left = x + 'px';
        lbl.style.top = (y + def.r * 60 + 10) + 'px';
        lbl.style.color = TC_CSS[def.team];
        lbl.style.opacity = String(Math.max(0.2, Math.min(1, (p.z + 8) / 16 + 0.2)));
        lbl.textContent = def.lbl;
        lo.appendChild(lbl);
      });
    }

    // Ticker
    const activeEdges = new Set<number>();
    let edgeTmr = 0;
    function addTick(a: string, b: string) {
      if (!tickerRef.current) return;
      const d = document.createElement('div');
      d.className = 'tick';
      d.innerHTML = `<div class="tick-line"></div>${a} <span style="color:var(--amber);opacity:.5">→</span> ${b}`;
      tickerRef.current.appendChild(d);
      setTimeout(() => d.remove(), 4000);
      if (tickerRef.current.children.length > 4) tickerRef.current.firstChild?.remove();
    }

    // Render loop
    let T = 0;
    const _quat = new THREE.Quaternion();
    const _euler = new THREE.Euler();
    let rafId: number;

    function loop() {
      rafId = requestAnimationFrame(loop);
      T += 0.016;
      pivot.rotation.x = rX;
      pivot.rotation.y = rY;
      cam.position.z = zoom;
      bgMat.uniforms.uTime.value = T;

      _euler.set(-rX, -rY, 0, 'YXZ');
      _quat.setFromEuler(_euler);

      NODES.forEach(def => {
        const nm = nodeMap[def.id];
        if (!nm) return;
        const sel = def.id === selID ? 1.0 : 0.0;
        nm.uniforms.uTime.value = T;
        nm.uniforms.uSelected.value += (sel - nm.uniforms.uSelected.value) * 0.10;
        nm.wireUni.uTime.value = T;
        nm.wireUni.uSelected.value = nm.uniforms.uSelected.value;
        nm.retUni.uTime.value = T;
        nm.retUni.uSelected.value = nm.uniforms.uSelected.value;
        nm.ret.quaternion.copy(_quat);
        nm.m.rotation.y = T * 0.20 + def.y * 0.4;
        nm.wf.rotation.y = nm.m.rotation.y;
        const ts = 1.0 + nm.uniforms.uSelected.value * 0.13;
        nm.m.scale.setScalar(nm.m.scale.x + (ts - nm.m.scale.x) * 0.08);
        nm.wf.scale.copy(nm.m.scale);
        nm.glowMat.opacity = 0.015 + nm.uniforms.uSelected.value * 0.055;
      });

      edgeTmr += 0.016;
      if (edgeTmr > 1.0) {
        edgeTmr = 0;
        const idx = Math.floor(Math.random() * EDGES.length);
        activeEdges.add(idx);
        setTimeout(() => activeEdges.delete(idx), 1600);
        const e = EDGES[idx];
        addTick(nodeByID[e.a].desc, nodeByID[e.b].desc);
      }
      edgeObjs.forEach(({ mat, ba }, i) => {
        const t = activeEdges.has(i) ? Math.min(0.65, ba + 0.45) : ba;
        mat.opacity += (t - mat.opacity) * 0.1;
      });

      pState.forEach((ps, i) => {
        ps.t = (ps.t + ps.spd) % 1;
        const e = EDGES[ps.eid];
        const a = nodeByID[e.a];
        const b = nodeByID[e.b];
        pPos[i * 3] = a.x + (b.x - a.x) * ps.t;
        pPos[i * 3 + 1] = a.y + (b.y - a.y) * ps.t;
        pPos[i * 3 + 2] = a.z + (b.z - a.z) * ps.t;
      });
      pGeo.attributes.position.needsUpdate = true;
      updateLabels();
      renderer.render(scene, cam);
    }
    loop();

    return () => {
      cancelAnimationFrame(rafId);
      ro.disconnect();
      renderer.dispose();
    };
  }, [selID]);

  // Terminal animation
  useEffect(() => {
    const TERM_LINES = [
      { t: 'cmd', s: 'nmap -sV -p 1-65535 --open localhost' },
      { t: 'out', s: 'PORT     STATE  SERVICE  VERSION' },
      { t: 'out', s: '631/tcp  open   ipp      CUPS 2.4.1' },
      { t: 'out', s: '3000/tcp open   http     Node.js (Express)' },
      { t: 'out', s: '8000/tcp open   http     uvicorn' },
      { t: 'ok', s: '3 services fingerprinted.' },
      { t: 'cmd', s: "curl -sX POST localhost:3000/api/login -d '{\"email\":\"' OR 1=1--\"}'" },
      { t: 'err', s: '403 Forbidden — [BLUE TEAM BLOCK] HIGH severity on endpoint' },
      { t: 'cmd', s: "curl -s 'localhost:3000/rest/products/search?q=<img src=x onerror=alert(1)>'" },
      { t: 'out', s: '{"status":"success","data":[{"id":1,"name":"Apple Juice..."}]}' },
      { t: 'ok', s: 'XSS payload present in response body.' },
      { t: 'cmd', s: 'curl -s localhost:631/printers' },
      { t: 'out', s: 'No printers are currently configured.' },
      { t: 'err', s: 'IDOR probe inconclusive — empty resource list' },
      { t: 'cmd', s: 'semgrep --config=auto --json ./src' },
      { t: 'ok', s: '12 unique findings post-deduplication.' },
    ];

    let cmdN = 0;
    let tDelay = 1000;
    const timeouts: number[] = [];

    TERM_LINES.forEach(l => {
      const id = window.setTimeout(() => {
        setTerminalLines(prev => [...prev, l]);
        if (l.t === 'cmd') {
          cmdN++;
          setExecCount(cmdN);
        }
      }, tDelay);
      timeouts.push(id);
      tDelay += l.t === 'cmd' ? 860 : 220;
    });

    return () => timeouts.forEach(id => clearTimeout(id));
  }, []);

  // Findings animation
  useEffect(() => {
    const timeouts: number[] = [];
    FINDINGS.forEach((f, i) => {
      const id = window.setTimeout(() => {
        setFindingsList(prev => [...prev, f]);
      }, 1400 + i * 170);
      timeouts.push(id);
    });
    return () => timeouts.forEach(id => clearTimeout(id));
  }, []);

  const nodeByID: Record<string, NodeDef> = {};
  NODES.forEach(n => nodeByID[n.id] = n);

  const getLogClass = (k: string) => {
    switch (k) {
      case 'info': return 'text-[rgba(140,190,240,0.75)]';
      case 'warn': return 'text-[#c8a96e]';
      case 'error': return 'text-[rgba(240,140,140,0.85)]';
      case 'action': return 'text-[rgba(255,255,255,0.52)]';
      case 'success': return 'text-[rgba(150,210,170,0.8)]';
      case 'cmd': return 'text-[rgba(230,170,110,0.85)]';
      default: return 'text-[rgba(255,255,255,0.28)]';
    }
  };

  // Fetch agent states from API
  const fetchAgentStates = useCallback(async () => {
    if (!missionId) return;
    try {
      const states = await getSwarmAgentStates(missionId);
      const statesMap: Record<string, AgentStateResponse> = {};
      states.forEach(state => {
        statesMap[state.agent_id] = state;
      });
      setAgentStates(statesMap);
    } catch (error) {
      console.error('Failed to fetch agent states:', error);
    }
  }, [missionId]);

  // Fetch mission status
  const fetchMissionStatus = useCallback(async () => {
    if (!missionId) return;
    try {
      const mission = await getSwarmMission(missionId);
      setMissionStatus(mission.status);
      setMissionProgress(mission.progress);
    } catch (error) {
      console.error('Failed to fetch mission status:', error);
    }
  }, [missionId]);

  // Fetch findings
  const fetchFindings = useCallback(async () => {
    if (!missionId) return;
    try {
      const findings = await getSwarmFindings(missionId);
      const mappedFindings: Finding[] = findings.map(f => ({
        sev: f.severity as 'critical' | 'high' | 'medium' | 'low',
        title: f.title,
        type: f.finding_type || 'Unknown',
        src: f.source || 'Unknown',
        confirmed: f.confirmed,
        agent: f.agent_name || 'Unknown',
        cve: f.cve_id || '',
      }));
      setFindingsList(mappedFindings);
    } catch (error) {
      console.error('Failed to fetch findings:', error);
    }
  }, [missionId]);

  // Fetch events for selected agent
  const fetchAgentEvents = useCallback(async (agentId: string) => {
    if (!missionId) return;
    try {
      const agentName = AGENT_DATA[agentId]?.name || agentId;
      const events = await getSwarmEvents(missionId, 50, agentName);
      const mappedLogs: AgentLog[] = events.map(e => ({
        t: new Date(e.created_at).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        k: e.event_type,
        m: e.message,
      }));
      setLogs(mappedLogs.reverse());
    } catch (error) {
      console.error('Failed to fetch agent events:', error);
    }
  }, [missionId]);

  // Start a new mission
  const startMission = useCallback(async (target: string) => {
    try {
      const response = await triggerSwarmMission({
        target,
        mode: 'live',
        max_iterations: 3,
      });
      setMissionId(response.mission_id);
      setMissionStatus('pending');
      setMissionProgress(0);
      
      // Add to terminal
      setTerminalLines(prev => [...prev,
        { t: new Date().toLocaleTimeString(), s: `Mission ${response.mission_id.slice(0, 8)}... started` },
        { t: new Date().toLocaleTimeString(), s: `Target: ${target}` },
      ]);
    } catch (error) {
      console.error('Failed to start mission:', error);
      setTerminalLines(prev => [...prev,
        { t: new Date().toLocaleTimeString(), s: `Error: Failed to start mission` },
      ]);
    }
  }, []);

  // WebSocket connection
  useEffect(() => {
    if (!missionId) return;

    const ws = createSwarmWebSocket(missionId);
    wsRef.current = ws;

    ws.onopen = () => {
      setWsConnected(true);
      console.log('WebSocket connected');
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      console.log('WebSocket message:', data);
      
      switch (data.type) {
        case 'mission_state':
          setMissionStatus(data.data.status);
          setMissionProgress(data.data.progress);
          break;
        case 'agent_state':
          fetchAgentStates();
          break;
        case 'new_event':
          if (inspectorId && data.data.agent_name === AGENT_DATA[inspectorId]?.name) {
            fetchAgentEvents(inspectorId);
          }
          break;
        case 'new_finding':
          fetchFindings();
          break;
      }
    };

    ws.onclose = () => {
      setWsConnected(false);
      console.log('WebSocket disconnected');
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      setWsConnected(false);
    };

    return () => {
      ws.close();
    };
  }, [missionId, inspectorId, fetchAgentStates, fetchAgentEvents, fetchFindings]);

  // Poll for updates when mission is active
  useEffect(() => {
    if (!missionId || missionStatus === 'completed' || missionStatus === 'failed' || missionStatus === 'cancelled') {
      return;
    }

    const interval = setInterval(() => {
      fetchMissionStatus();
      fetchAgentStates();
      fetchFindings();
    }, 5000);

    return () => clearInterval(interval);
  }, [missionId, missionStatus, fetchMissionStatus, fetchAgentStates, fetchFindings]);

  // Update inspector data when agent states change
  useEffect(() => {
    if (inspectorId && agentStates[inspectorId]) {
      const state = agentStates[inspectorId];
      setInspectorData(prev => prev ? {
        ...prev,
        status: state.status.toUpperCase(),
        iter: state.iter || 'N/A',
        task: state.task || 'No active task',
      } : null);
    }
  }, [agentStates, inspectorId]);

  return (
    <div
      className="w-full h-screen overflow-hidden text-[rgba(255,255,255,0.52)] font-mono text-[8px] leading-relaxed"
      style={{
        background: '#030406',
        fontFamily: "'JetBrains Mono', monospace",
        '--void': '#030406',
        '--deep': '#060a10',
        '--chamber': '#0b1220',
        '--veil': 'rgba(255,255,255,0.04)',
        '--veil2': 'rgba(255,255,255,0.08)',
        '--veil3': 'rgba(255,255,255,0.14)',
        '--mist': 'rgba(255,255,255,0.28)',
        '--fog': 'rgba(255,255,255,0.52)',
        '--light': 'rgba(255,255,255,0.82)',
        '--white': 'rgba(255,255,255,0.95)',
        '--amber': '#c8a96e',
        '--amber-dim': 'rgba(200,169,110,0.12)',
        '--amber-glow': 'rgba(200,169,110,0.06)',
        '--amber-edge': 'rgba(200,169,110,0.22)',
        '--crit': 'rgba(240,140,140,0.85)',
        '--high': 'rgba(230,170,110,0.85)',
        '--med': 'rgba(200,200,140,0.80)',
        '--low': 'rgba(140,180,210,0.75)',
      } as React.CSSProperties}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,600;1,300;1,400;1,600&family=JetBrains+Mono:wght@300;400;500&display=swap');
        
        @keyframes appReveal { to { opacity: 1; } }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.25; } }
        @keyframes ticklife { 
          0% { opacity: 0; transform: translateY(3px); } 
          8% { opacity: 1; transform: none; } 
          72% { opacity: 1; } 
          100% { opacity: 0; } 
        }
        @keyframes lefade { from { opacity: 0; transform: translateX(5px); } to { opacity: 1; } }
        @keyframes cur { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }
        
        .logs::-webkit-scrollbar { width: 2px; }
        .logs::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius: 2px; }
        .trm-body::-webkit-scrollbar { width: 2px; }
        .trm-body::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); }
        .rpt-body::-webkit-scrollbar { width: 2px; }
        .rpt-body::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); }
        
        .nlabel { 
          position: absolute; 
          transform: translate(-50%, 0); 
          font-size: 7.5px; 
          letter-spacing: 0.14em; 
          white-space: nowrap; 
          text-align: center; 
          pointer-events: none; 
          line-height: 1.6; 
          color: rgba(255,255,255,0.28); 
          transition: color 0.3s, opacity 0.3s; 
        }
        .nlabel.sel { color: rgba(255,255,255,0.95); }
        
        .tick { 
          font-size: 7.5px; 
          letter-spacing: 0.1em; 
          color: rgba(255,255,255,0.28); 
          animation: ticklife 4s ease forwards; 
          display: flex; 
          align-items: center; 
          gap: 8px; 
        }
        .tick-line { width: 24px; height: 1px; background: rgba(200,169,110,0.22); }
        
        .le { 
          display: flex; 
          gap: 8px; 
          font-size: 8px; 
          line-height: 1.65; 
          padding: 2.5px 0; 
          border-bottom: 1px solid rgba(255,255,255,0.022); 
          animation: lefade 0.4s ease; 
        }
        
        .cur { 
          display: inline-block; 
          width: 5px; 
          height: 9px; 
          background: rgba(200,169,110,0.6); 
          vertical-align: text-bottom; 
          margin-left: 2px; 
          animation: cur 1.2s step-end infinite; 
        }
      `}</style>

      <div
        className="relative z-10 grid h-screen opacity-0"
        style={{
          gridTemplateRows: '56px 1fr 234px',
          animation: 'appReveal 1.2s cubic-bezier(0.16,1,0.3,1) 0.8s forwards',
        }}
      >
        {/* Header */}
        <header
          className="flex items-center px-7 relative z-50"
          style={{
            background: 'linear-gradient(180deg, rgba(3,4,6,0.95) 0%, rgba(3,4,6,0.6) 100%)',
            backdropFilter: 'blur(24px)',
            borderBottom: '1px solid rgba(255,255,255,0.08)',
          }}
        >
          <div
            className="absolute top-0 left-0 right-0 h-[1px]"
            style={{
              background: 'linear-gradient(90deg, transparent 0%, rgba(200,169,110,0.22) 20%, rgba(200,169,110,0.5) 50%, rgba(200,169,110,0.22) 80%, transparent 100%)',
            }}
          />
          <div
            className="text-xl font-light tracking-[0.25em] uppercase shrink-0 leading-none"
            style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", color: 'rgba(255,255,255,0.95)' }}
          >
            Vibe<em className="font-semibold not-italic text-[#c8a96e] tracking-[0.1em]">Check</em>
          </div>
          <div className="w-[1px] h-[18px] bg-[rgba(255,255,255,0.08)] mx-6 shrink-0" />
          <div className="flex items-center gap-[7px] text-[8px] tracking-[0.18em] text-[rgba(255,255,255,0.28)]">
            <div
              className="w-[5px] h-[5px] rounded-full bg-[#c8a96e]"
              style={{
                boxShadow: '0 0 8px rgba(200,169,110,0.22), 0 0 16px rgba(200,169,110,0.06)',
                animation: 'pulse 2.8s ease-in-out infinite',
              }}
            />
            <span>MISSION ACTIVE</span>
          </div>
          <div className="w-[1px] h-[18px] bg-[rgba(255,255,255,0.08)] mx-6 shrink-0" />
          <div className="flex items-center gap-[7px] text-[8px] tracking-[0.18em] text-[rgba(255,255,255,0.28)]">
            ID <b className="text-[rgba(255,255,255,0.52)] font-normal">b6dda26e</b>
          </div>
          <div className="w-[1px] h-[18px] bg-[rgba(255,255,255,0.08)] mx-6 shrink-0" />
          <div className="flex items-center gap-[7px] text-[8px] tracking-[0.18em] text-[rgba(255,255,255,0.28)]">
            TARGET <b className="text-[rgba(255,255,255,0.52)] font-normal">localhost:3000</b>
          </div>
          <div className="ml-auto flex items-center gap-0">
            <div className="flex flex-col items-center px-5 gap-[2px] border-l border-[rgba(255,255,255,0.04)]">
              <div
                className="text-lg font-light leading-none tracking-[0.06em]"
                style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", color: 'rgba(255,255,255,0.95)' }}
              >
                11
              </div>
              <div className="text-[7px] tracking-[0.2em] text-[rgba(255,255,255,0.28)]">AGENTS</div>
            </div>
            <div className="flex flex-col items-center px-5 gap-[2px] border-l border-[rgba(255,255,255,0.04)]">
              <div
                className="text-lg font-light leading-none tracking-[0.06em]"
                style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", color: 'rgba(230,170,110,0.85)' }}
              >
                7
              </div>
              <div className="text-[7px] tracking-[0.2em] text-[rgba(255,255,255,0.28)]">FINDINGS</div>
            </div>
            <div className="flex flex-col items-center px-5 gap-[2px] border-l border-r border-[rgba(255,255,255,0.04)]">
              <div
                className="text-lg font-light leading-none tracking-[0.06em]"
                style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", color: 'rgba(150,210,170,0.9)' }}
              >
                2
              </div>
              <div className="text-[7px] tracking-[0.2em] text-[rgba(255,255,255,0.28)]">CONFIRMED</div>
            </div>
            <div className="pl-6 text-[8px] tracking-[0.14em] text-[rgba(255,255,255,0.28)] tabular-nums">
              ELAPSED <span className="text-[#c8a96e]">{formatTime(elapsed)}</span>
            </div>
          </div>
        </header>

        {/* Middle */}
        <div className="grid overflow-hidden relative" style={{ gridTemplateColumns: '1fr 340px' }}>
          {/* Graph */}
          <div ref={containerRef} className="relative overflow-hidden cursor-crosshair">
            {/* Corner Brackets */}
            <div className="absolute top-3 left-3 w-4 h-4 pointer-events-none z-20">
              <div className="absolute top-0 left-0 w-full h-[1px] bg-[rgba(200,169,110,0.5)]" />
              <div className="absolute top-0 left-0 w-[1px] h-full bg-[rgba(200,169,110,0.5)]" />
            </div>
            <div className="absolute top-3 right-3 w-4 h-4 pointer-events-none z-20">
              <div className="absolute top-0 right-0 w-full h-[1px] bg-[rgba(200,169,110,0.5)]" />
              <div className="absolute top-0 right-0 w-[1px] h-full bg-[rgba(200,169,110,0.5)]" />
            </div>
            <div className="absolute bottom-3 left-3 w-4 h-4 pointer-events-none z-20">
              <div className="absolute bottom-0 left-0 w-full h-[1px] bg-[rgba(200,169,110,0.5)]" />
              <div className="absolute bottom-0 left-0 w-[1px] h-full bg-[rgba(200,169,110,0.5)]" />
            </div>
            <div className="absolute bottom-3 right-3 w-4 h-4 pointer-events-none z-20">
              <div className="absolute bottom-0 right-0 w-full h-[1px] bg-[rgba(200,169,110,0.5)]" />
              <div className="absolute bottom-0 right-0 w-[1px] h-full bg-[rgba(200,169,110,0.5)]" />
            </div>
            <canvas ref={canvasRef} className="absolute inset-0" />
            <div ref={labelsRef} className="absolute inset-0 pointer-events-none z-10" />

            {/* Killchain */}
            <div
              className="absolute top-[18px] left-1/2 -translate-x-1/2 z-20 flex items-center px-4 py-[6px]"
              style={{
                background: 'rgba(3,4,6,0.7)',
                backdropFilter: 'blur(16px)',
                border: '1px solid rgba(255,255,255,0.08)',
              }}
            >
              <div
                className="absolute -top-[1px] left-0 right-0 h-[1px]"
                style={{ background: 'linear-gradient(90deg, transparent, rgba(200,169,110,0.22), transparent)' }}
              />
              {[
                { cls: 'done', txt: 'RECON' },
                { cls: 'done', txt: 'WEAPONIZE' },
                { cls: 'live', txt: 'EXPLOIT' },
                { cls: 'pend', txt: 'POST-EXPLOIT' },
                { cls: 'pend', txt: 'REPORT' },
              ].map((ph, i) => (
                <div
                  key={ph.txt}
                  className={`flex items-center gap-[6px] px-3 text-[7.5px] tracking-[0.2em] ${
                    ph.cls === 'done' ? 'text-[rgba(255,255,255,0.28)]' : ph.cls === 'live' ? 'text-[#c8a96e]' : 'text-[rgba(255,255,255,0.14)]'
                  } ${i > 0 ? 'border-l border-[rgba(255,255,255,0.04)]' : ''}`}
                >
                  <div
                    className="w-[4px] h-[4px] rounded-full"
                    style={{
                      background: 'currentColor',
                      boxShadow: ph.cls === 'live' ? '0 0 6px currentColor' : undefined,
                      animation: ph.cls === 'live' ? 'pulse 1.4s ease-in-out infinite' : undefined,
                    }}
                  />
                  {ph.txt}
                </div>
              ))}
            </div>

            {/* Ticker */}
            <div ref={tickerRef} className="absolute bottom-[26px] left-[22px] z-20 pointer-events-none flex flex-col gap-[3px]" />

            {/* Hint */}
            <div className="absolute bottom-[10px] right-[22px] text-[7px] tracking-[0.14em] text-[rgba(255,255,255,0.14)] z-[5] pointer-events-none">
              drag — scroll — click
            </div>
          </div>

          {/* Inspector */}
          <div
            className="flex flex-col overflow-hidden relative"
            style={{
              borderLeft: '1px solid rgba(255,255,255,0.08)',
              background: 'linear-gradient(180deg, rgba(6,10,16,0.95) 0%, rgba(3,4,6,0.98) 100%)',
              backdropFilter: 'blur(20px)',
            }}
          >
            <div
              className="absolute top-0 left-0 right-0 h-[1px]"
              style={{ background: 'linear-gradient(90deg, transparent, rgba(200,169,110,0.22), transparent)' }}
            />
            <div className="flex items-center gap-[10px] px-[18px] py-3 border-b border-[rgba(255,255,255,0.04)] shrink-0">
              <div className="text-[7.5px] tracking-[0.25em] text-[rgba(255,255,255,0.28)] uppercase">Inspector</div>
              <div className="flex-1 h-[1px] bg-[rgba(255,255,255,0.04)]" />
              <div className="text-[7.5px] text-[rgba(255,255,255,0.14)]">{inspectorId}</div>
            </div>

            {inspectorData ? (
              <div className="flex-1 overflow-hidden flex flex-col px-[18px] pt-4">
                <div
                  className="text-[7px] tracking-[0.22em] mb-1 uppercase"
                  style={{ color: TC_CSS[nodeByID[inspectorId]?.team || 'purple'] }}
                >
                  {inspectorData.eyebrow}
                </div>
                <div
                  className="text-xl font-light italic tracking-[0.04em] leading-tight mb-[10px]"
                  style={{
                    fontFamily: "'Cormorant Garamond', Georgia, serif",
                    color: TC_CSS[nodeByID[inspectorId]?.team || 'purple'],
                  }}
                >
                  {inspectorData.name}
                </div>
                <div className="flex items-center gap-2 mb-[10px]">
                  <div
                    className="text-[7px] tracking-[0.18em] px-[9px] py-[2px] border rounded-[1px]"
                    style={{
                      color: TC_CSS[nodeByID[inspectorId]?.team || 'purple'],
                      borderColor: TC_CSS[nodeByID[inspectorId]?.team || 'purple'].replace('0.75)', '0.2)').replace('0.80)', '0.2)').replace('0.72)', '0.2)').replace('0.65)', '0.2)'),
                      background: TC_CSS[nodeByID[inspectorId]?.team || 'purple'].replace('0.75)', '0.06)').replace('0.80)', '0.06)').replace('0.72)', '0.06)').replace('0.65)', '0.06)'),
                    }}
                  >
                    {inspectorData.status}
                  </div>
                  <div className="text-[7.5px] text-[rgba(255,255,255,0.28)] tracking-[0.08em]">{inspectorData.iter}</div>
                </div>
                <div className="text-[9.5px] text-[rgba(255,255,255,0.28)] leading-[1.75] mb-[14px]">{inspectorData.task}</div>
                <div className="text-[7px] tracking-[0.22em] text-[rgba(255,255,255,0.14)] border-b border-[rgba(255,255,255,0.04)] pb-[5px] mb-2">
                  ACTIVITY LOG
                </div>
                <div className="logs flex-1 overflow-y-auto flex flex-col gap-[1px] pb-3">
                  {logs.map((l, i) => (
                    <div key={i} className="le">
                      <span className="text-[rgba(255,255,255,0.14)] shrink-0 w-9 text-[7.5px]">{l.t}</span>
                      <span className={`shrink-0 w-11 text-[7px] tracking-[0.1em] ${getLogClass(l.k)}`}>[{l.k}]</span>
                      <span className="text-[rgba(255,255,255,0.28)] text-[8px]">{l.m}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center gap-[14px] p-5">
                <div className="w-12 h-12 rounded-full border border-[rgba(255,255,255,0.08)] flex items-center justify-center opacity-40">
                  <div className="w-[10px] h-[10px] rounded-full bg-[rgba(255,255,255,0.08)]" />
                </div>
                <p
                  className="text-[13px] italic text-center leading-[1.7] opacity-50"
                  style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", color: 'rgba(255,255,255,0.28)' }}
                >
                  Select a node<br />to inspect the agent
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Bottom */}
        <div className="grid border-t border-[rgba(255,255,255,0.08)] relative" style={{ gridTemplateColumns: '1fr 1fr' }}>
          <div
            className="absolute top-0 left-0 right-0 h-[1px]"
            style={{ background: 'linear-gradient(90deg, transparent, rgba(200,169,110,0.22) 30%, rgba(200,169,110,0.22) 70%, transparent)' }}
          />

          {/* Terminal */}
          <div
            className="flex flex-col overflow-hidden relative border-r border-[rgba(255,255,255,0.08)]"
            style={{
              background: 'linear-gradient(180deg, rgba(4,8,6,0.98) 0%, rgba(3,4,6,0.99) 100%)',
            }}
          >
            <div
              className="absolute inset-0 pointer-events-none z-[2]"
              style={{
                background: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.06) 2px, rgba(0,0,0,0.06) 3px)',
              }}
            />
            <div className="flex items-center gap-[7px] px-[14px] py-[7px] border-b border-[rgba(255,255,255,0.06)] shrink-0 bg-[rgba(255,255,255,0.018)] relative z-[3]">
              <div className="flex gap-[5px]">
                <div className="w-[7px] h-[7px] rounded-full opacity-45 bg-[#c0392b]" />
                <div className="w-[7px] h-[7px] rounded-full opacity-45 bg-[#d4ac0d]" />
                <div className="w-[7px] h-[7px] rounded-full opacity-45 bg-[#27ae60]" />
              </div>
              <div className="text-[7.5px] tracking-[0.16em] text-[rgba(255,255,255,0.28)] flex-1 text-center">
                vibecheck-sandbox — privileged / host network
              </div>
              <div className="text-[7.5px] text-[rgba(255,255,255,0.14)]">{execCount} exec</div>
            </div>
            <div className="trm-body flex-1 overflow-y-auto px-[14px] py-[10px] text-[8.5px] leading-[1.85] relative z-[3]">
              {terminalLines.map((l, i) => (
                <div key={i} className="flex gap-2">
                  {l.t === 'cmd' && (
                    <>
                      <span className="text-[rgba(200,169,110,0.25)] shrink-0">$</span>
                      <span className="text-[rgba(200,169,110,0.7)]">{l.s}</span>
                    </>
                  )}
                  {l.t === 'out' && <span className="text-[rgba(255,255,255,0.25)] pl-3">{l.s}</span>}
                  {l.t === 'ok' && <span className="text-[rgba(150,210,170,0.65)] pl-3">✓ {l.s}</span>}
                  {l.t === 'err' && <span className="text-[rgba(230,140,140,0.65)] pl-3">✗ {l.s}</span>}
                </div>
              ))}
              {terminalLines.length > 0 && (
                <div className="flex gap-2">
                  <span className="text-[rgba(200,169,110,0.25)] shrink-0">$</span>
                  <span className="cur" />
                </div>
              )}
            </div>
          </div>

          {/* Findings Report */}
          <div
            className="flex flex-col overflow-hidden"
            style={{
              background: 'linear-gradient(180deg, rgba(6,10,16,0.97) 0%, rgba(3,4,6,0.99) 100%)',
            }}
          >
            <div className="flex items-center gap-0 px-[14px] py-[7px] border-b border-[rgba(255,255,255,0.04)] shrink-0">
              <div
                className="text-[13px] italic font-light"
                style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", color: 'rgba(255,255,255,0.52)' }}
              >
                Findings Report
              </div>
              <div className="ml-auto flex gap-0">
                <div className="flex flex-col items-center gap-[1px] px-[14px] border-l border-[rgba(255,255,255,0.04)]">
                  <div
                    className="text-lg font-light leading-[1.1]"
                    style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", color: 'rgba(230,170,110,0.85)' }}
                  >
                    4
                  </div>
                  <div className="text-[7px] tracking-[0.15em] text-[rgba(255,255,255,0.28)]">SAST</div>
                </div>
                <div className="flex flex-col items-center gap-[1px] px-[14px] border-l border-[rgba(255,255,255,0.04)]">
                  <div
                    className="text-lg font-light leading-[1.1]"
                    style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", color: 'rgba(255,255,255,0.95)' }}
                  >
                    7
                  </div>
                  <div className="text-[7px] tracking-[0.15em] text-[rgba(255,255,255,0.28)]">TOTAL</div>
                </div>
                <div className="flex flex-col items-center gap-[1px] px-[14px] border-l border-[rgba(255,255,255,0.04)]">
                  <div
                    className="text-lg font-light leading-[1.1]"
                    style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", color: 'rgba(150,210,170,0.85)' }}
                  >
                    2
                  </div>
                  <div className="text-[7px] tracking-[0.15em] text-[rgba(255,255,255,0.28)]">CONFIRMED</div>
                </div>
              </div>
            </div>
            <div className="rpt-body flex-1 overflow-y-auto px-2 py-[7px] flex flex-col gap-1">
              {findingsList.map((f, i) => (
                <div
                  key={i}
                  className={`p-[7px_10px] cursor-pointer relative overflow-hidden transition-all duration-200 hover:bg-[rgba(255,255,255,0.032)] hover:border-[rgba(255,255,255,0.08)] ${
                    f.confirmed ? 'bg-[rgba(150,210,170,0.028)] border-[rgba(150,210,170,0.12)]' : 'bg-[rgba(255,255,255,0.016)] border border-[rgba(255,255,255,0.04)]'
                  }`}
                  style={{ borderRadius: '1px' }}
                >
                  <div
                    className="absolute left-0 top-0 bottom-0 w-[2px]"
                    style={{
                      background:
                        f.sev === 'critical'
                          ? 'rgba(240,140,140,0.85)'
                          : f.sev === 'high'
                          ? 'rgba(230,170,110,0.85)'
                          : f.sev === 'medium'
                          ? 'rgba(200,200,140,0.80)'
                          : 'rgba(140,180,210,0.75)',
                      boxShadow:
                        f.sev === 'critical' || f.sev === 'high' ? `0 0 8px ${f.sev === 'critical' ? 'rgba(240,140,140,0.85)' : 'rgba(230,170,110,0.85)'}` : undefined,
                    }}
                  />
                  <div className="flex items-center gap-[7px] mb-[3px]">
                    <div
                      className="text-[6.5px] tracking-[0.14em] px-[6px] py-[1px] border rounded-[1px] shrink-0"
                      style={{
                        color:
                          f.sev === 'critical'
                            ? 'rgba(240,140,140,0.85)'
                            : f.sev === 'high'
                            ? 'rgba(230,170,110,0.85)'
                            : f.sev === 'medium'
                            ? 'rgba(200,200,140,0.80)'
                            : 'rgba(140,180,210,0.75)',
                        borderColor:
                          f.sev === 'critical'
                            ? 'rgba(240,140,140,0.85)'
                            : f.sev === 'high'
                            ? 'rgba(230,170,110,0.85)'
                            : f.sev === 'medium'
                            ? 'rgba(200,200,140,0.80)'
                            : 'rgba(140,180,210,0.75)',
                      }}
                    >
                      {f.sev.toUpperCase()}
                    </div>
                    <div className="text-[10px] text-[rgba(255,255,255,0.52)] flex-1 tracking-[0.01em]">{f.title}</div>
                    {f.confirmed ? (
                      <div
                        className="text-[6.5px] tracking-[0.12em] px-[6px] py-[1px] rounded-[1px] border"
                        style={{
                          background: 'rgba(150,210,170,0.06)',
                          borderColor: 'rgba(150,210,170,0.18)',
                          color: 'rgba(150,210,170,0.75)',
                        }}
                      >
                        CONFIRMED
                      </div>
                    ) : (
                      <div
                        className="text-[6.5px] tracking-[0.12em] px-[6px] py-[1px] rounded-[1px] border"
                        style={{
                          background: 'rgba(255,255,255,0.04)',
                          borderColor: 'rgba(255,255,255,0.08)',
                          color: 'rgba(255,255,255,0.28)',
                        }}
                      >
                        STATIC
                      </div>
                    )}
                  </div>
                  <div className="text-[7px] text-[rgba(255,255,255,0.28)] tracking-[0.06em] flex gap-[10px]">
                    <span>{f.type}</span>
                    <span>{f.src}</span>
                    {f.cve && <span style={{ color: 'rgba(240,140,140,0.85)' }}>{f.cve}</span>}
                    <span style={{ color: 'rgba(255,255,255,0.28)' }}>{f.agent}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
