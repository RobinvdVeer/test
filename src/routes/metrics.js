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

function registerMetricsRoutes(app, startTime) {
  // /metrics endpoint that returns process uptime
  app.get('/metrics', (req, res) => {
    const uptime = (Date.now() - startTime) / 1000; // uptime in seconds

    res.json({
      uptime: uptime,
      uptime_seconds: Math.floor(uptime),
      uptime_readable: formatUptime(uptime),
      timestamp: new Date().toISOString(),
      process: {
        pid: process.pid,
        memory: process.memoryUsage(),
        cpu: process.cpuUsage(),
      },
    });
  });
}

module.exports = { registerMetricsRoutes };
