const VALID_STATUS = new Set(['pending', 'in_progress', 'completed']);
const VALID_PRIORITY = new Set(['low', 'medium', 'high']);
const VALID_SORT_BY = new Set([
  'created_asc',
  'created_desc',
  'updated_asc',
  'updated_desc',
  'last_viewed_asc',
  'last_viewed_desc',
]);

const DEFAULT_TODO_STATUS = 'pending';
const DEFAULT_TODO_PRIORITY = 'medium';

function validateDueDate(value) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const err = new Error('Invalid due date');
    err.code = 'INVALID_DUE_DATE';
    throw err;
  }

  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    const err = new Error('Invalid due date');
    err.code = 'INVALID_DUE_DATE';
    throw err;
  }

  return value;
}

function parseOptionalNonNegativeInt(v) {
  if (v === undefined || v === null) return undefined;
  const n = Number.parseInt(v, 10);
  if (!Number.isSafeInteger(n) || n < 0) return undefined;
  return n;
}

function normalizeSortBy(sortBy) {
  if (sortBy === undefined) return undefined;
  return VALID_SORT_BY.has(sortBy) ? sortBy : undefined;
}

module.exports = {
  DEFAULT_TODO_PRIORITY,
  DEFAULT_TODO_STATUS,
  VALID_PRIORITY,
  VALID_SORT_BY,
  VALID_STATUS,
  normalizeSortBy,
  parseOptionalNonNegativeInt,
  validateDueDate,
};
