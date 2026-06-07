// Rig validation — the "check your plot for common mistakes" pass that tools
// like Lightwright run: overlapping DMX, duplicate channels, un-patched movers,
// overloaded trusses and an electrical-load sanity check. Pure data in, a flat
// list of issues out (sorted worst-first) for a report panel.
import type { PlacedFixture, Truss } from '../types';
import { findPatchConflicts, footprint, computePower, trussLoads, DEFAULT_TRUSS_CAPACITY } from './patch';

export type IssueSeverity = 'error' | 'warning' | 'info';

export interface RigIssue {
  severity: IssueSeverity;
  message: string;
  ids?: string[]; // affected fixture ids (for highlighting later)
}

const RANK: Record<IssueSeverity, number> = { error: 0, warning: 1, info: 2 };

export function rigCheck(fixtures: PlacedFixture[], trusses: Truss[] = []): RigIssue[] {
  const issues: RigIssue[] = [];
  if (fixtures.length === 0) return issues;

  // 1) Overlapping DMX addresses (same universe, ranges intersect).
  const conflicts = findPatchConflicts(fixtures);
  if (conflicts.size > 0) {
    issues.push({ severity: 'error', message: `${conflicts.size} Leuchte(n) mit überlappender DMX-Adresse`, ids: [...conflicts] });
  }

  // 2) Duplicate channel numbers.
  const byChannel = new Map<number, string[]>();
  for (const f of fixtures) if (f.channel != null) {
    const arr = byChannel.get(f.channel) ?? []; arr.push(f.id); byChannel.set(f.channel, arr);
  }
  const dupChannels = [...byChannel.entries()].filter(([, ids]) => ids.length > 1);
  if (dupChannels.length > 0) {
    const ids = dupChannels.flatMap(([, i]) => i);
    issues.push({ severity: 'warning', message: `${dupChannels.length} doppelte Kanalnummer(n) (${dupChannels.map(([c]) => c).join(', ')})`, ids });
  }

  // 3) DMX fixtures (footprint > 0) without an assigned address.
  const unpatched = fixtures.filter((f) => footprint(f) > 0 && (f.universe == null || f.dmxAddress == null));
  if (unpatched.length > 0) {
    issues.push({ severity: 'warning', message: `${unpatched.length} DMX-Leuchte(n) ohne Patch-Adresse`, ids: unpatched.map((f) => f.id) });
  }

  // 4) Truss overload.
  const { perTruss } = trussLoads(fixtures, trusses);
  for (const t of perTruss) {
    if (t.overloaded) {
      issues.push({ severity: 'error', message: `${t.label}: ${t.weightKg.toFixed(1)} kg über Traglast (${t.capacityKg} kg)` });
    } else if (t.utilization >= 0.8 && t.fixtureCount > 0) {
      issues.push({ severity: 'warning', message: `${t.label}: ${Math.round(t.utilization * 100)} % der Traglast (${t.weightKg.toFixed(1)}/${t.capacityKg} kg)` });
    }
  }
  if (trusses.length === 0 && fixtures.length > 0) {
    issues.push({ severity: 'info', message: 'Keine Traverse definiert – Rigging-Last wird nicht geprüft' });
  } else if (trusses.some((t) => !t.capacity)) {
    issues.push({ severity: 'info', message: `Traglast teils unbekannt – Standardwert ${DEFAULT_TRUSS_CAPACITY} kg/Traverse angenommen` });
  }

  // 5) Electrical-load sanity (single-phase headroom).
  const power = computePower(fixtures);
  if (power.amps1ph > 16) {
    issues.push({ severity: 'info', message: `Gesamtlast ${power.amps1ph.toFixed(1)} A – auf mind. ${power.circuits16A} Stromkreise (16 A) verteilen` });
  }

  return issues.sort((a, b) => RANK[a.severity] - RANK[b.severity]);
}

export function issueCounts(issues: RigIssue[]): { errors: number; warnings: number; infos: number } {
  return {
    errors: issues.filter((i) => i.severity === 'error').length,
    warnings: issues.filter((i) => i.severity === 'warning').length,
    infos: issues.filter((i) => i.severity === 'info').length,
  };
}
