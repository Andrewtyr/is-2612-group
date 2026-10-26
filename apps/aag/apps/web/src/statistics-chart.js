window.statisticsChartData = (labels, counts) => {
  const palette = ['#087c44', '#d2a64a', '#4077bd', '#a76bc1', '#df7f5a', '#4fada9', '#7b8b52', '#c36b89', '#6964b5', '#a37751'];
  const total = counts.reduce((sum, count) => sum + Math.max(0, count), 0);
  let cursor = 0;
  const sectors = counts.map((count, index) => {
    const start = cursor;
    cursor += total ? count / total * 100 : 0;
    return `${palette[index % palette.length]} ${Number(start.toFixed(2))}% ${Number(cursor.toFixed(2))}%`;
  });
  return {
    rows: counts.map((count, index) => ({ label: labels[index] ?? String(index + 1), count, percent: total ? Math.round(count / total * 100) : 0, color: palette[index % palette.length] })),
    gradient: total ? `conic-gradient(${sectors.join(', ')})` : 'conic-gradient(#e3eee6 0% 100%)',
  };
};
