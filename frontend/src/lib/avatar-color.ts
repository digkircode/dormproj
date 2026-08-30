// Цвет аватарки по хэшу ФИО (Slack/Discord-style) — по прямой просьбе решает сразу
// две вещи: аватар больше не сливается с hover/выбранным фоном строки диалога (тот и
// bg-secondary у Avatar по умолчанию — почти один и тот же нейтральный оттенок в этой
// теме, отсюда и была "невидимая" аватарка), и сам чат выглядит живее одним заходом.
// Полный список классов — литералами (не собран из шаблонной строки), чтобы Tailwind
// на этапе сборки точно их увидел и не выпилил как неиспользуемые.
const AVATAR_PALETTE = [
  'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
  'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
  'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  'bg-pink-100 text-pink-700 dark:bg-pink-950 dark:text-pink-300',
  'bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300',
  'bg-teal-100 text-teal-700 dark:bg-teal-950 dark:text-teal-300',
  'bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300',
  'bg-cyan-100 text-cyan-700 dark:bg-cyan-950 dark:text-cyan-300',
]

function hashString(value: string): number {
  let hash = 0
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0
  }
  return hash
}

export function avatarColorClasses(name: string): string {
  return AVATAR_PALETTE[hashString(name) % AVATAR_PALETTE.length]
}

// Иконка-бейдж разных цветов по хэшу id (объявления, см. ResidentHomeDashboard.vue/
// StaffHomeDashboard.vue) — тот же приём, что у аватарок выше, но отдельная пара классов
// (контейнер/иконка), т.к. это не текст-инициалы, а lucide-иконка через currentColor —
// тот же паттерн "bg-*-100 контейнер + text-*-600 иконка", что уже используют статичные
// цветные бейджики карточек "Моя комната"/"Оплата"/"Чат"/"Контакты".
const ICON_BADGE_PALETTE = [
  { container: 'bg-sky-100 dark:bg-sky-500/15', icon: 'text-sky-600 dark:text-sky-400' },
  { container: 'bg-emerald-100 dark:bg-emerald-500/15', icon: 'text-emerald-600 dark:text-emerald-400' },
  { container: 'bg-amber-100 dark:bg-amber-500/15', icon: 'text-amber-600 dark:text-amber-400' },
  { container: 'bg-pink-100 dark:bg-pink-500/15', icon: 'text-pink-600 dark:text-pink-400' },
  { container: 'bg-violet-100 dark:bg-violet-500/15', icon: 'text-violet-600 dark:text-violet-400' },
  { container: 'bg-teal-100 dark:bg-teal-500/15', icon: 'text-teal-600 dark:text-teal-400' },
  { container: 'bg-orange-100 dark:bg-orange-500/15', icon: 'text-orange-600 dark:text-orange-400' },
  { container: 'bg-blue-100 dark:bg-blue-500/15', icon: 'text-blue-600 dark:text-blue-400' },
]

export function iconBadgeColorClasses(seed: string | number): { container: string; icon: string } {
  return ICON_BADGE_PALETTE[hashString(String(seed)) % ICON_BADGE_PALETTE.length]
}

export function initials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase()
}

// "Иванов И.И." — та же короткая форма ФИО, что и в печати договора (см. backend
// surnameWithInitials в money-to-words.ts/contract-document-data.ts), для подписи
// отправителя в окне чата — полное ФИО там не нужно, аватар рядом уже даёт исходные
// 2 буквы.
export function shortName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return ''
  const [surname, ...rest] = parts
  const initialsPart = rest.map((p) => `${p.charAt(0).toUpperCase()}.`).join('')
  return initialsPart ? `${surname} ${initialsPart}` : surname
}
