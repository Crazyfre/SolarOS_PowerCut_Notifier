// KSEB LT-1A domestic tariff model (KSERC Tariff Order 2025-2027,
// effective 01.04.2025 – 31.03.2027).
//
// Two-regime slab system:
//  - Telescopic (≤250 units/mo): each block of units billed at its own rate.
//  - Non-telescopic (>250 units/mo): ALL units billed at a single band rate
//    determined by total consumption — the infamous "bill cliff" at 251.
//
// All rates live in TariffConfig (persisted in settings) — never hardcoded —
// because KSERC revises slabs every April. A user-visible slab editor can
// therefore correct values without an app update.
//
// Scope per product decisions: energy charges + 10% electricity duty only.
// Fixed charges, meter rent and FAC are deliberately excluded (they are
// solar-invariant for the savings counterfactual except for the slab-linked
// fixed charge, which is deferred).

import type { TariffConfig } from '../../types/telemetry';

export const DEFAULT_KSEB_TARIFF: TariffConfig = {
  scheme: 'net-metering',
  // Telescopic blocks: cumulative upper bound → rate
  telescopicSlabs: [
    { upTo: 50, rate: 3.35 },
    { upTo: 100, rate: 4.25 },
    { upTo: 150, rate: 5.35 },
    { upTo: 200, rate: 7.2 },
    { upTo: 250, rate: 8.5 },
  ],
  // Non-telescopic bands: consumption ≤ upTo → ALL units at rate
  nonTelescopicBands: [
    { upTo: 300, rate: 6.75 },
    { upTo: 350, rate: 7.6 },
    { upTo: 400, rate: 7.95 },
    { upTo: 500, rate: 8.25 },
    { upTo: Infinity, rate: 9.2 },
  ],
  electricityDutyPercent: 10,
  // Average Pooled Power Cost — annual settlement rate for banked surplus
  appcRate: 3.15,
  // Slab thresholds are defined per month; telemetry fields are calendar-
  // month counters, so the billing-cycle factor stays 1.
  monthlyCycleFactor: 1,
};

export interface SlabBill {
  /** slab energy charge (₹), duty excluded */
  energyCharge: number;
  /** 10% electricity duty on energy charge (₹) */
  duty: number;
  /** energyCharge + duty (₹) */
  total: number;
  regime: 'telescopic' | 'non-telescopic';
  /** human-readable band, e.g. "201–250" or ">500" */
  bandLabel: string;
  /** per-unit rate of the NEXT unit consumed at this consumption level */
  marginalRate: number;
}

/**
 * Slab energy charge for a monthly unit count (duty excluded).
 * Telescopic: walks the blocks. Non-telescopic: single band rate.
 */
export function slabEnergyCharge(units: number, cfg: TariffConfig = DEFAULT_KSEB_TARIFF): number {
  const cycle = cfg.monthlyCycleFactor ?? 1;
  const u = Math.max(0, units);
  const monthlyUnits = u / cycle;

  if (monthlyUnits <= 250) {
    // Telescopic block walk
    let remaining = u;
    let prevBound = 0;
    let charge = 0;
    for (const slab of cfg.telescopicSlabs) {
      const blockUnits = Math.min(remaining, (slab.upTo - prevBound) * cycle);
      if (blockUnits <= 0) break;
      charge += blockUnits * slab.rate;
      remaining -= blockUnits;
      prevBound = slab.upTo;
    }
    return round2(charge);
  }

  // Non-telescopic: all units at the band rate
  const band = cfg.nonTelescopicBands.find((b) => monthlyUnits <= b.upTo)
    ?? cfg.nonTelescopicBands[cfg.nonTelescopicBands.length - 1];
  return round2(u * band.rate);
}

/**
 * Full bill estimate (energy + duty) for a monthly unit count.
 * Fixed charge, meter rent and FAC are out of scope by design.
 */
export function estimateBill(units: number, cfg: TariffConfig = DEFAULT_KSEB_TARIFF): SlabBill {
  const energyCharge = slabEnergyCharge(units, cfg);
  const duty = round2((energyCharge * (cfg.electricityDutyPercent ?? 0)) / 100);
  const cycle = cfg.monthlyCycleFactor ?? 1;
  const monthlyUnits = Math.max(0, units) / cycle;

  const regime: SlabBill['regime'] =
    monthlyUnits <= 250 ? 'telescopic' : 'non-telescopic';

  let bandLabel: string;
  if (regime === 'telescopic') {
    const idx = cfg.telescopicSlabs.findIndex((s) => monthlyUnits <= s.upTo);
    const i = idx === -1 ? cfg.telescopicSlabs.length - 1 : idx;
    const lower = i === 0 ? 1 : cfg.telescopicSlabs[i - 1].upTo + 1;
    bandLabel = `${lower}–${cfg.telescopicSlabs[i].upTo}`;
  } else {
    const idx = cfg.nonTelescopicBands.findIndex((b) => monthlyUnits <= b.upTo);
    const band = cfg.nonTelescopicBands[idx] ?? cfg.nonTelescopicBands[cfg.nonTelescopicBands.length - 1];
    bandLabel = Number.isFinite(band.upTo) ? `≤${band.upTo}` : '>500';
  }

  return {
    energyCharge,
    duty,
    total: round2(energyCharge + duty),
    regime,
    bandLabel,
    marginalRate: marginalUnitCost(units, cfg),
  };
}

/**
 * Rate that the NEXT unit would cost at the given monthly consumption —
 * used for the "today" savings estimate (solar consumed now displaces the
 * most expensive unit you would otherwise buy this month).
 */
export function marginalUnitCost(units: number, cfg: TariffConfig = DEFAULT_KSEB_TARIFF): number {
  const cycle = cfg.monthlyCycleFactor ?? 1;
  const monthlyUnits = Math.max(0, units) / cycle;

  if (monthlyUnits < 250) {
    const slab = cfg.telescopicSlabs.find((s) => monthlyUnits < s.upTo)
      ?? cfg.telescopicSlabs[cfg.telescopicSlabs.length - 1];
    return slab.rate;
  }
  // At/above the cliff the next unit bills the whole month's units at a band
  // rate; the marginal unit itself costs the band rate (the cliff step is a
  // discontinuity handled by the counterfactual, not by this rate).
  const band = cfg.nonTelescopicBands.find((b) => monthlyUnits < b.upTo)
    ?? cfg.nonTelescopicBands[cfg.nonTelescopicBands.length - 1];
  return band.rate;
}

/**
 * The 250-unit telescopic cliff: bill jump (incl. duty) between the last
 * telescopic unit and the first non-telescopic unit.
 */
export function cliffJump(cfg: TariffConfig = DEFAULT_KSEB_TARIFF): number {
  return round2(estimateBill(251, cfg).total - estimateBill(250, cfg).total);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
