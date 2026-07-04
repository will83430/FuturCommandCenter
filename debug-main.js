console.log('process.type:', process.type);
console.log('process.versions.electron:', process.versions.electron);
try {
  const e = require('electron');
  console.log('electron typeof:', typeof e);
  if (typeof e === 'object') {
    console.log('keys:', Object.keys(e).slice(0,8).join(', '));
    console.log('ipcMain:', !!e.ipcMain, '  app:', !!e.app);
  } else { console.log('value:', String(e).slice(0,80)); }
} catch(err) { console.log('ERROR:', err.message); }
setTimeout(() => process.exit(0), 100);
