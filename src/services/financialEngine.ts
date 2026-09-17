// SolarGuard Financial Engine — KSEB-aware savings (V4).
//
// Methodology: counterfactual bill difference. Savings = what the bill
// WOULD have been without solar, minus what it actually is:
//
//   monthlySavings = estimateBill(consumedMonth)           // no-solar world
//                  − estimateBill(max(0, importedMonth − exportedMonth))
//                                                     // net-metered reality
//                  (both include 10% electricity duty)
//
// Net metering (the configured scheme): exports offset imports unit-for-
// unit within the billing month. Exports beyond imports are NOT cash —
// they bank, and KSEB settles them on 31 March at the APPC rate. The
// engine reports them separately as bankedSurplusUnits so a later UI can
// render "80 units banked (≈₹252 at APPC)" without inflating savings.
//
// "Today" is an estimate at the current slab's marginal rate — exact
// daily Δbill isn't derivable without daily history. "Lifetime" spans
// multiple tariff years and is labeled indicative.
//
// Battery round-trip losses (~8%) are deliberately not deducted; the data
// model can't yet separate battery-sourced vs solar-sourced consumption.

import { TelemetryData, TariffConfig } from '../types/telemetry';
import {
  estimateBill,
  marginalUnitCost,
  cliffJump,
  DEFAULT_KSEB_TARIFF,
} from './tariff/ksebTariff';

export interface EnergyMetrics {
  solarKwh: number;
  importedKwh: number;
  exportedKwh: number;
  consumedKwh: number;
  batteryChargeKwh: number;
  batteryDischargeKwh: number;
}

export interface SavingsResult {
  /** ₹ saved vs the no-solar counterfactual (duty included) */
  savings: number;
  /** for today: marginal ₹/unit used — null for exact counterfactuals */
  estimatedAtRate: number | null;
}

export interface PeriodSavings {
  today: SavingsResult;
  monthly: SavingsResult;
  lifetime: SavingsResult;
  /** monthly regime at net consumption */
  regime: 'telescopic' | 'non-telescopic';
  /** exports this month beyond import offset — settled at APPC on 31 Mar */
  bankedSurplusUnits: number;
  bankedSurplusValue: number;
  /** cliff telemetry for the current billing month */
  cliff: {
    /** ₹ jump between 250 and 251 monthly units (incl. duty) */
    jump: number;
    /** signed units from net consumption to the 250 cliff (neg = past it) */
    distanceToCliff: number;
    /** true when solar offset kept the month under the cliff */
    keptUnderCliff: boolean;
  };
}

const CLIFF_UNITS = 250;

