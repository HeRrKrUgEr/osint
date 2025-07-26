
const express = require('express');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const app = express();
app.use(express.static('public'));
app.use(express.json());

// ===== File-based JSONL logging =====
const FILE_PATH = path.join(__dirname, 'captures.jsonl');
function logToFile(entry) {
  fs.appendFile(FILE_PATH, JSON.stringify(entry) + '\n', () => {});
}

// ===== Embedded SQLite logging =====
const db = new sqlite3.Database(path.join(__dirname, 'db.sqlite'));
db.serialize(() => {
  db.run(\`CREATE TABLE IF NOT EXISTS hits(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts TEXT,
    ip TEXT,
    headers TEXT,
    client TEXT,
    geo TEXT
  )\`);
});
function logToSQLite(entry) {
  db.run(
    'INSERT INTO hits(ts, ip, headers, client, geo) VALUES (?,?,?,?,?)',
    [entry.ts, entry.ip,
     JSON.stringify(entry.headers),
     JSON.stringify(entry.clientPayload),
     JSON.stringify(entry.geo)]
  );
}

// ----- Helper: enrich IP via ipinfo.io -----
async function enrichIP(ip) {
  try {
    const res = await fetch(\`https://ipinfo.io/${ip}/json\`);
    return await res.json();
  } catch {
    return {};
  }
}

// ----- POST /collect -----
app.post('/collect', async (req, res) => {
  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0] || req.socket.remoteAddress;
  const entry = {
    ts: new Date().toISOString(),
    ip,
    headers: req.headers,
    clientPayload: req.body,
    geo: await enrichIP(ip)
  };

  logToFile(entry);
  logToSQLite(entry);

  res.sendStatus(204); // Respond blank
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('OSINT listener on :' + PORT));
