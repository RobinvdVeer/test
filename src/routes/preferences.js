const express = require('express');
const { getUserEmailPreferences, updateUserEmailPreferences } = require('../repositories/usersRepository');

function withErrorHandling(logPrefix, handler) {
  return async (req, res) => {
    try {
      await handler(req, res);
    } catch (error) {
      console.error(logPrefix, error);
      res.status(500).json({ error: 'Internal server error' });
    }
  };
}

function registerPreferencesRoutes() {
  const router = express.Router();

  // GET /user/preferences - Get current email preferences
  router.get(
    '/',
    withErrorHandling('Error fetching email preferences:', async (req, res) => {
      const preferences = await getUserEmailPreferences(req.userId);
      res.json(preferences);
    })
  );

  // PUT /user/preferences - Update email preferences
  router.put(
    '/',
    withErrorHandling('Error updating email preferences:', async (req, res) => {
      const { email_enabled, email_frequency_hours, email } = req.body;

      // Validate email_frequency_hours if provided
      if (email_frequency_hours !== undefined) {
        const freq = Number(email_frequency_hours);
        if (!Number.isSafeInteger(freq) || freq < 1 || freq > 168) {
          // Allow 1-168 hours (1 day to 1 week)
          return res.status(400).json({
            error: 'email_frequency_hours must be an integer between 1 and 168',
          });
        }
      }

      // Validate email if provided
      if (email !== undefined && email !== null && email !== '') {
        // Basic email format validation
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
          return res.status(400).json({ error: 'Invalid email address format' });
        }
      }

      const preferences = await updateUserEmailPreferences(req.userId, {
        email,
        email_enabled,
        email_frequency_hours,
      });

      res.json(preferences);
    })
  );

  return router;
}

module.exports = { registerPreferencesRoutes };
