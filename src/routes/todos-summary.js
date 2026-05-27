const express = require('express');
const { getTodoSummary } = require('../repositories/todosRepository');

function formatTodoSummary(row) {
  const summary = row || {};
  return {
    total: Number(summary.total || 0),
    status_counts: {
      pending: Number(summary.pending || 0),
      in_progress: Number(summary.in_progress || 0),
      completed: Number(summary.completed || 0),
    },
    priority_counts: {
      low: Number(summary.low || 0),
      medium: Number(summary.medium || 0),
      high: Number(summary.high || 0),
    },
    latest_created_at: summary.latest_created_at || null,
    latest_updated_at: summary.latest_updated_at || null,
  };
}

function registerTodosSummaryRoutes() {
  const router = express.Router();

  router.get(
    '/summary',
    async (req, res) => {
      try {
        const { category, status, q } = req.query;
        const result = await getTodoSummary(req.userId, { category, status, q });
        res.json(formatTodoSummary(result));
      } catch (error) {
        console.error('Error fetching todo summary:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    }
  );

  return router;
}

module.exports = { registerTodosSummaryRoutes, formatTodoSummary };
