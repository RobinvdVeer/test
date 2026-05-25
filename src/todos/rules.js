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
};
