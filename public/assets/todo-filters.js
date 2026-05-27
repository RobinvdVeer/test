export function readFilters(filtersForm) {
  const formData = new FormData(filtersForm);
  return {
    q: (formData.get('q') || '').toString().trim(),
    category: (formData.get('category') || '').toString().trim(),
    status: (formData.get('status') || '').toString().trim(),
    sort_by: (formData.get('sort_by') || '').toString().trim(),
    limit: (formData.get('limit') || '').toString().trim(),
  };
}

export function setFilters(filtersForm, filters) {
  filtersForm.elements.q.value = filters.q || '';
  filtersForm.elements.category.value = filters.category || '';
  filtersForm.elements.status.value = filters.status || '';
  filtersForm.elements.sort_by.value = filters.sort_by || 'last_viewed_desc';
  filtersForm.elements.limit.value = filters.limit || '50';
}

export function filtersToSearchParams(filters, { includeSortAndLimit = true } = {}) {
  const params = new URLSearchParams();
  if (filters.q) params.set('q', filters.q);
  if (filters.category) params.set('category', filters.category);
  if (filters.status) params.set('status', filters.status);
  if (includeSortAndLimit) {
    if (filters.sort_by && filters.sort_by !== 'last_viewed_desc') params.set('sort_by', filters.sort_by);
    if (filters.limit && filters.limit !== '50') params.set('limit', filters.limit);
  }
  return params;
}

export function buildUrl(path, params) {
  const queryString = params.toString();
  return queryString ? `${path}?${queryString}` : path;
}

export function syncUrl(filters) {
  const params = filtersToSearchParams(filters);
  const nextUrl = buildUrl(window.location.pathname, params);
  window.history.replaceState({}, '', nextUrl);
}

export function hydrateFiltersFromUrl(filtersForm) {
  const params = new URLSearchParams(window.location.search);
  setFilters(filtersForm, {
    q: params.get('q') || '',
    category: params.get('category') || '',
    status: params.get('status') || '',
    sort_by: params.get('sort_by') || 'last_viewed_desc',
    limit: params.get('limit') || '50',
  });
}
