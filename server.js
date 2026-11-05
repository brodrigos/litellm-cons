const express = require('express');
const path = require('path');
const http = require('http');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3031;

app.use(express.json());
app.use(express.static(__dirname));

const CONFIG_PATH = path.join(__dirname, 'litellm-cons-config.json');
const CACHE_FILE = path.join(__dirname, 'litellm-cons-cache.json');

const defaultConfig = {
  maxRequestsByGroup: {
    default: 1500,
    'gemini-3.5-flash-lite': 1500,
    'groq-fast': 14400,
    'or-super-vl': 200,
    'or-flint': 200
  },
  litellmHost: '192.168.1.130',
  litellmPort: 4000,
  litellmApiKey: '1234'
};

// Metadados dos modelos: parametros e contexto
const MODEL_META = {
  'groq-fast': { params: 'LLaMA 3 70B', context: '131,072 tokens' },
  'gemini-fallback': { params: 'Gemini Pro', context: '1,048,576 tokens' },
  'gemini-3.6-flash': { params: 'Gemini 3.6 Flash', context: '1,048,576 tokens' },
  'gemini-3.5-flash': { params: 'Gemini 3.5 Flash', context: '1,048,576 tokens' },
  'gemini-3.5-flash-lite': { params: 'Gemini 3.5 Flash Lite', context: '1,048,576 tokens' },
  'or-lightning': { params: 'Nemotron Lightning', context: '131,072 tokens' },
  'or-super-vl': { params: 'Nemotron Super VL', context: '131,072 tokens' },
  'or-flint': { params: 'Nemotron Flint', context: '131,072 tokens' },
  'or-north': { params: 'Nemotron North', context: '131,072 tokens' },
  'or-inkling': { params: 'Unknown', context: 'Unknown' },
  'or-free': { params: 'Unknown', context: 'Unknown' },
  'default': { params: 'Unknown', context: 'Unknown' }
};

function getModelMeta(modelName) {
  return MODEL_META[modelName] || { params: 'Unknown', context: 'Unknown' };
}

function loadConfig() {
  try { if (fs.existsSync(CONFIG_PATH)) return { ...defaultConfig, ...JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')) }; } catch (e) {}
  return defaultConfig;
}
function saveConfig(cfg) {
  try { fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2), 'utf8'); } catch (e) {}
}

