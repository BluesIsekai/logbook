const http = require('http');
const fs = require('fs');
const path = require('path');

// Load environment variables from .env if present
function loadEnv() {
  const envPath = path.join(__dirname, '.env');
  if (fs.existsSync(envPath)) {
    try {
      const content = fs.readFileSync(envPath, 'utf8');
      content.split(/\r?\n/).forEach(line => {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#')) {
          const eqIdx = trimmed.indexOf('=');
          if (eqIdx !== -1) {
            const key = trimmed.slice(0, eqIdx).trim();
            let val = trimmed.slice(eqIdx + 1).trim();
            if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
              val = val.slice(1, -1);
            }
            if (!process.env[key]) {
              process.env[key] = val;
            }
          }
        }
      });
      console.log('[Server] Loaded environment variables from .env');
    } catch (err) {
      console.warn('[Server] Could not parse .env file:', err.message);
    }
  }
}
loadEnv();

const PORT = parseInt(process.env.PORT || '3000', 10);
const PUBLIC_DIR = path.join(__dirname, 'public');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf'
};

const EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

// Forward waitlist entry to Discord webhook securely
async function forwardToDiscord(email, userAgent, ip) {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl || webhookUrl.trim() === '') {
    console.log(`[Waitlist Submission] Email: ${email} (No DISCORD_WEBHOOK_URL set - running in mock mode)`);
    return { success: true, mock: true };
  }

  const payload = {
    username: 'Logbook Archivist',
    embeds: [
      {
        title: '📋 New Waitlist Registration',
        color: 16102830, // #f5b5ae (Peach Coral)
        description: `A new prospective member registered for early access.`,
        fields: [
          {
            name: 'Email Address',
            value: `\`${email}\``,
            inline: false
          },
          {
            name: 'Timestamp',
            value: new Date().toUTCString(),
            inline: true
          },
          {
            name: 'Source',
            value: 'Logbook Landing Page',
            inline: true
          }
        ],
        footer: {
          text: 'Logbook Index System'
        }
      }
    ]
  };

  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      console.error(`[Server] Discord webhook error HTTP ${res.status}:`, errText);
      return { success: false, status: res.status };
    }

    console.log(`[Waitlist Submission] Successfully posted to Discord for: ${email}`);
    return { success: true };
  } catch (err) {
    console.error('[Server] Network error while forwarding to Discord:', err.message);
    return { success: false, error: err.message };
  }
}

const server = http.createServer((req, res) => {
  // CORS & Security headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');

  // Handle Waitlist API endpoint
  if (req.url === '/api/waitlist') {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      res.writeHead(405, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'Method not allowed' }));
    }

    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 1e6) { // 1MB limit
        req.destroy();
      }
    });

    req.on('end', async () => {
      try {
        const data = JSON.parse(body || '{}');
        const email = (data.email || '').trim().toLowerCase();

        if (!email || !EMAIL_REGEX.test(email) || email.length > 254) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: 'Invalid email' }));
        }

        const userAgent = req.headers['user-agent'] || 'Unknown';
        const clientIp = req.socket.remoteAddress || 'Unknown';

        const forwardResult = await forwardToDiscord(email, userAgent, clientIp);

        if (!forwardResult.success && !forwardResult.mock) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: 'Something went wrong' }));
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: true }));
      } catch (err) {
        console.error('[Server] Invalid waitlist request body:', err.message);
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Invalid email' }));
      }
    });
    return;
  }

  // Only allow GET & HEAD for static files
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { 'Content-Type': 'text/plain' });
    return res.end('Method Not Allowed');
  }

  // Parse static file path
  let parsedUrl;
  try {
    parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  } catch (e) {
    res.writeHead(400, { 'Content-Type': 'text/plain' });
    return res.end('Bad Request');
  }

  let pathname = parsedUrl.pathname;
  if (pathname === '/') {
    pathname = '/index.html';
  }

  // Protect against directory traversal
  const safePath = path.normalize(pathname).replace(/^(\.\.[/\\])+/, '');
  const filePath = path.join(PUBLIC_DIR, safePath);

  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    return res.end('Forbidden');
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return res.end('404 Not Found');
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.writeHead(200, { 'Content-Type': contentType });
    if (req.method === 'HEAD') {
      return res.end();
    }

    const readStream = fs.createReadStream(filePath);
    readStream.pipe(res);
  });
});

function startServer(port) {
  server.listen(port, () => {
    console.log(`[Logbook] Server running at http://localhost:${port}`);
    console.log(`[Logbook] Discord Webhook configured: ${process.env.DISCORD_WEBHOOK_URL ? 'YES' : 'NO (Mock Mode)'}`);
  });
}

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    const nextPort = PORT + 1;
    console.log(`[Server] Port ${PORT} in use, attempting port ${nextPort}...`);
    startServer(nextPort);
  } else {
    console.error('[Server] Fatal server error:', err);
  }
});

startServer(PORT);

