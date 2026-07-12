import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { TelemetryData, AppSettings } from '../types/telemetry';
import packageJson from '../../package.json';

export const ReportGenerator = {
  /**
   * Generates a monthly report PDF and opens the system Share sheet.
   */
  async generateAndShareMonthlyReport(
    telemetry: TelemetryData | null,
    settings: AppSettings,
    stationName: string
  ): Promise<void> {
    if (!telemetry) {
      throw new Error('No telemetry data available to generate report.');
    }

    const now = new Date();
    const monthNames = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];
    const reportMonth = `${monthNames[now.getMonth()]} ${now.getFullYear()}`;
    const generationDateStr = now.toLocaleDateString([], { dateStyle: 'long' });
    const generationTimeStr = now.toLocaleTimeString([], { timeStyle: 'short' });

    // Fetch monthly stats or default
    const solarMonth = telemetry.generationMonth ?? 0;
    const importMonth = telemetry.buyMonth ?? 0;
    const exportMonth = telemetry.gridMonth ?? 0;
    const useMonth = telemetry.useMonth ?? 0;
    const chargeMonth = telemetry.chargeMonth ?? 0;
    const dischargeMonth = telemetry.dischargeMonth ?? 0;

    // Fetch lifetime stats or default
    const solarTotal = telemetry.generationTotal ?? 0;
    const importTotal = telemetry.buyTotal ?? 0;
    const exportTotal = telemetry.gridTotal ?? 0;
    const useTotal = telemetry.useTotal ?? 0;

    // Format current live snapshot metrics
    const pvPower = telemetry.pvPower ?? 0;
    const usePower = telemetry.usePower ?? 0;
    const batterySoc = telemetry.batterySoc ?? 0;
    const batteryBv = telemetry.batteryBv ?? 0;
    const batteryPower = telemetry.batteryPower ?? 0;
    const batteryStatus = telemetry.batteryStatus ?? 'IDLE';
    const gridStatus = telemetry.gridRelayStatus === 'on' ? 'Connected' : 'OFFLINE';
    const wirePower = telemetry.wirePower ?? 0;

    // Build HTML template
    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>SolarGuard Monthly Report - ${reportMonth}</title>
        <style>
          body {
            font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
            color: #1E293B;
            background-color: #FFFFFF;
            margin: 0;
            padding: 40px;
            font-size: 14px;
            line-height: 1.5;
          }
          .header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 2px solid #F59E0B;
            padding-bottom: 20px;
            margin-bottom: 25px;
          }
          .logo-area {
            display: flex;
            align-items: center;
            gap: 10px;
          }
          .logo-icon {
            font-size: 28px;
            color: #F59E0B;
          }
          .app-title {
            font-size: 24px;
            font-weight: bold;
            color: #0F172A;
            margin: 0;
          }
          .report-meta {
            text-align: right;
          }
          .report-meta h2 {
            font-size: 18px;
            color: #64748B;
            margin: 0 0 5px 0;
            text-transform: uppercase;
            letter-spacing: 1px;
          }
          .report-meta p {
            margin: 0;
            color: #94A3B8;
            font-size: 12px;
          }
          .section {
            margin-bottom: 25px;
          }
          .section-title {
            font-size: 14px;
            font-weight: bold;
            color: #0F172A;
            border-bottom: 1px solid #E2E8F0;
            padding-bottom: 6px;
            margin-bottom: 12px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
          }
          .sys-info-grid {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 12px;
            background-color: #F8FAFC;
            border-radius: 8px;
            padding: 12px;
            border: 1px solid #E2E8F0;
          }
          .info-item {
            display: flex;
            flex-direction: column;
          }
          .info-label {
            font-size: 10px;
            color: #64748B;
            text-transform: uppercase;
            margin-bottom: 2px;
          }
          .info-value {
            font-size: 13px;
            font-weight: bold;
            color: #1E293B;
          }
          .stats-table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 5px;
          }
          .stats-table th {
            background-color: #F1F5F9;
            color: #475569;
            font-weight: bold;
            text-align: left;
            padding: 8px 10px;
            border-bottom: 2px solid #CBD5E1;
            font-size: 11px;
            text-transform: uppercase;
          }
          .stats-table td {
            padding: 8px 10px;
            border-bottom: 1px solid #E2E8F0;
            color: #334155;
          }
          .stats-table tr:last-child td {
            border-bottom: none;
          }
          .stats-grid {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 12px;
            margin-top: 5px;
          }
          .stat-card {
            border: 1px solid #E2E8F0;
            border-radius: 8px;
            padding: 10px;
            text-align: center;
          }
          .stat-card.solar { border-left: 4px solid #F59E0B; }
          .stat-card.import { border-left: 4px solid #EF4444; }
          .stat-card.export { border-left: 4px solid #10B981; }
          .stat-card.use { border-left: 4px solid #3B82F6; }
          .stat-card-title {
            font-size: 10px;
            color: #64748B;
            text-transform: uppercase;
            margin-bottom: 4px;
          }
          .stat-card-value {
            font-size: 16px;
            font-weight: bold;
            color: #0F172A;
          }
          .page-break {
            page-break-before: always;
          }
          .footer {
            border-top: 1px solid #E2E8F0;
            padding-top: 12px;
            margin-top: 30px;
            text-align: center;
            font-size: 9px;
            color: #94A3B8;
            line-height: 1.5;
          }
        </style>
      </head>
      <body>
        <!-- PAGE 1: OVERVIEW -->
        <div class="header">
          <div class="logo-area">
            <span class="logo-icon">☀</span>
            <span class="app-title">SolarGuard</span>
          </div>
          <div class="report-meta">
            <h2>Monthly Energy Report</h2>
            <p>${reportMonth}</p>
          </div>
        </div>

        <div class="section">
          <div class="section-title">System Information</div>
          <div class="sys-info-grid">
            <div class="info-item">
              <span class="info-label">Plant Name</span>
              <span class="info-value">${stationName || 'SolarGuard Station'}</span>
            </div>
            <div class="info-item">
              <span class="info-label">Installed Capacity</span>
              <span class="info-value">${settings.batteryCapacity ? (settings.batteryCapacity * 1.2).toFixed(2) : '5.0'} kWp</span>
            </div>
            <div class="info-item">
              <span class="info-label">System ID</span>
              <span class="info-value">${telemetry.systemId ?? 'Unknown'}</span>
            </div>
            <div class="info-item">
              <span class="info-label">Report Period</span>
              <span class="info-value">${reportMonth}</span>
            </div>
          </div>
        </div>

        <div class="section">
          <div class="section-title">System Snapshot (Latest Telemetry)</div>
          <div class="sys-info-grid" style="grid-template-columns: repeat(3, 1fr); background-color: #F0FDF4; border-color: #BBF7D0;">
            <div class="info-item">
              <span class="info-label">Solar PV Power</span>
              <span class="info-value">${pvPower} W</span>
            </div>
            <div class="info-item">
              <span class="info-label">House Load</span>
              <span class="info-value">${usePower} W</span>
            </div>
            <div class="info-item">
              <span class="info-label">Grid Relay State</span>
              <span class="info-value" style="color: ${telemetry.gridRelayStatus === 'on' ? '#10B981' : '#EF4444'}">${gridStatus}</span>
            </div>
            <div class="info-item">
              <span class="info-label">Battery Charge</span>
              <span class="info-value">${batterySoc}% (${batteryBv}V)</span>
            </div>
            <div class="info-item">
              <span class="info-label">Battery Flow</span>
              <span class="info-value">${batteryPower} W (${batteryStatus})</span>
            </div>
            <div class="info-item">
              <span class="info-label">Grid Flow</span>
              <span class="info-value">${Math.abs(wirePower)} W (${wirePower >= 0 ? 'Importing' : 'Exporting'})</span>
            </div>
          </div>
        </div>

        <div class="section">
          <div class="section-title">Monthly Energy Summary</div>
          <div class="stats-grid">
            <div class="stat-card solar">
              <div class="stat-card-title">Solar Generation</div>
              <div class="stat-card-value">${solarMonth.toFixed(1)} kWh</div>
            </div>
            <div class="stat-card import">
              <div class="stat-card-title">Grid Import</div>
              <div class="stat-card-value">${importMonth.toFixed(1)} kWh</div>
            </div>
            <div class="stat-card export">
              <div class="stat-card-title">Grid Export</div>
              <div class="stat-card-value">${exportMonth.toFixed(1)} kWh</div>
            </div>
          </div>
          <div class="stats-grid" style="margin-top: 12px;">
            <div class="stat-card use">
              <div class="stat-card-title">Consumption</div>
              <div class="stat-card-value">${useMonth.toFixed(1)} kWh</div>
            </div>
            <div class="stat-card" style="border-left: 4px solid #8B5CF6;">
              <div class="stat-card-title">Battery Charged</div>
              <div class="stat-card-value">${chargeMonth.toFixed(1)} kWh</div>
            </div>
            <div class="stat-card" style="border-left: 4px solid #EC4899;">
              <div class="stat-card-title">Battery Discharged</div>
              <div class="stat-card-value">${dischargeMonth.toFixed(1)} kWh</div>
            </div>
          </div>
        </div>

        <div class="section">
          <div class="section-title">Lifetime Statistics</div>
          <table class="stats-table">
            <thead>
              <tr>
                <th>Metric</th>
                <th>Cumulative Value</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>☀ Total Solar Energy Generated</td>
                <td><strong>${solarTotal.toFixed(1)} kWh</strong></td>
              </tr>
              <tr>
                <td>🔌 Total Grid Energy Imported</td>
                <td><strong>${importTotal.toFixed(1)} kWh</strong></td>
              </tr>
              <tr>
                <td>⬆ Total Energy Exported to Grid</td>
                <td><strong>${exportTotal.toFixed(1)} kWh</strong></td>
              </tr>
              <tr>
                <td>🏠 Total Energy Consumed</td>
                <td><strong>${useTotal.toFixed(1)} kWh</strong></td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="footer">
          <p>Generated by SolarGuard App · Version ${packageJson.version}<br>
          Generated on ${generationDateStr} at ${generationTimeStr}<br>
          SolarGuard is an independent companion application and is not affiliated with or endorsed by SolarOS.</p>
        </div>

        <!-- PAGE 2: OPERATIONS DISCLOSURE -->
        <div class="page-break"></div>
        <div class="header">
          <div class="logo-area">
            <span class="logo-icon">☀</span>
            <span class="app-title">SolarGuard</span>
          </div>
          <div class="report-meta">
            <h2>Daily Operations</h2>
            <p>${reportMonth}</p>
          </div>
        </div>

        <div class="section">
          <div class="section-title">Daily breakdown logs</div>
          <table class="stats-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td colspan="2" style="text-align: center; color: #64748B; padding: 30px; line-height: 1.8;">
                  <strong>Daily breakdown logs are currently unavailable via the SolarOS system API.</strong><br>
                  Only current status snapshots, monthly accumulations, and lifetime totals are fetched directly.
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="footer" style="margin-top: 250px;">
          <p>Generated by SolarGuard App · Version ${packageJson.version}<br>
          Generated on ${generationDateStr} at ${generationTimeStr}<br>
          SolarGuard is an independent companion application and is not affiliated with or endorsed by SolarOS.</p>
        </div>
      </body>
      </html>
    `;

    // Print to local PDF
    const { uri } = await Print.printToFileAsync({ html: htmlContent });
    
    // Share locally using Share Sheet
    await Sharing.shareAsync(uri, {
      mimeType: 'application/pdf',
      dialogTitle: `SolarGuard Report - ${reportMonth}`,
      UTI: 'com.adobe.pdf'
    });
  }
};
