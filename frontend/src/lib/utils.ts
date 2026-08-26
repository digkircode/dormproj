import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { i18n } from '@/i18n'

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

// Цифровые маски СНИЛС/код подразделения (CreateIndividualDialog.vue,
// CreateContractDialog.vue — блок родителя) — только цифры печатаются, разделители
// расставляются сами на @input. В отличие от даты эти поля почти всегда заполняются
// один раз подряд, а не правятся посимвольно посередине — простой "собрать цифры
// заново" маски тут достаточно, без посегментной перезаписи под кареткой.
export function blockNonDigitKeys(event: KeyboardEvent) {
  if (event.key.length !== 1) return
  if (!/[0-9]/.test(event.key)) event.preventDefault()
}

// СНИЛС — 000-000-000 00 (11 цифр).
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

// Код подразделения паспорта — 000-000 (6 цифр).
export function formatSubdivisionCode(rawValue: string): string {
  const digits = rawValue.replace(/\D/g, '').slice(0, 6)
  const part1 = digits.slice(0, 3)
  const part2 = digits.slice(3, 6)
  return part2 ? `${part1}-${part2}` : part1
}

// Простая проверка формата email для клиентской подсветки поля (см. emailInvalid в
// CreateIndividualDialog.vue) — не строгий RFC 5322, ровно то же самое, что и большинство
// сайтов: локальная часть без пробелов + '@' + домен с точкой.
export function isValidEmailFormat(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

// ФИО плательщика в модалке оплаты (CreatePaymentDialog.vue) — только буквы (кириллица/
// латиница), пробел и дефис (двойные фамилии). На @update:model-value, а не keydown —
// так же вырезает вставленное вставкой (Ctrl+V), не только напечатанное посимвольно.
// Тот же набор символов должен приниматься сервером — см. representativeFullName в
// my-payments.controller.ts.
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

// Маска даты дд.мм.гггг для DatePickerField/DateRangePickerField — 10-символьный шаблон
// с '_' на месте ещё не введённых цифр (не просто "нарастающая" строка), пустая строка
// означает "поле вообще нетронуто" (тогда показывается нативный placeholder). Раньше
// (до 2026-08-22) маска пересобиралась из ВСЕХ "сырых" цифр поля на каждый ввод —
// работало только для допечатывания в конец, а правка уже введённой даты посередине
// (например месяца в уже заполненной дате) сдвигала все цифры после каретки. Новый
// подход — каждая цифра ПЕРЕЗАПИСЫВАЕТ символ под кареткой (как в нативном
// input[type=date]/1С), не вставляется со сдвигом. См. handleDateMaskKeydown ниже —
// именно он держит @keydown на текстовых полях, applyDateMask больше не используется
// (paste/автозаполнение — через digitsToDateTemplate, см. ниже).
const EMPTY_DATE_TEMPLATE = '__.__.____'
const DATE_TEMPLATE_LEN = 10
const DATE_DOT_POSITIONS = [2, 5]

// Как только сегмент (день/месяц/год) заполнен целиком (без '_') — клемпим его в
// разумный диапазон, тот же принцип, что раньше был в applyDateMask, но теперь
// применяется к уже собранному 10-символьному шаблону.
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

// Один нажатый символ-цифра — записывает её на место каретки (при выделенном
// диапазоне сначала стирает выделенное в '_', как в обычных текстовых полях).
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

// Backspace/Delete — стирает под кареткой (или весь выделенный диапазон), не весь ввод.
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

// Общий @keydown для текстовых полей даты — цифры перезаписывают символ под кареткой
// (overwriteDateChar), Backspace/Delete стирают под кареткой (clearDateChar), остальные
// печатаемые символы блокируются (буквы и т.п.), навигационные клавиши (стрелки/Tab/
// Home/End/Enter) не трогаем — ими управляет браузер/другие @keydown-обработчики на том
// же элементе. Возвращает null, если событие не привело к изменению значения поля.
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

// Фолбэк для вставки (Ctrl+V)/автозаполнения/IME — этих путей handleDateMaskKeydown не
// перехватывает (событие 'input', не 'keydown', см. @input в DatePickerField.vue), тут
// вставленный текст — это осознанная замена всего значения, поэтому старый принцип
// "собрать все цифры по порядку" здесь уместен (в отличие от точечной правки одной цифры).
export function digitsToDateTemplate(rawValue: string): string {
  const digits = rawValue.replace(/\D/g, '').slice(0, 8)
  if (!digits) return ''
  const day = digits.slice(0, 2).padEnd(2, '_')
  const month = digits.slice(2, 4).padEnd(2, '_')
  const year = digits.slice(4, 8).padEnd(4, '_')
  return clampDateTemplate(`${day}.${month}.${year}`)
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

// Backend отдаёт ошибку невалидного тела как JSON-строку массива zod-issues (ZodError.message) —
// сырой JSON пользователю показывать незачем: если формат распознан, даём понятный текст и
// подсвечиваем конкретные поля; если нет (обычная текстовая ошибка) — показываем её как есть.
// Общий хелпер для диалогов создания (CreateContractDialog.vue/CreateIndividualDialog.vue).
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
    // не JSON — обычное текстовое сообщение об ошибке, оставляем как есть
  }
  return { message: raw, fields: new Set() }
}
