/**
 * Email Reminder Worker Service
 *
 * This service runs independently and is triggered by cron or scheduler.
 * It checks for todos due within 2 days and sends reminder emails to users.
 */

require('dotenv').config();

const { getConfig } = require('./src/config');
const { getPool, closePool } = require('./src/db/pool');
const emailReminderService = require('./src/services/emailReminder');

const { PORT } = getConfig().port || 3001;

let server;

async function start() {
  try {
    const config = getConfig();

    console.log('Starting Email Reminder Worker...');
    console.log(`Database URL: ${config.DATABASE_URL ? '✓' : '✗ (Required)'}`);
    console.log(`SMTP Host: ${config.smtpHost || '✗ (Required)'}`);

    if (!config.DATABASE_URL) {
      console.error('DATABASE_URL environment variable is required');
      process.exit(1);
    }

    if (!config.smtpHost) {
      console.error('SMTP_HOST environment variable is required');
      process.exit(1);
    }

    console.log('Configuring email service...');
    const emailConfig = {
      frontendUrl: config.frontendUrl || 'http://localhost:3000',
      smtpHost: config.smtpHost,
      smtpPort: config.smtpPort || 587,
      smtpUser: config.smtpUser,
      smtpPass: config.smtpPass,
      secure: config.smtpSecure || false,
      fromEmail: config.fromEmail || config.smtpUser,
      emailCheckInterval: config.emailCheckInterval || 60 * 60 * 1000, // hourly default
    };

    // Store in app for route access
    app.set('emailConfig', emailConfig);

    // Start scheduled email checks
    const interval = emailConfig.emailCheckInterval;
    console.log(`\n📧 Email reminder check scheduled every ${emailConfig.emailCheckInterval / (1000 * 60)} minutes`);

    emailReminderService.scheduleReminderCheck(emailConfig);

    // Health check endpoint
    app.get('/health', (req, res) => {
      res.json({
        status: 'ok',
        service: 'email-worker',
        last_check: new Date().toISOString(),
      });
    });

    // Manual trigger endpoint - requires admin trigger token
    const ADMIN_TRIGGER_TOKEN = process.env.ADMIN_TRIGGER_TOKEN;
    if (ADMIN_TRIGGER_TOKEN) {
      app.post('/trigger', async (req, res) => {
        const token = req.headers['authorization'];
        if (!token || token !== `Bearer ${ADMIN_TRIGGER_TOKEN}`) {
          return res.status(401).json({ error: 'Unauthorized' });
        }
        try {
          await emailReminderService.triggerNow(emailConfig);
          res.json({ success: true, message: 'Emails sent successfully' });
        } catch (err) {
          res.status(500).json({ success: false, error: err.message });
        }
      });
    } else {
      // No token configured - this endpoint is inaccessible in production
      app.post('/trigger', (req, res) => {
        const msg = 'ADMIN_TRIGGER_TOKEN not configured in environment';
        console.warn(msg + '. To enable manual triggering, set ADMIN_TRIGGER_TOKEN.\n');
        res.status(403).json({ error: msg });
      });
    }

    server = app.listen(PORT, () => {
      console.log(`\n✓ Email Reminder Worker running on http://localhost:${PORT}`);
      console.log(`✓ Health check: http://localhost:${PORT}/health`);
      console.log(`✓ Manual trigger: http://localhost:${PORT}/trigger\n`);
    });

    // Graceful shutdown
    process.on('SIGTERM', () => {
      console.log('\nSIGTERM received: shutting down email worker...');
      if (server) {
        server.close(() => {
          console.log('HTTP server closed');
          closePool()
            .then(() => {
              console.log('Database pool closed');
              process.exit(0);
            })
            .catch((err) => {
              console.error('Error closing database pool:', err);
              process.exit(1);
            });
        });
      }
    });

    process.on('SIGINT', () => {
      console.log('\nSIGINT received: shutting down email worker...');
      if (server) {
        server.close(() => {
          console.log('HTTP server closed');
          closePool()
            .then(() => {
              console.log('Database pool closed');
              process.exit(0);
            })
            .catch((err) => {
              console.error('Error closing database pool:', err);
              process.exit(1);
            });
        });
      }
    });

  } catch (err) {
    console.error('Failed to start email worker:', err);
    process.exit(1);
  }
}

const express = require('express');
const app = express();

// Body parser middleware (only needed for POST routes)
app.use(require('body-parser').json());

start();
