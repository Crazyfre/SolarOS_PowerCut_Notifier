import { TelemetryData } from '../types/telemetry';

export interface EnergyMetrics {
  solarKwh: number;
  importedKwh: number;
  exportedKwh: number;
  consumedKwh: number;
  batteryChargeKwh: number;
  batteryDischargeKwh: number;
}

export interface FinancialSummary {
  importRate: number;
  exportRate: number;
  importCost: number;
  exportCredit: number;
  avoidedBill: number;
  netSavings: number;
  netBill: number;
}

const DEFAULT_IMPORT_RATE = 7.50; // ₹ / kWh
const DEFAULT_EXPORT_RATE = 5.00; // ₹ / kWh

export const FinancialEngine = {
  DEFAULT_IMPORT_RATE,
  DEFAULT_EXPORT_RATE,

  /**
   * Calculate financial metrics from structured energy metrics.
   */
  calculate(
    metrics: EnergyMetrics,
    importRate: number = DEFAULT_IMPORT_RATE,
    exportRate: number = DEFAULT_EXPORT_RATE
  ): FinancialSummary {
    // Energy consumed directly from solar (not exported to grid)
    const solarConsumedDirectly = Math.max(0, metrics.solarKwh - metrics.exportedKwh);

    const importCost = metrics.importedKwh * importRate;
    const exportCredit = metrics.exportedKwh * exportRate;
    const avoidedBill = solarConsumedDirectly * importRate;
    const netSavings = avoidedBill + exportCredit;
    const netBill = importCost - exportCredit;

    return {
      importRate,
      exportRate,
      importCost,
      exportCredit,
      avoidedBill,
      netSavings,
      netBill,
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

  /**
   * Generate complete financial metrics using settings-based rates.
   */
  summarize(
    telemetry: TelemetryData | null,
    importRate: number = DEFAULT_IMPORT_RATE,
    exportRate: number = DEFAULT_EXPORT_RATE
  ): {
    today: FinancialSummary;
    monthly: FinancialSummary;
    lifetime: FinancialSummary;
  } {
    const metrics = this.getProcessedMetrics(telemetry);
    return {
      today: this.calculate(metrics.today, importRate, exportRate),
      monthly: this.calculate(metrics.monthly, importRate, exportRate),
      lifetime: this.calculate(metrics.lifetime, importRate, exportRate),
    };
  }
};
