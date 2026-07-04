console.log('process.type:', process.type);

// Try to get electron built-in via different paths
const attempts = [
  () => require('electron'),
  () => process.mainModule?.require?.('electron'),
  () => { const e = {}; Object.assign(e, global); return e.electron; },
];

for (const fn of attempts) {
  try {
    const r = fn();
    console.log('type:', typeof r, 'keys:', typeof r === 'object' ? Object.keys(r||{}).slice(0,5).join(',') : String(r).slice(0,60));
  } catch(e) { console.log('fail:', e.message.slice(0,60)); }
}

// Try NodeJs binding approach
try {
  const binding = process.binding('electron_browser_ipc_main');
  console.log('binding:', binding);
} catch(e) { console.log('no binding:', e.message.slice(0,60)); }

setTimeout(() => process.exit(0), 200);
