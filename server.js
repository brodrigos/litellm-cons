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
  modelTimeouts: {},
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

function proxyGet(apiPath, res) {
  const host = appConfig.litellmHost || '192.168.1.130';
  const port = appConfig.litellmPort || 4000;
  const apiKey = appConfig.litellmApiKey || '1234';
  const reqHttp = http.get({ hostname: host, port: port, path: apiPath, headers: { Authorization: 'Bearer ' + apiKey }, timeout: 10000 }, (r) => {
    let d = ''; r.on('data', c => d += c); r.on('end', () => {
      try {
        const result = JSON.parse(d);
        if (!res.headersSent) res.json({ success: true, data: result });
      } catch (e) {
        if (!res.headersSent) res.json({ success: false, error: e.message });
      }
    });
  });
  reqHttp.on('error', (err) => { if (!res.headersSent) res.json({ success: false, error: err.message }); });
  reqHttp.on('timeout', () => { reqHttp.destroy(); if (!res.headersSent) res.json({ success: false, error: 'Timeout' }); });
}

function proxyPost(apiPath, body, res) {
  const host = appConfig.litellmHost || '192.168.1.130';
  const port = appConfig.litellmPort || 4000;
  const apiKey = appConfig.litellmApiKey || '1234';
  const postData = JSON.stringify(body || {});
  const options = {
    hostname: host, port: port, path: apiPath, method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + apiKey,
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData)
    },
    timeout: 10000
  };
  const reqHttp = http.request(options, (r) => {
    let d = ''; r.on('data', c => d += c); r.on('end', () => {
      try {
        const result = JSON.parse(d);
        if (!res.headersSent) res.json({ success: true, data: result });
      } catch (e) {
        if (!res.headersSent) res.json({ success: false, error: e.message, raw: d });
      }
    });
  });
  reqHttp.on('error', (err) => { if (!res.headersSent) res.json({ success: false, error: err.message }); });
  reqHttp.on('timeout', () => { reqHttp.destroy(); if (!res.headersSent) res.json({ success: false, error: 'Timeout' }); });
  reqHttp.write(postData);
  reqHttp.end();
}

// ── Config endpoints ──
app.get('/api/config', (req, res) => res.json(appConfig));
app.post('/api/config', (req, res) => { appConfig = { ...appConfig, ...req.body }; saveConfig(appConfig); cache = { usage: null, models: null, ts: 0 }; saveCache(cache); if (!res.headersSent) res.json({ success: true }); });

// ── Modelos endpoints ──
app.get('/api/models', (req, res) => {
  if (cache.models && (Date.now() - cache.ts < CACHE_TTL)) {
    if (!res.headersSent) return res.json({ success: true, models: cache.models });
  }
  proxyGet('/models', res);
});

app.get('/api/gateway-model-info', (req, res) => {
  proxyGet('/v1/model/info', res);
});

app.get('/api/gateway-router-settings', (req, res) => {
  proxyGet('/router/settings', res);
});

// Gerenciamento de modelos via API do LiteLLM Gateway
app.post('/api/gateway-model/new', (req, res) => {
  proxyPost('/model/new', req.body, res);
});

app.post('/api/gateway-model/delete', (req, res) => {
  proxyPost('/model/delete', req.body, res);
});

app.post('/api/gateway-model/update', (req, res) => {
  proxyPost('/model/update', req.body, res);
});

// Uso
app.get('/api/usage', (req, res) => {
  if (cache.usage && (Date.now() - cache.ts < CACHE_TTL)) {
    if (!res.headersSent) return res.json({ success: true, usage: cache.usage.usage, totalLogsToday: cache.usage.totalLogsToday });
  }
  proxyGet('/spend/logs', res);
});

// ── Páginas ──
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'tray-panel.html')));
app.get('/settings.html', (req, res) => res.sendFile(path.join(__dirname, 'settings.html')));
app.get('/models-config.html', (req, res) => res.sendFile(path.join(__dirname, 'models-config.html')));
app.get('/gateway-config.html', (req, res) => res.sendFile(path.join(__dirname, 'gateway-config.html')));

app.listen(PORT, '0.0.0.0', () => console.log(`LiteLLM Cons server running at http://0.0.0.0:${PORT}`));
