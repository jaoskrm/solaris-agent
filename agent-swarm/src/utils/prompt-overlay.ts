import { readFileSync, existsSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OVERLAYS_DIR = join(__dirname, '..', 'prompt-overlays');

const overlayCache = new Map<string, string>();

export interface OverlayPayload {
  category: string;
  escalation: string;
  lines: string[];
}

export interface OverlayContent {
  exploitType: string;
  context: string;
  payloads: {
    baseline: string[];
    aggressive: string[];
    evasive: string[];
  };
  bypasses: string[];
  constraints: string[];
  databaseSpecific?: Record<string, string[]>;
}

export function loadOverlay(
  exploitType: string,
  escalationLevel?: 'baseline' | 'aggressive' | 'evasive'
): string {
  const normalized = exploitType.toLowerCase().replace(/\s+/g, '_');
  const cacheKey = `${normalized}:${escalationLevel ?? 'all'}`;

  if (overlayCache.has(cacheKey)) {
    return overlayCache.get(cacheKey)!;
  }

  const overlayPath = join(OVERLAYS_DIR, `${normalized}.md`);

  if (!existsSync(overlayPath)) {
    console.warn(`[prompt-overlay] No overlay found for exploit type: ${exploitType}`);
    return '';
  }

  const content = readFileSync(overlayPath, 'utf-8');
  overlayCache.set(cacheKey, content);
  return content;
}

export function parseOverlayPayloads(
  exploitType: string
): OverlayPayload[] {
  const content = loadOverlay(exploitType);
  if (!content) return [];

  const payloads: OverlayPayload[] = [];
  const lines = content.split('\n');
  let currentCategory = '';
  let currentEscalation = 'baseline';
  let currentLines: string[] = [];

  for (const line of lines) {
    const sectionMatch = line.match(/^###\s+(.+)\s+\((Baseline|Aggressive|Evasive)\)$/);
    if (sectionMatch?.[1] && sectionMatch?.[2]) {
      if (currentLines.length > 0) {
        payloads.push({
          category: currentCategory,
          escalation: currentEscalation,
          lines: [...currentLines],
        });
      }
      currentCategory = sectionMatch[1]!;
      currentEscalation = sectionMatch[2]!.toLowerCase();
      currentLines = [];
      continue;
    }

    const codeBlockMatch = line.match(/^```$/);
    if (codeBlockMatch) {
      continue;
    }

    if (line.startsWith('```')) {
      continue;
    }

    if (line.trim() && !line.startsWith('#') && !line.startsWith('---') && !line.startsWith('##')) {
      const trimmed = line.trim();
      if (trimmed.startsWith('-') || trimmed.startsWith("'") || trimmed.startsWith('"')) {
        currentLines.push(trimmed.replace(/^[-'"]+\s*/, ''));
      }
    }
  }

  if (currentLines.length > 0) {
    payloads.push({
      category: currentCategory,
      escalation: currentEscalation,
      lines: currentLines,
    });
  }

  return payloads;
}

export function getOverlayMetadata(
  exploitType: string
): { exploitType: string; appliesTo: string[]; loading: string } | null {
  const content = loadOverlay(exploitType);
  if (!content) return null;

  const typeMatch = content.match(/\*\*Exploit Type\*\*:\s*(.+)/);
  const appliesMatch = content.match(/\*\*Applies To\*\*:\s*(.+)/);
  const loadingMatch = content.match(/\*\*Loading\*\*:\s*(.+)/);

  return {
    exploitType: typeMatch?.[1] ?? exploitType,
    appliesTo: appliesMatch?.[1]?.split(',').map(s => s.trim()) ?? [],
    loading: loadingMatch?.[1] ?? '',
  };
}

export function listAvailableOverlays(): string[] {
  if (!existsSync(OVERLAYS_DIR)) {
    return [];
  }
  return readdirSync(OVERLAYS_DIR)
    .filter(f => f.endsWith('.md'))
    .map(f => f.replace(/\.md$/, ''));
}

export function clearOverlayCache(): void {
  overlayCache.clear();
}

export function preloadAllOverlays(): void {
  const overlays = listAvailableOverlays();
  for (const overlay of overlays) {
    loadOverlay(overlay);
  }
}
