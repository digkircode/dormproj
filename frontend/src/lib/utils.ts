import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
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