function loadCache() {
  try { if (fs.existsSync(CACHE_FILE)) return JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8')); } catch (e) {}
  return { usage: null, models: null, ts: 0 };
}
function saveCache(c) {
  try { fs.writeFileSync(CACHE_FILE, JSON.stringify(c), 'utf8'); } catch (e) {}
}

const CACHE_TTL = 300000; // 5 minutos

let appConfig = loadConfig();
let cache = loadCache();

app.get('/api/config', (req, res) => res.json(appConfig));
app.post('/api/config', (req, res) => { appConfig = { ...appConfig, ...req.body }; saveConfig(appConfig); cache = { usage: null, models: null, ts: 0 }; saveCache(cache); if (!res.headersSent) res.json({ success: true }); });

// Proxy router settings (fallbacks & router config) from LiteLLM
app.get('/api/router-settings', (req, res) => {
  const host = appConfig.litellmHost || '192.168.1.130';
  const port = appConfig.litellmPort || 4000;
  const apiKey = appConfig.litellmApiKey || '1234';
  const reqHttp = http.get({ hostname: host, port: port, path: '/router/settings', headers: { Authorization: 'Bearer ' + apiKey }, timeout: 10000 }, (r) => {
    let d = ''; r.on('data', c => d += c); r.on('end', () => {
      try {
        const result = JSON.parse(d);
        if (!res.headersSent) res.json({ success: true, settings: result });
      } catch (e) {
        if (!res.headersSent) res.json({ success: false, error: e.message });
      }
    });
  });
  reqHttp.on('error', (err) => { if (!res.headersSent) res.json({ success: false, error: err.message }); });
  reqHttp.on('timeout', () => { reqHttp.destroy(); if (!res.headersSent) res.json({ success: false, error: 'Timeout' }); });
});

app.post('/api/restart-server', (req, res) => {
  // Restart litellm-cons or notify
  if (!res.headersSent) res.json({ success: true, message: 'Comando de reinício enviado.' });
  setTimeout(() => {
    process.exit(0);
  }, 1000);
});

app.get('/api/models', (req, res) => {
  if (cache.models && (Date.now() - cache.ts < CACHE_TTL)) {
    if (!res.headersSent) return res.json({ success: true, models: cache.models });
  }

  const host = appConfig.litellmHost || '192.168.1.130';
  const port = appConfig.litellmPort || 4000;
  const apiKey = appConfig.litellmApiKey || '1234';
  const reqHttp = http.get({ hostname: host, port: port, path: '/models', headers: { Authorization: 'Bearer ' + apiKey }, timeout: 10000 }, (r) => {
    let d = ''; r.on('data', c => d += c); r.on('end', () => {
      try {
        const result = JSON.parse(d);
        let models = Array.isArray(result) ? result : (result && Array.isArray(result.data) ? result.data : (result && typeof result === 'object' ? Object.keys(result) : []));
        const modelIds = models.map(m => (typeof m === 'string' ? m : (m.id || m.model_name || m.model))).filter(Boolean);
        cache = { usage: cache.usage, models: modelIds, ts: Date.now() };
        saveCache(cache);
        if (!res.headersSent) res.json({ success: true, models: modelIds });
      } catch (e) { if (!res.headersSent) res.json({ success: false, error: e.message, models: cache.models || [] }); }
    });
  });
  reqHttp.on('error', (err) => { if (!res.headersSent) res.json({ success: false, error: err.message, models: cache.models || [] }); });
  reqHttp.on('timeout', () => { reqHttp.destroy(); if (!res.headersSent) res.json({ success: false, error: 'Timeout (10s)', models: cache.models || [] }); });
});

app.get('/api/usage', (req, res) => {
  if (cache.usage && (Date.now() - cache.ts < CACHE_TTL)) {
    if (!res.headersSent) return res.json({ success: true, usage: cache.usage.usage, totalLogsToday: cache.usage.totalLogsToday });
  }

  const host = appConfig.litellmHost || '192.168.1.130';
  const port = appConfig.litellmPort || 4000;
  const apiKey = appConfig.litellmApiKey || '1234';
  const reqHttp = http.get({ hostname: host, port: port, path: '/spend/logs', headers: { Authorization: 'Bearer ' + apiKey }, timeout: 30000 }, (r) => {
    let d = ''; r.on('data', c => d += c); r.on('end', () => {
      try {
        const logs = JSON.parse(d);
        const now = new Date();
        const startOfLocalDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
        const endOfLocalDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0);
        const reqCounts = {};
        let countToday = 0;
        if (Array.isArray(logs)) {
          logs.forEach(l => {
            if (!l.startTime) return;
            let timeStr = l.startTime;
            if (timeStr.includes('.')) timeStr = timeStr.replace(/\.\d+Z$/, 'Z');
            const logTime = new Date(timeStr);
            if (isNaN(logTime.getTime())) return;
            if (logTime >= startOfLocalDay && logTime < endOfLocalDay) {
              const group = l.model_group || l.model;
              if (group) { reqCounts[group] = (reqCounts[group] || 0) + 1; countToday++; }
            }
          });
        }
        cache = { usage: { usage: reqCounts, totalLogsToday: countToday }, models: cache.models, ts: Date.now() };
        saveCache(cache);
        if (!res.headersSent) res.json({ success: true, usage: reqCounts, totalLogsToday: countToday });
      } catch (e) {
        if (!res.headersSent) res.json({ success: false, error: 'Erro ao analisar resposta', usage: cache.usage?.usage || {} });
      }
    });
  });
  reqHttp.on('error', (err) => { if (!res.headersSent) res.json({ success: false, error: err.message, usage: cache.usage?.usage || {} }); });
  reqHttp.on('timeout', () => { reqHttp.destroy(); if (!res.headersSent) res.json({ success: false, error: 'Timeout (30s)', usage: cache.usage?.usage || {} }); });
});

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'tray-panel.html')));
app.get('/settings.html', (req, res) => res.sendFile(path.join(__dirname, 'settings.html')));

app.listen(PORT, '0.0.0.0', () => console.log(`LiteLLM Cons server running at http://0.0.0.0:${PORT}`));