export const FinancialEngine = {
  DEFAULT_IMPORT_RATE: 7.5, // legacy — kept for old callers
  DEFAULT_EXPORT_RATE: 5.0, // legacy
  DEFAULT_TARIFF: DEFAULT_KSEB_TARIFF,

  /**
   * KSEB slab-aware savings for today / month / lifetime.
   */
  computeSavings(
    telemetry: TelemetryData | null,
    cfg: TariffConfig = DEFAULT_KSEB_TARIFF
  ): PeriodSavings | null {
    if (!telemetry) return null;

    const cycle = cfg.monthlyCycleFactor ?? 1;

    // ─── Monthly — the rigorous counterfactual ────────────────────────────
    const consumedMonth = telemetry.useMonth ?? 0;
    const importedMonth = telemetry.buyMonth ?? 0;
    const exportedMonth = telemetry.gridMonth ?? 0;

    // Net-metered billable units: exports offset imports 1:1
    const billableMonth = Math.max(0, importedMonth - exportedMonth);

    const billWithSolar = estimateBill(billableMonth * cycle, cfg);
    const billWithoutSolar = estimateBill(consumedMonth * cycle, cfg);
    const monthlySavings = round2(billWithoutSolar.total - billWithSolar.total);

    // ─── Today — marginal-rate estimate ───────────────────────────────────
    // Each solar-self-consumed unit displaces the most expensive unit the
    // household would otherwise buy this month, at the current marginal rate.
    const solarToday = telemetry.generationValue ?? 0;
    const exportedToday = telemetry.gridValue ?? 0;
    const selfConsumedToday = Math.max(0, solarToday - exportedToday);
    const offsetToday = Math.min(exportedToday, telemetry.buyValue ?? 0);
    const displacedToday = selfConsumedToday + offsetToday;
    const marginal = marginalUnitCost(billableMonth * cycle, cfg);
    const dutyFactor = 1 + (cfg.electricityDutyPercent ?? 0) / 100;
    const todaySavings = round2(displacedToday * marginal * dutyFactor);

    // ─── Lifetime — indicative Δ-bill at current slabs ─────────────────────
    const consumedTotal = telemetry.useTotal ?? 0;
    const importedTotal = telemetry.buyTotal ?? 0;
    const exportedTotal = telemetry.gridTotal ?? 0;
    const billableTotal = Math.max(0, importedTotal - exportedTotal);
    const lifetimeSavings = round2(
      estimateBill(consumedTotal, cfg).total - estimateBill(billableTotal, cfg).total
    );

    // ─── Banking — surplus export is units, not cash ──────────────────────
    const bankedSurplusUnits = round2(Math.max(0, exportedMonth - importedMonth));

    // ─── Cliff telemetry ──────────────────────────────────────────────────
    // All counters here are calendar-month units; the projection semantics
    // (estimateBill(x * cycle)) scale both sides of every threshold by the
    // same factor, so the comparisons reduce to monthly form and stay
    // correct for bi-monthly cycles too.
    const distanceToCliff = round2(CLIFF_UNITS - billableMonth);

    return {
      today: { savings: todaySavings, estimatedAtRate: marginal },
      monthly: { savings: monthlySavings, estimatedAtRate: null },
      lifetime: { savings: lifetimeSavings, estimatedAtRate: null },
      regime: billWithSolar.regime,
      bankedSurplusUnits,
      bankedSurplusValue: round2(bankedSurplusUnits * (cfg.appcRate ?? 0)),
      cliff: {
        jump: cliffJump(cfg),
        distanceToCliff,
        keptUnderCliff:
          billableMonth <= CLIFF_UNITS &&
          consumedMonth > CLIFF_UNITS,
      },
    };
  },

  /**
   * Parse TelemetryData into Today, Monthly, and Lifetime EnergyMetrics.
   */
  getProcessedMetrics(telemetry: TelemetryData | null): {
    today: EnergyMetrics;
    monthly: EnergyMetrics;
    lifetime: EnergyMetrics;
  } {
    return {
      today: {
        solarKwh: telemetry?.generationValue ?? 0,
        importedKwh: telemetry?.buyValue ?? 0,
        exportedKwh: telemetry?.gridValue ?? 0,
        consumedKwh: telemetry?.useValue ?? 0,
        batteryChargeKwh: telemetry?.chargeValue ?? 0,
        batteryDischargeKwh: telemetry?.dischargeValue ?? 0,
      },
      monthly: {
        solarKwh: telemetry?.generationMonth ?? 0,
        importedKwh: telemetry?.buyMonth ?? 0,
        exportedKwh: telemetry?.gridMonth ?? 0,
        consumedKwh: telemetry?.useMonth ?? 0,
        batteryChargeKwh: telemetry?.chargeMonth ?? 0,
        batteryDischargeKwh: telemetry?.dischargeMonth ?? 0,
      },
      lifetime: {
        solarKwh: telemetry?.generationTotal ?? 0,
        importedKwh: telemetry?.buyTotal ?? 0,
        exportedKwh: telemetry?.gridTotal ?? 0,
        consumedKwh: telemetry?.useTotal ?? 0,
        batteryChargeKwh: telemetry?.chargeTotal ?? 0,
        batteryDischargeKwh: telemetry?.dischargeTotal ?? 0,
      },
    };
  },
};

/** @deprecated V4 — flat-rate legacy shim; use computeSavings(). */
export interface FinancialSummary {
  importRate: number;
  exportRate: number;
  importCost: number;
  exportCredit: number;
  avoidedBill: number;
  netSavings: number;
  netBill: number;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
