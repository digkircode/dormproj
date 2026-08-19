import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Для таблиц с шапкой, вынесенной в отдельную нескроллящуюся <table> (чтобы скроллбар
// тела не проходил по шапке — см. промпт проекта) — тело теряет полосу под нативный
// скроллбар, а шапка нет, колонки двух независимых таблиц расходятся вправо. Меряем
// реальную ширину скроллбара один раз (0 на macOS/мобильных с overlay-скроллбарами —
// там резервировать нечего) и резервируем её под шапкой через padding-right.
let scrollbarWidthCache: number | null = null
export function getScrollbarWidth(): number {
  if (scrollbarWidthCache !== null) return scrollbarWidthCache
  const outer = document.createElement('div')
  outer.style.cssText = 'visibility:hidden;overflow:scroll;position:absolute;top:-9999px;width:100px;height:100px'
  const inner = document.createElement('div')
  inner.style.width = '100%'
  outer.appendChild(inner)
  document.body.appendChild(outer)
  scrollbarWidthCache = outer.offsetWidth - inner.offsetWidth
  document.body.removeChild(outer)
  return scrollbarWidthCache
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

// Маска даты дд.мм.гггг для текстовых полей DatePickerField/DateRangePickerField —
// пользователь вводит только цифры, точки расставляются сами. blockNonDigitKeys не
// пускает в поле вообще ничего, кроме цифр (даже точку — её пользователь не печатает),
// applyDateMask на @input перестраивает строку из "сырых" цифр текущего значения.
export function blockNonDigitKeys(event: KeyboardEvent) {
  if (event.key.length !== 1) return
  if (!/[0-9]/.test(event.key)) event.preventDefault()
}

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
}

// Пока год не введён — не режем 29 февраля заранее (год печатается последним в
// дд.мм.гггг, но applyDateMask пересчитывает результат заново на каждый ввод, так что
// как только год дописан, day.length===2 && month.length===2 условие ниже пересчитает
// максимум уже с известным годом и обрежет 29 задним числом, если год не високосный).
function daysInMonth(month: number, year?: number): number {
  if (month === 2) return year === undefined || isLeapYear(year) ? 29 : 28
  return DAYS_IN_MONTH[month - 1] ?? 31
}

const MAX_YEAR = 2050

export function applyDateMask(rawValue: string): string {
  const digits = rawValue.replace(/\D/g, '').slice(0, 8)
  let day = digits.slice(0, 2)
  let month = digits.slice(2, 4)
  let year = digits.slice(4, 8)

  if (month.length === 2) {
    if (Number(month) === 0) month = '01'
    else if (Number(month) > 12) month = '12'
  }
  if (day.length === 2) {
    const maxDay = month.length === 2 ? daysInMonth(Number(month), year.length === 4 ? Number(year) : undefined) : 31
    if (Number(day) === 0) day = '01'
    else if (Number(day) > maxDay) day = String(maxDay).padStart(2, '0')
  }
  if (year.length === 4 && Number(year) > MAX_YEAR) year = String(MAX_YEAR)

  let result = day
  if (month) result += '.' + month
  if (year) result += '.' + year
  return result
}

// "Назад" на карточках — раньше вели на жёстко зашитый роут списка (RouterLink to="/x"),
// что уводило не туда, если на карточку попали иначе (например с другой страницы, не из
// списка). history.state.back — служебное поле самого vue-router (createWebHistory),
// заполнено, только если есть реальная предыдущая запись в истории SPA-навигации; если
// его нет (прямой заход по ссылке/обновление страницы), откатываемся на fallback.
export function goBack(router: { back: () => void; push: (path: string) => void }, fallback: string) {
  if (window.history.state?.back) {
    router.back()
  } else {
    router.push(fallback)
  }
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
