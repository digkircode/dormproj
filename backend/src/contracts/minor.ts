// Тот же расчёт возраста, что во фронтовом computed isMinor (frontend/src/pages/Contracts.vue) —
// несовершеннолетие считается на дату ДОГОВОРА (contractDate), не "сегодня", это
// юридически значимый момент подписания. Продублировано, а не вынесено в общий пакет —
// backend/frontend разные рантаймы, общего кода между ними в проекте нет нигде.
function calculateAge(birthDateIso: string | Date, referenceDate: Date): number {
  const birth = new Date(birthDateIso);
  let age = referenceDate.getFullYear() - birth.getFullYear();
  const hadBirthdayThisYear =
    referenceDate.getMonth() > birth.getMonth() ||
    (referenceDate.getMonth() === birth.getMonth() && referenceDate.getDate() >= birth.getDate());
  if (!hadBirthdayThisYear) age--;
  return age;
}

export function isMinorAt(birthDate: Date | null, referenceDate: Date): boolean {
  if (!birthDate) return false;
  return calculateAge(birthDate, referenceDate) < 18;
}
