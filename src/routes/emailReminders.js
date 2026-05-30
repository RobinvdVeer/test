const express = require('express');
const { authMiddleware } = require('../middleware/user');
const { ensureUserMiddleware } = require('../middleware/ensure-user');
const emailReminderService = require('../services/emailReminder');

/**
 * Register email reminder routes
 */
function registerRoutes(app) {
  const router = express.Router();

  // Protected routes
  router.use(authMiddleware, ensureUserMiddleware);

  // Get email reminder configuration for current user
  router.get('/config', async (req, res) => {
    const userId = req.userId;

    const result = await getPool().query(
      `SELECT frequency_millis, active, created_at
       FROM email_reminders_config
       WHERE user_id = $1
       ORDER BY created_at DESC LIMIT 1`,
      [userId]
    );

    if (result.rows.length === 0) {
      return res.json({
        active: true,
        frequency_millis: 24 * 60 * 60 * 1000, // default 24 hours
        frequency_hours: 24,
      });
    }

    return res.json({
      active: result.rows[0].active,
      frequency_millis: result.rows[0].frequency_millis,
      frequency_hours: Math.round(result.rows[0].frequency_millis / (60 * 60 * 1000)),
    });
  });

  // Update email reminder configuration for current user
  router.put('/config', async (req, res) => {
    const userId = req.userId;
    const { frequency_hours, active } = req.body;

    // Validate frequency_hours
    if (frequency_hours !== undefined) {
      if (typeof frequency_hours !== 'number' || frequency_hours < 1) {
        return res.status(400).json({
          error: 'frequency_hours must be a positive number',
        });
      }

      if (frequency_hours > 720) {
        // Max 24 hours for demo purposes
        return res.status(400).json({
          error: 'frequency_hours cannot exceed 720 hours (30 days)',
        });
      }
    }

    // Validate active
    if (active !== undefined) {
      if (typeof active !== 'boolean') {
        return res.status(400).json({
          error: 'active must be a boolean',
        });
      }
    }

    const pool = getPool();

    const result = await pool.query(
      `INSERT INTO email_reminders_config (user_id, frequency_millis, active)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id)
       DO UPDATE SET
         frequency_millis = EXCLUDED.frequency_millis,
         active = EXCLUDED.active,
         last_updated = NOW()
       RETURNING frequency_millis, active`,
      [
        userId,
        frequency_hours ? frequency_hours * 60 * 60 * 1000 : null,
        active !== undefined ? active : null,
      ]
    );

    return res.json({
      success: true,
      config: {
        active: result.rows[0].active,
        frequency_millis: result.rows[0].frequency_millis,
        frequency_hours: Math.round(result.rows[0].frequency_millis / (60 * 60 * 1000)),
      },
    });
  });

  // Get last email status for current user
  router.get('/last-sent', async (req, res) => {
    const userId = req.userId;

    const result = await pool.query(
      `SELECT last_email_sent, last_checked_at
       FROM email_reminder_status
       WHERE user_id = $1`,
      [userId]
    );

    if (result.rows.length === 0) {
      return res.json({
        last_email_sent: null,
        last_checked_at: null,
      });
    }

    return res.json({
      last_email_sent: result.rows[0].last_email_sent,
      last_checked_at: result.rows[0].last_checked_at,
    });
  });

  // Manual trigger for sending emails (all users)
  router.post('/send-all', async (req, res) => {
    const { frontendUrl, smtpHost, smtpPort, smtpUser, smtpPass, fromEmail } = req.app.get('emailConfig');

    if (!frontendUrl || !smtpHost) {
      return res.status(400).json({
        error: 'Email configuration not available. Please provide email settings.',
      });
    }

    const config = {
      frontendUrl,
      fromEmail: fromEmail || smtpUser,
      smtpHost,
      smtpPort: smtpPort || 587,
      secure: req.app.get('emailSecure') || false,
      emailCheckInterval: req.app.get('emailCheckInterval') || 60 * 60 * 1000,
    };

    try {
      const result = await emailReminderService.triggerNow(config);
      return res.json({
        success: true,
        result,
      });
    } catch (err) {
      console.error('Error triggering emails:', err);
      return res.status(500).json({
        error: 'Failed to send reminder emails',
        message: err.message,
      });
    }
  });

  // Get user's due todos (for testing/demo)
  router.get('/due-todos', async (req, res) => {
    const userId = req.userId;

    const todos = await emailReminderService.getDueTodos(userId);

    return res.json({
      count: todos.length,
      todos,
    });
  });

  return router;
}

module.exports = { registerRoutes };
