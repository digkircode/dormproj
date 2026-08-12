// Бэкенд всегда на порту 3000 того же хоста, что и фронт (см. docker-compose) —
// поэтому проще вычислить адрес во время выполнения, чем городить build-time env var.
export function apiUrl(path: string): string {
  return `${window.location.protocol}//${window.location.hostname}:3000${path}`
}
