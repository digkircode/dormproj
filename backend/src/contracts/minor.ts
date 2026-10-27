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
