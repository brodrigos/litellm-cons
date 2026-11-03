const express = require('express');
const path = require('path');
const http = require('http');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3031;

app.use(express.json());
app.use(express.static(__dirname));

const CONFIG_PATH = path.join(__dirname, 'litellm-cons-config.json');

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

function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      return { ...defaultConfig, ...JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')) };
    }
  } catch (e) {
    console.error('loadConfig error:', e);
  }
  return defaultConfig;
}

function saveConfig(cfg) {
  try {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2), 'utf8');
  } catch (e) {
    console.error('saveConfig error:', e);
  }
}

let appConfig = loadConfig();

app.get('/api/config', (req, res) => {
  res.json(appConfig);
});

app.post('/api/config', (req, res) => {
  appConfig = { ...appConfig, ...req.body };
  saveConfig(appConfig);
  res.json({ success: true });
});

app.get('/api/models', (req, res) => {
  const host = appConfig.litellmHost || '192.168.1.130';
  const port = appConfig.litellmPort || 4000;
  const apiKey = appConfig.litellmApiKey || '1234';

  const clientReq = http.get({
    hostname: host,
    port: port,
    path: '/models',
    headers: { 'Authorization': 'Bearer ' + apiKey },
    timeout: 10000
  }, litellmRes => {
    let d = '';
    litellmRes.on('data', c => d += c);
    litellmRes.on('end', () => {
      try {
        const result = JSON.parse(d);
        let models = [];
        if (Array.isArray(result)) {
          models = result;
        } else if (result && Array.isArray(result.data)) {
          models = result.data;
        } else if (result && typeof result === 'object') {
          models = Object.keys(result);
        }
        const modelIds = models.map(m => (typeof m === 'string' ? m : (m.id || m.model_name || m.model))).filter(Boolean);
        res.json({ success: true, models: modelIds });
      } catch (e) {
        res.json({ success: false, error: e.message, models: [] });
      }
    });
  });

  clientReq.on('error', err => {
    res.json({ success: false, error: err.message, models: [] });
  });

  clientReq.on('timeout', () => {
    clientReq.destroy();
    res.json({ success: false, error: 'Timeout de conexão (10s)', models: [] });
  });
});

let cachedRequests = {};

app.get('/api/usage', (req, res) => {
  const host = appConfig.litellmHost || '192.168.1.130';
  const port = appConfig.litellmPort || 4000;
  const apiKey = appConfig.litellmApiKey || '1234';

  const clientReq = http.get({
    hostname: host,
    port: port,
    path: '/spend/logs',
    headers: { 'Authorization': 'Bearer ' + apiKey },
    timeout: 60000
  }, litellmRes => {
    let d = '';
    litellmRes.on('data', c => d += c);
    litellmRes.on('end', () => {
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
            if (timeStr.includes('.')) {
              timeStr = timeStr.replace(/\.\d+Z$/, 'Z');
            }
            const logTime = new Date(timeStr);
            if (isNaN(logTime.getTime())) return;

            if (logTime >= startOfLocalDay && logTime < endOfLocalDay) {
              const group = l.model_group || l.model;
              if (group) {
                reqCounts[group] = (reqCounts[group] || 0) + 1;
                countToday++;
              }
            }
          });
        }
        cachedRequests = reqCounts;
        res.json({ success: true, usage: reqCounts, totalLogsToday: countToday });
      } catch (e) {
        res.json({ success: false, error: 'Erro ao analisar resposta do LiteLLM', usage: cachedRequests });
      }
    });
  });

  clientReq.on('error', err => {
    res.json({ success: false, error: err.message, usage: cachedRequests });
  });

  clientReq.on('timeout', () => {
    clientReq.destroy();
    res.json({ success: false, error: 'Timeout de conexão (60s)', usage: cachedRequests });
  });
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'tray-panel.html'));
});

app.get('/settings.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'settings.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`LiteLLM Cons server running at http://0.0.0.0:${PORT}`);
});
