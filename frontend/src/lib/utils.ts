import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { i18n } from '@/i18n'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function blockScientificNotationKeys(event: KeyboardEvent) {
  if (event.key === 'e' || event.key === 'E' || event.key === '+') {
    event.preventDefault()
  }
}

export function blockNonNumericKeys(event: KeyboardEvent) {
  if (event.key.length !== 1) return
  if (/[0-9]/.test(event.key)) return
  const value = (event.target as HTMLInputElement).value
  if (event.key === '.' && !value.includes('.')) return
  event.preventDefault()
}

export function blockNonDigitKeys(event: KeyboardEvent) {
  if (event.key.length !== 1) return
  if (!/[0-9]/.test(event.key)) event.preventDefault()
}

export function formatSnils(rawValue: string): string {
  const digits = rawValue.replace(/\D/g, '').slice(0, 11)
  const part1 = digits.slice(0, 3)
  const part2 = digits.slice(3, 6)
  const part3 = digits.slice(6, 9)
  const part4 = digits.slice(9, 11)
  let result = part1
  if (part2) result += '-' + part2
  if (part3) result += '-' + part3
  if (part4) result += ' ' + part4
  return result
}

export function formatSubdivisionCode(rawValue: string): string {
  const digits = rawValue.replace(/\D/g, '').slice(0, 6)
  const part1 = digits.slice(0, 3)
  const part2 = digits.slice(3, 6)
  return part2 ? `${part1}-${part2}` : part1
}

export function isValidEmailFormat(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

export function sanitizeLettersOnly(rawValue: string): string {
  return rawValue.replace(/[^A-Za-zА-Яа-яЁё\s-]/g, '')
}

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
}

function daysInMonth(month: number, year?: number): number {
  if (month === 2) return year === undefined || isLeapYear(year) ? 29 : 28
  return DAYS_IN_MONTH[month - 1] ?? 31
}

const MIN_YEAR = 1900
const MAX_YEAR = 2050

const EMPTY_DATE_TEMPLATE = '__.__.____'
const DATE_TEMPLATE_LEN = 10
const DATE_DOT_POSITIONS = [2, 5]

function clampDateTemplate(value: string): string {
  let day = value.slice(0, 2)
  let month = value.slice(3, 5)
  let year = value.slice(6, 10)
  if (!month.includes('_')) {
    if (Number(month) === 0) month = '01'
    else if (Number(month) > 12) month = '12'
  }
  if (!day.includes('_')) {
    const maxDay = !month.includes('_') ? daysInMonth(Number(month), !year.includes('_') ? Number(year) : undefined) : 31
    if (Number(day) === 0) day = '01'
    else if (Number(day) > maxDay) day = String(maxDay).padStart(2, '0')
  }
  if (!year.includes('_')) {
    if (Number(year) < MIN_YEAR) year = String(MIN_YEAR)
    else if (Number(year) > MAX_YEAR) year = String(MAX_YEAR)
  }
  return `${day}.${month}.${year}`
}

export function overwriteDateChar(current: string, caretStart: number, caretEnd: number, digit: string): { value: string; caret: number } {
  const chars = (current || EMPTY_DATE_TEMPLATE).split('')
  for (let i = caretStart; i < caretEnd && i < DATE_TEMPLATE_LEN; i++) {
    if (!DATE_DOT_POSITIONS.includes(i)) chars[i] = '_'
  }
  let caret = caretStart
  if (DATE_DOT_POSITIONS.includes(caret)) caret++
  if (caret >= DATE_TEMPLATE_LEN) return { value: clampDateTemplate(chars.join('')), caret: DATE_TEMPLATE_LEN }
  chars[caret] = digit
  caret++
  if (DATE_DOT_POSITIONS.includes(caret)) caret++
  return { value: clampDateTemplate(chars.join('')), caret }
}

export function clearDateChar(
  current: string,
  caretStart: number,
  caretEnd: number,
  direction: 'backward' | 'forward',
): { value: string; caret: number } {
  if (!current) return { value: '', caret: 0 }
  const chars = current.split('')
  const collapse = (value: string) => (value === EMPTY_DATE_TEMPLATE ? '' : value)

  if (caretEnd > caretStart) {
    for (let i = caretStart; i < caretEnd && i < DATE_TEMPLATE_LEN; i++) {
      if (!DATE_DOT_POSITIONS.includes(i)) chars[i] = '_'
    }
    return { value: collapse(chars.join('')), caret: caretStart }
  }

  if (direction === 'backward') {
    let pos = caretStart - 1
    if (DATE_DOT_POSITIONS.includes(pos)) pos--
    if (pos < 0) return { value: current, caret: caretStart }
    chars[pos] = '_'
    return { value: collapse(chars.join('')), caret: pos }
  }

  let pos = caretStart
  if (DATE_DOT_POSITIONS.includes(pos)) pos++
  if (pos >= DATE_TEMPLATE_LEN) return { value: current, caret: caretStart }
  chars[pos] = '_'
  return { value: collapse(chars.join('')), caret: caretStart }
}

export function handleDateMaskKeydown(event: KeyboardEvent, current: string): { value: string; caret: number } | null {
  const input = event.target as HTMLInputElement
  const key = event.key
  if (key.length === 1) {
    event.preventDefault()
    if (!/[0-9]/.test(key)) return null
    return overwriteDateChar(current, input.selectionStart ?? 0, input.selectionEnd ?? 0, key)
  }
  if (key === 'Backspace' || key === 'Delete') {
    event.preventDefault()
    return clearDateChar(current, input.selectionStart ?? 0, input.selectionEnd ?? 0, key === 'Backspace' ? 'backward' : 'forward')
  }
  return null
}

export function digitsToDateTemplate(rawValue: string): string {
  const digits = rawValue.replace(/\D/g, '').slice(0, 8)
  if (!digits) return ''
  const day = digits.slice(0, 2).padEnd(2, '_')
  const month = digits.slice(2, 4).padEnd(2, '_')
  const year = digits.slice(4, 8).padEnd(4, '_')
  return clampDateTemplate(`${day}.${month}.${year}`)
}

export function goBack(router: { back: () => void; push: (path: string) => void }, fallback: string) {
  if (window.history.state?.back) {
    router.back()
  } else {
    router.push(fallback)
  }
}

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

export function parseApiError(error: unknown): { message: string; fields: Set<string> } {
  const raw = error instanceof Error ? error.message : String(error)
  try {
    const parsed: unknown = JSON.parse(raw)
    if (Array.isArray(parsed) && parsed.length > 0 && parsed.every((i) => i && typeof i === 'object' && 'path' in i)) {
      const fields = new Set<string>()
      for (const issue of parsed as { path: unknown[] }[]) {
        const first = issue.path[0]
        if (typeof first === 'string') fields.add(first)
      }
      return { message: i18n.global.t('errors.checkDataFields'), fields }
    }
  } catch {
  }
  return { message: raw, fields: new Set() }
}
