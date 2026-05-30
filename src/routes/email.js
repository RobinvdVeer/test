const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/user');
const { ensureUserMiddleware } = require('../middleware/ensure-user');
const preferencesRepository = require('../repositories/email-preferences');

router.get('/preferences', authMiddleware, ensureUserMiddleware, async (req, res, next) => {
  try {
    const preferences = await preferencesRepository.getPreferences(req.userId);
    res.json(preferences || null);
  } catch (error) {
    next(error);
  }
});

router.put('/preferences', authMiddleware, ensureUserMiddleware, async (req, res, next) => {
  try {
    const { notify_daily, smtp_config } = req.body;

    // Validate notify_daily
    if (notify_daily !== undefined && typeof notify_daily !== 'boolean') {
      return res.status(400).json({ error: 'notify_daily must be a boolean' });
    }

    // Validate smtp_config if provided
    if (smtp_config !== undefined) {
      if (typeof smtp_config === 'string') {
        try {
          JSON.parse(smtp_config);
        } catch (e) {
          return res.status(400).json({ error: 'Invalid JSON in smtp_config' });
        }
      } else if (typeof smtp_config !== 'object') {
        return res.status(400).json({ error: 'smtp_config must be an object or JSON string' });
      }
    }

    const preferences = await preferencesRepository.createOrUpdatePreferences(req.userId, {
      notify_daily,
      smtp_config,
    });

    res.json({ success: true, preferences });
  } catch (error) {
    next(error);
  }
});

router.delete('/preferences', authMiddleware, ensureUserMiddleware, async (req, res, next) => {
  try {
    await preferencesRepository.deletePreferences(req.userId);
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
