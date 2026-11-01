export function reportAnalyticsCsv(data) {
  const rows = [
    ['MajiSmart report analytics'],
    ['Submitted from', data.filters.start, 'through', data.filters.end, data.filters.timezone],
    ['Category', data.filters.category],
    ['Generated at', data.generated_at],
    ['Metric', 'Value'],
    ['Total submitted', data.total], ['Currently open', data.open],
    ['Currently resolved', data.resolved], ['Currently rejected', data.rejected],
    ['Resolved share of all selected reports (%)', data.resolution_rate_percent ?? ''],
    ['Average hours to latest resolution', data.average_resolution_hours ?? ''],
    ['Resolution time sample size', data.resolution_sample_size],
    [], ['Current status', 'Count'], ...data.statuses.map(s => [s.label, s.count]),
    [], ['Category', 'Count'], ...data.categories.map(s => [s.label, s.count]),
    [], ['Submission date (Africa/Lusaka)', 'Count'], ...data.daily_submissions.map(s => [s.date, s.count]),
    [], ['Open report age', 'Count'], ...Object.entries(data.open_age),
    [], ['Station or reported location', 'Reports', 'Currently open'],
    ...data.locations.map(l => [l.location, l.total, l.open])
  ];
  return '\uFEFF' + rows.map(row => row.map(value => {
    let text = String(value ?? '');
    if (typeof value === 'string' && /^[\s]*[=+@-]/.test(text)) text = "'" + text;
    return '"' + text.replace(/"/g, '""') + '"';
  }).join(',')).join('\r\n');
}
