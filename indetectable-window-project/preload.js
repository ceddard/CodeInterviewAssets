// Preload script
const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // Expose safe APIs here
});
