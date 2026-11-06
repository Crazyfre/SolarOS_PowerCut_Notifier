const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createLoader, storage } = require('./helpers.cjs');

test('configured tariff arithmetic matches hand-calculated slab boundaries', () => {
  const tariff = createLoader()('src/services/tariff/ksebTariff.ts');
  const examples = [[0, 0], [50, 167.5], [100, 380], [120, 487], [200, 1007.5],
    [240, 1347.5], [250, 1432.5], [251, 1694.25], [300, 2025], [301, 2287.6], [600, 5520]];
  for (const [units, charge] of examples) assert.equal(tariff.slabEnergyCharge(units), charge, `${units} units`);
  assert.equal(tariff.estimateBill(240).total, 1482.25);
  assert.equal(tariff.cliffJump(), 287.93);
});

test('net-metered monthly savings include duty and do not count banked surplus as cash savings', () => {
  const engine = createLoader()('src/services/financialEngine.ts').FinancialEngine;
  const result = engine.computeSavings({ useMonth: 180, buyMonth: 20, gridMonth: 100 });
  assert.equal(result.monthly.savings, 949.85);
  assert.equal(result.bankedSurplusUnits, 80);
  assert.equal(result.bankedSurplusValue, 252);
  assert.equal(engine.computeSavings(null), null);
});

test('monthly savings account for solar avoiding the configured bill cliff', () => {
  const engine = createLoader()('src/services/financialEngine.ts').FinancialEngine;
  const result = engine.computeSavings({ useMonth: 260, buyMonth: 250, gridMonth: 10 });
  assert.equal(result.monthly.savings, 448.25);
  assert.equal(result.cliff.keptUnderCliff, true);
  assert.equal(result.cliff.distanceToCliff, 10);
});

test('report uses the configured battery capacity and escapes station names', async () => {
  let html, shared;
  const load = createLoader({
    '@react-native-async-storage/async-storage': storage(),
    'expo-print': { printToFileAsync: async (options) => { html = options.html; return { uri: 'file:///report.pdf' }; } },
    'expo-sharing': { shareAsync: async (uri) => { shared = uri; } },
  });
  const { DEFAULT_SETTINGS } = load('src/storage/settingsStore.ts');
  await load('src/services/reportGenerator.ts').ReportGenerator.generateAndShareMonthlyReport(
    { systemId: 'A', gridRelayStatus: 'on', batterySoc: 80, batteryBv: 52, batteryPower: 0, wirePower: 0 },
    DEFAULT_SETTINGS, '<script>bad()</script>',
  );
  assert.ok(html.includes('&lt;script&gt;bad()&lt;/script&gt;'));
  assert.ok(!html.includes('<script>bad()'));
  assert.ok(html.includes('5.12 kWh'));
  assert.ok(!html.includes('kWp'));
  assert.equal(shared, 'file:///report.pdf');
});
