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

export function avatarColorClasses(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0
  }
  return AVATAR_PALETTE[hash % AVATAR_PALETTE.length]
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
