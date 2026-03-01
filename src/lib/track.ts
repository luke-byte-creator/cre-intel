export function track(action: string, category: string, detail?: Record<string, any>) {
  fetch('/api/analytics/track', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, category, detail, path: window.location.pathname }),
  }).catch(() => {});
}
