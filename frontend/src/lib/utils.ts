import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// <input type="number"> нативно разрешает "e"/"E"/"+" (научная нотация вида 1e5) —
// единственные буквы/символы, которые проходят в поле, где ожидается обычное число.
// Визуально выглядит как "нажал букву — а она возьми и появись". Вешать на @keydown.
export function blockScientificNotationKeys(event: KeyboardEvent) {
  if (event.key === 'e' || event.key === 'E' || event.key === '+') {
    event.preventDefault()
  }
}

// Chrome сам не даёт напечатать буквы в <input type="number">, но Firefox их не
// блокирует (пропускает любой символ, оставляя поле в невалидном состоянии до потери
// фокуса/сабмита — оттуда и всплывающая нативная подсказка "Пожалуйста, введите число").
// Фильтруем на уровне keydown сами, одинаково для обоих браузеров, вместо того чтобы
// полагаться на нативное поведение number-инпута. Разрешены цифры и одна точка
// (десятичный разделитель) — остальные печатаемые символы, включая e/E/+/-, блокируются.
export function blockNonNumericKeys(event: KeyboardEvent) {
  if (event.key.length !== 1) return
  if (/[0-9]/.test(event.key)) return
  const value = (event.target as HTMLInputElement).value
  if (event.key === '.' && !value.includes('.')) return
  event.preventDefault()
}

// navigator.clipboard требует secure context (HTTPS или localhost) — сайт пока на
// обычном HTTP (см. CONTEXT_HANDOFF.md, "Secure=false — пока нет HTTPS), там его либо
// нет вовсе, либо writeText молча не срабатывает. Фолбэк — скрытая textarea +
// document.execCommand('copy') (устаревший API, но работает без HTTPS).
export async function copyToClipboard(text: string): Promise<void> {
  if (window.isSecureContext && navigator.clipboard) {
    await navigator.clipboard.writeText(text)
    return
  }
  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)
  textarea.focus()
  textarea.select()
  try {
    document.execCommand('copy')
  } finally {
    document.body.removeChild(textarea)
  }
}
