#!/usr/bin/env node
// Picks today's Daily if nobody has yet, so the day exists even if no visitor arrives first.
// Run nightly by deploy/quadsort-daily.timer just after midnight Eastern. Safe to run any time, any number of times.
const open = require('../db');
const { makeDaily } = require('../lib/daily');
const notify = require('../lib/notify');

(async () => {
  const db = open();
  const sent = [];
  const send = notify(db);
  const daily = makeDaily(db, { onPick: (d) => { const p = send(d); sent.push(p); return p; } });
  const d = daily.current();
  await new Promise((r) => setImmediate(r)); // announce() runs the callback on the next tick
  const results = await Promise.allSettled(sent);
  results.filter((r) => r.status === 'rejected').forEach((r) => console.error('notification failed:', r.reason.message));
  console.log(d ? `Daily #${d.number} for ${d.day}: ${d.puzzleId}` : 'No puzzle available for a Daily');
})().catch((e) => { console.error(e); process.exit(1); });
