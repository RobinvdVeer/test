function formatUptime(seconds) {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (secs > 0 || parts.length === 0) parts.push(`${secs}s`);

  return parts.join(' ');
}

function registerMetricsRoutes(router, startTime) {
  // /metrics endpoint that returns process uptime
  // Metrics are polled frequently, so cache expensive process calls.
  const CACHE_INTERVAL_MS = 1000;
  let cachedPayload = null;
  let cachedAtMs = 0;

  router.get('/metrics', (req, res) => {
    const nowMs = Date.now();

    if (cachedPayload && nowMs - cachedAtMs < CACHE_INTERVAL_MS) {
      return res.json(cachedPayload);
    }

    const uptime = (nowMs - startTime) / 1000; // uptime in seconds

    const payload = {
      uptime: uptime,
      uptime_seconds: Math.floor(uptime),
      uptime_readable: formatUptime(uptime),
      timestamp: new Date(nowMs).toISOString(),
      process: {
        pid: process.pid,
        memory: process.memoryUsage(),
        cpu: process.cpuUsage(),
      },
    };

    cachedPayload = payload;
    cachedAtMs = nowMs;

    res.json(payload);
  });
}

module.exports = { registerMetricsRoutes };
