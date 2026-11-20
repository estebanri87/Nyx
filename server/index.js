import express from 'express';
import rateLimit from 'express-rate-limit';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { existsSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import profilesRouter from './routes/profiles.js';
import iconsRouter from './routes/icons.js';
import settingsRouter from './routes/settings.js';
import kioskRouter from './routes/kiosk.js';
import db, { startBackupSchedule } from './db.js';
import ingressIdentityRouter from './routes/ingressIdentity.js';
import {
  createHomeAssistantAuthMiddleware,
  getRateLimitKey,
  getTrustedSupervisorUser,
  warnIfHomeAssistantUrlMissing,
} from './haAuth.js';
import {
  getHaRelayConnection,
  getLatestEntities,
  onEntitiesUpdate,
  forwardMessage,
  getEntitySubscriberCount,
} from './haRelay.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = parseInt(process.env.PORT || '3002', 10);
// Must stay under the 10 s docker stop waits before it sends SIGKILL.
const SHUTDOWN_TIMEOUT_MS = 5_000;

const resolveAppVersion = () => {
  const packageJsonPath = join(__dirname, '..', 'package.json');

  try {
    const pkg = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
    return pkg?.version || 'unknown';
  } catch {
    return 'unknown';
  }
};

export const createApp = ({
  appVersion = resolveAppVersion(),
  distPath = join(__dirname, '..', 'dist'),
  isProduction = process.env.NODE_ENV === 'production',
  database = db,
} = {}) => {
  const app = express();
  const homeAssistantAuth = createHomeAssistantAuthMiddleware();
  app.disable('x-powered-by');
  app.use((_req, res, next) => {
    res.removeHeader('X-Powered-By');

    // --- Content-Security-Policy ---
    // Restricts which origins can load scripts, styles, images, etc.
    // "self" = same origin only; external CDNs are explicitly allowed.
    const csp = [
      "default-src 'self'",
      // Scripts: own bundle only (inline for Vite dev handled by nonce/hash in dev mode)
      "script-src 'self'",
      // Styles: own + Google Fonts + inline (Tailwind / dynamic styles)
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      // Fonts: own + Google Fonts CDN
      "font-src 'self' https://fonts.gstatic.com",
      // Images: own, HA instance (any origin – URL is user-configured), weather icons, media logos, map tiles, data/blob URIs
      "img-src 'self' data: blob: http: https: https://cdn.jsdelivr.net https://cdn.simpleicons.org https://*.basemaps.cartocdn.com https://*.tile.openstreetmap.org",
      // WebSocket connections to the user's HA instance (any origin, since URL is user-configured)
      "connect-src 'self' ws: wss: http: https:",
      // Leaflet map iframe
      'frame-src https://www.openstreetmap.org',
      // Block all object/embed/plugin
      "object-src 'none'",
      // Restrict base-uri to prevent base tag injection
      "base-uri 'self'",
      // Only allow forms to submit to same origin
      "form-action 'self'",
    ].join('; ');

    res.setHeader('Content-Security-Policy', csp);
    next();
  });

  // Parse JSON bodies
  app.use(express.json({ limit: '2mb' }));

  // One bucket per Home Assistant user under trusted Ingress (all of it
  // arrives from the Supervisor's proxy), otherwise per socket peer -- never
  // X-Forwarded-For. See getRateLimitKey in haAuth.js.
  const apiRateLimiter = rateLimit({
    windowMs: Math.max(Number(process.env.API_RATE_LIMIT_WINDOW_MS) || 60_000, 1_000),
    max: Math.max(Number(process.env.API_RATE_LIMIT_MAX) || 300, 10),
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: getRateLimitKey,
  });

  app.use('/api', apiRateLimiter);

  // Ingress support — strip X-Ingress-Path prefix from request URL
  app.use((req, _res, next) => {
    const ingressPath = req.headers['x-ingress-path'];
    if (ingressPath && req.url.startsWith(ingressPath)) {
      req.url = req.url.slice(ingressPath.length) || '/';
    }
    next();
  });

  // API routes
  app.use('/api/profiles', homeAssistantAuth, profilesRouter);
  app.use('/api/icons', iconsRouter);
  app.use('/api/settings', homeAssistantAuth, settingsRouter);
  app.use('/api/kiosk', homeAssistantAuth, kioskRouter);
  app.use('/api/ingress-identity', ingressIdentityRouter);

  // Health check
  app.get('/api/health', (_req, res) => {
    try {
      database.prepare('SELECT 1').get();
      res.json({ status: 'ok', version: appVersion });
    } catch (error) {
      console.error('[server] Health check failed:', error);
      res.status(503).json({ status: 'error', version: appVersion });
    }
  });

  // Serve static frontend files in production
  if (isProduction) {
    if (existsSync(distPath)) {
      const assetsPath = join(distPath, 'assets');
      const indexHtmlPath = join(distPath, 'index.html');
      const indexHtml = existsSync(indexHtmlPath) ? readFileSync(indexHtmlPath, 'utf8') : null;

      const setNoCacheHeaders = (res) => {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
      };

      const sendSpaIndex = (res) => {
        setNoCacheHeaders(res);
        if (indexHtml !== null) {
          return res.type('html').send(indexHtml);
        }
        return res.status(503).send('Frontend unavailable');
      };

      app.use(
        '/assets',
        express.static(assetsPath, {
          fallthrough: true,
          immutable: true,
          maxAge: '1y',
        })
      );

      app.use(
        express.static(distPath, {
          index: false,
          setHeaders: (res, filePath) => {
            if (filePath.endsWith('.html')) {
              setNoCacheHeaders(res);
            }
            if (filePath.endsWith('sw.js')) {
              setNoCacheHeaders(res);
              res.setHeader('Service-Worker-Allowed', '/');
            }
          },
        })
      );

      app.get('/index.html', (_req, res) => {
        sendSpaIndex(res);
      });

      // SPA fallback — serve index.html for all non-API routes
      app.use((req, res, next) => {
        if (req.path.startsWith('/api/')) {
          return next();
        }
        if (req.path.includes('.')) {
          return next();
        }
        sendSpaIndex(res);
      });
    } else {
      console.warn('[server] dist/ folder not found. Only API routes will be available.');
    }
  }

  return app;
};

/**
 * Stops the server cleanly on SIGTERM and SIGINT. Node as PID 1 ignores these without a handler,
 * which is why docker stop otherwise waits and SIGKILLs a database that was never closed.
 * @param {object} options
 * @param {import('http').Server} options.server
 * @param {Pick<import('better-sqlite3').Database, 'close'>} options.database
 * @param {() => void} options.stopBackups
 * @param {number} [options.timeoutMs]
 * @param {(code: number) => void} [options.exit]
 * @param {Pick<NodeJS.EventEmitter, 'on'>} [options.signalSource]
 */
export const installShutdownHandlers = ({
  server,
  database,
  stopBackups,
  timeoutMs = SHUTDOWN_TIMEOUT_MS,
  exit = process.exit,
  signalSource = process,
}) => {
  let stopping = false;
  let finished = false;

  /** @param {number} code */
  const finish = (code) => {
    if (finished) return;
    finished = true;
    try {
      database.close();
      exit(code);
    } catch (error) {
      console.error('[server] Closing the database failed:', error);
      exit(1);
    }
  };

  /** @param {string} signal */
  const shutdown = (signal) => {
    if (stopping) return;
    stopping = true;
    console.log(`[server] ${signal} received, shutting down`);
    stopBackups();

    const forceTimer = setTimeout(() => {
      console.warn(`[server] Connections still open after ${timeoutMs} ms, closing them`);
      server.closeAllConnections();
      finish(1);
    }, timeoutMs);

    // server.close() only drops connections idle right now; one finishing a request stays keep-alive.
    const idleSweep = setInterval(() => server.closeIdleConnections(), 100);

    server.close((error) => {
      clearInterval(idleSweep);
      clearTimeout(forceTimer);
      finish(error ? 1 : 0);
    });
  };

  for (const signal of ['SIGTERM', 'SIGINT']) {
    signalSource.on(signal, () => shutdown(signal));
  }
};

const isMainModule = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
const app = createApp();

/**
 * Relays a single browser client over the WS-relay upgrade: sends the
 * current entity snapshot immediately, keeps it updated with compact diffs
 * afterward, and forwards any `{type: 'forward', id, payload}` message to
 * the real Home Assistant connection, replying with the same id so the
 * frontend can correlate request/response.
 */
// A client stuck behind a slow/flaky link (kiosk tablets on weak Wi-Fi are
// the common case) can't drain its TCP socket as fast as entity updates
// arrive. Without a check, every update queues another message into that
// socket's write buffer on top of ones never delivered yet -- this is what
// was driving the heap-OOM crash-loop (confirmed via the [diagnostics] log:
// arrayBuffers ballooning to 1GB+ within a couple of minutes of a second
// client connecting). Skipping sends while already backed up bounds that
// growth; the client is resynced with a full snapshot once it catches up.
const RELAY_MAX_BUFFERED_BYTES = 4 * 1024 * 1024;

export function handleRelayClient(ws) {
  // Every update anywhere in the whole HA install used to re-serialize and
  // resend the ENTIRE ~1MB entity map to every client -- confirmed via
  // research as the dominant cause of "laggy dashboard" reports. Now only
  // the initial connect (and any resync after a skipped/failed send) gets
  // the full snapshot; every other update sends a compact diff instead.
  let needsFullResync = true;

  const sendFull = (entities) => {
    if (ws.readyState !== ws.OPEN) return;
    if (ws.bufferedAmount > RELAY_MAX_BUFFERED_BYTES) {
      console.warn(
        `[ha-relay] client is behind (bufferedAmount=${ws.bufferedAmount}); skipping full snapshot`
      );
      return;
    }
    try {
      ws.send(JSON.stringify({ type: 'entities', data: entities }));
      needsFullResync = false;
    } catch (err) {
      console.warn('[ha-relay] failed to send entity snapshot:', err);
      needsFullResync = true;
    }
  };

  const sendDiff = ({ changed, removed }) => {
    if (ws.readyState !== ws.OPEN) return;
    if (ws.bufferedAmount > RELAY_MAX_BUFFERED_BYTES) {
      console.warn(
        `[ha-relay] client is behind (bufferedAmount=${ws.bufferedAmount}); skipping this entity update`
      );
      needsFullResync = true;
      return;
    }
    try {
      ws.send(JSON.stringify({ type: 'entities_diff', changed, removed }));
    } catch (err) {
      console.warn('[ha-relay] failed to send entity diff:', err);
      needsFullResync = true;
    }
  };

  const handleUpdate = ({ full, diff }) => {
    if (needsFullResync) {
      sendFull(full);
    } else if (Object.keys(diff.changed).length > 0 || diff.removed.length > 0) {
      sendDiff(diff);
    }
  };

  getHaRelayConnection()
    .then(() => sendFull(getLatestEntities()))
    .catch((err) => {
      console.error('[ha-relay] failed to establish Home Assistant connection:', err);
      if (ws.readyState === ws.OPEN) {
        ws.send(
          JSON.stringify({
            type: 'error',
            id: null,
            error: 'Relay could not reach Home Assistant.',
          })
        );
      }
    });

  const unsubscribe = onEntitiesUpdate(handleUpdate);
  ws.isAlive = true;
  ws.on('pong', () => {
    ws.isAlive = true;
  });

  ws.on('message', (raw) => {
    let message;
    try {
      message = JSON.parse(raw.toString());
    } catch {
      return;
    }
    if (message?.type !== 'forward' || message.id === undefined) return;

    forwardMessage(message.payload)
      .then((result) => {
        if (ws.readyState === ws.OPEN) {
          ws.send(JSON.stringify({ type: 'response', id: message.id, result }));
        }
      })
      .catch((err) => {
        if (ws.readyState === ws.OPEN) {
          ws.send(
            JSON.stringify({ type: 'error', id: message.id, error: err?.message || String(err) })
          );
        }
      });
  });

  ws.on('error', (err) => {
    console.warn('[ha-relay] client socket error:', err?.message || err);
  });

  ws.on('close', unsubscribe);
}

if (isMainModule) {
  const server = createServer(app);
  const wss = new WebSocketServer({ noServer: true });

  // WS-relay upgrade -- mirrors the Express ingress-path-strip middleware
  // above, since upgrade requests never pass through Express middleware.
  server.on('upgrade', (req, socket, head) => {
    const ingressPath = req.headers['x-ingress-path'];
    let url = req.url;
    if (ingressPath && url.startsWith(ingressPath)) {
      url = url.slice(ingressPath.length) || '/';
    }

    if (url !== '/api/ws-relay') {
      socket.destroy();
      return;
    }

    const reqLike = {
      get: (name) => req.headers[name.toLowerCase()],
      socket: req.socket,
      connection: req.socket,
    };
    if (!getTrustedSupervisorUser(reqLike)) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      handleRelayClient(ws);
    });
  });

  // Kiosk/mobile clients routinely vanish without a clean WebSocket close
  // (sleep, dropped Wi-Fi, hard page reload) -- without this, such a client's
  // entity-update subscriber (server/haRelay.js) is never unsubscribed and
  // accumulates on every reconnect, since a dead TCP socket alone doesn't
  // fire 'close'. Pinging and terminating unresponsive sockets forces that
  // cleanup to happen promptly instead of relying on an OS-level timeout.
  const RELAY_HEARTBEAT_INTERVAL_MS = 30_000;
  const relayHeartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      if (ws.isAlive === false) {
        ws.terminate();
        continue;
      }
      ws.isAlive = false;
      ws.ping();
    }
  }, RELAY_HEARTBEAT_INTERVAL_MS);
  relayHeartbeat.unref();

  // Back up the SQLite database at startup if the newest copy is over a day
  // old, then daily; seven copies are kept under DATA_DIR/backups.
  const stopBackups = startBackupSchedule();

  // Temporary diagnostics for tracking down a heap-growth crash-loop --
  // remove once the cause is confirmed fixed. Logs process memory alongside
  // the size of the shared entity snapshot and how many relay clients are
  // currently subscribed to it, so a runaway subscriber leak (or a genuinely
  // huge entity snapshot) shows up directly in the addon log before a crash.
  const diagnosticsTimer = setInterval(() => {
    const mem = process.memoryUsage();
    const toMb = (bytes) => Math.round(bytes / 1024 / 1024);
    let entitiesSizeMb = 'n/a';
    try {
      entitiesSizeMb = toMb(Buffer.byteLength(JSON.stringify(getLatestEntities())));
    } catch {
      // ignore serialization errors in diagnostics
    }
    console.log(
      `[diagnostics] rss=${toMb(mem.rss)}MB heapUsed=${toMb(mem.heapUsed)}MB heapTotal=${toMb(mem.heapTotal)}MB external=${toMb(mem.external)}MB arrayBuffers=${toMb(mem.arrayBuffers)}MB wsClients=${wss.clients.size} entitySubscribers=${getEntitySubscriberCount()} entitiesSnapshot=${entitiesSizeMb}MB`
    );
  }, 15_000);
  diagnosticsTimer.unref();

  server.listen(PORT, '0.0.0.0', () => {
    console.log(
      `[server] Nyx backend running on port ${PORT} (${process.env.NODE_ENV === 'production' ? 'production' : 'development'})`
    );
  });

  warnIfHomeAssistantUrlMissing();
  installShutdownHandlers({
    server,
    database: db,
    stopBackups: () => {
      stopBackups();
      clearInterval(relayHeartbeat);
      clearInterval(diagnosticsTimer);
      // Relay sockets were upgraded away from the HTTP server, so server.close()
      // does not wait for or close them.
      for (const ws of wss.clients) ws.terminate();
    },
  });
}

export default app;
