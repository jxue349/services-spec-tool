'use client';

import { useState } from 'react';
import { RuleChips } from './RuleChip';
import { Button, EmptyState, ErrorNote, Panel, SectionLabel } from './ui';
import { compileScenario } from '@/lib/client/api';
import { MAX_SCENARIO_DEVICES } from '@/lib/schemas';
import type { ExplorerScenarioResult } from '@/lib/schemas';

const ACCOUNT_OPTIONS = [
  'None',
  'Cam Unlimited — website',
  'Cam Unlimited — iOS IAP',
  'Cam Unlimited — Android IAP',
] as const;

const DEVICE_OPTIONS = [
  'None',
  'Cam Plus — website',
  'Cam Plus — iOS IAP',
  'Cam Plus — Android IAP',
  'Cam Plus — retail activation',
  'Cam Plus + extended video history add-on',
] as const;

type DeviceRow = { name: string; subscription: string };

export function ExplorerTab({ spec, onReveal }: { spec: string; onReveal: (rule: string) => void }) {
  const [account, setAccount] = useState<string>(ACCOUNT_OPTIONS[1]);
  const [devices, setDevices] = useState<DeviceRow[]>([
    { name: 'Cam v3 (kitchen)', subscription: DEVICE_OPTIONS[2] },
    { name: 'Cam Pan v3 (porch)', subscription: DEVICE_OPTIONS[0] },
  ]);

  const [scenarioResult, setScenarioResult] = useState<ExplorerScenarioResult | null>(null);
  const [scenarioBusy, setScenarioBusy] = useState(false);
  const [scenarioError, setScenarioError] = useState<unknown>(null);


  const updateDevice = (index: number, patch: Partial<DeviceRow>) => {
    setDevices((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };

  const resolve = async () => {
    setScenarioBusy(true);
    setScenarioError(null);
    try {
      const res = await compileScenario(spec, {
        account,
        devices: devices.filter((d) => d.name.trim() !== '').map((d) => ({ name: d.name.trim(), subscription: d.subscription })),
      });
      if (res.kind === 'scenario') setScenarioResult(res.result);
    } catch (err) {
      setScenarioError(err);
    } finally {
      setScenarioBusy(false);
    }
  };


  return (
    <div className="space-y-4">
      <Panel className="p-3">
        <div className="mb-3 flex items-center justify-between">
          <SectionLabel>Scenario</SectionLabel>
          <span className="font-mono text-[10px] text-inkDim">
            {devices.length}/{MAX_SCENARIO_DEVICES} devices
          </span>
        </div>

        <label className="mb-3 block space-y-1">
          <span className="text-[11px] text-inkDim">Account-level subscription</span>
          <select
            value={account}
            onChange={(e) => setAccount(e.target.value)}
            className="w-full rounded-md border border-line bg-panelAlt px-2 py-1.5 text-xs text-ink outline-none focus:border-accent/60"
          >
            {ACCOUNT_OPTIONS.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </label>

        <div className="space-y-2">
          {devices.map((device, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                value={device.name}
                onChange={(e) => updateDevice(i, { name: e.target.value })}
                placeholder="device name"
                className="w-2/5 rounded-md border border-line bg-panelAlt px-2 py-1.5 text-xs text-ink outline-none focus:border-accent/60"
              />
              <select
                value={device.subscription}
                onChange={(e) => updateDevice(i, { subscription: e.target.value })}
                className="flex-1 rounded-md border border-line bg-panelAlt px-2 py-1.5 text-xs text-ink outline-none focus:border-accent/60"
              >
                {DEVICE_OPTIONS.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
              <button
                onClick={() => setDevices((rows) => rows.filter((_, idx) => idx !== i))}
                className="rounded border border-line px-2 py-1 text-xs text-inkDim hover:border-warning/60 hover:text-warning"
                aria-label={`Remove device ${i + 1}`}
              >
                −
              </button>
            </div>
          ))}
        </div>

        <div className="mt-3 flex items-center gap-2">
          <Button
            onClick={() => setDevices((rows) => [...rows, { name: '', subscription: DEVICE_OPTIONS[0] }])}
            disabled={devices.length >= MAX_SCENARIO_DEVICES}
          >
            + Add device
          </Button>
          <Button variant="primary" onClick={() => void resolve()} loading={scenarioBusy} disabled={spec.trim() === ''}>
            Resolve entitlements
          </Button>
        </div>

        {scenarioError ? (
          <div className="mt-3">
            <ErrorNote error={scenarioError} onDismiss={() => setScenarioError(null)} />
          </div>
        ) : null}
      </Panel>

      {scenarioResult ? (
        <div className="space-y-3">
          <Panel className="p-3">
            <SectionLabel>Account</SectionLabel>
            <p className="mt-1 text-xs leading-relaxed text-ink">{scenarioResult.accountSummary}</p>
          </Panel>

          {scenarioResult.devices.map((device, i) => (
            <Panel key={`${device.name}-${i}`} className="p-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h4 className="text-xs font-semibold text-white">{device.name}</h4>
                <span className="rounded border border-accent/40 bg-accent/10 px-2 py-0.5 text-[11px] text-accent">
                  {device.effectiveEntitlement}
                </span>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-ink">{device.why}</p>
              <div className="mt-2">
                <RuleChips rules={device.rules} onReveal={onReveal} />
              </div>
            </Panel>
          ))}

          {scenarioResult.notes.trim() !== '' ? (
            <Panel className="border-secondary/40 bg-secondary/5 p-3">
              <SectionLabel>Notes</SectionLabel>
              <p className="mt-1 text-xs leading-relaxed text-ink">{scenarioResult.notes}</p>
            </Panel>
          ) : null}
        </div>
      ) : (
        <EmptyState>Build a scenario and resolve it to see how the spec settles entitlements.</EmptyState>
      )}

    </div>
  );
}
