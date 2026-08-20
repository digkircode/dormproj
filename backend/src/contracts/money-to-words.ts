import { Prisma } from '../../generated/prisma/client.js';

const UNITS_MASCULINE = ['', 'один', 'два', 'три', 'четыре', 'пять', 'шесть', 'семь', 'восемь', 'девять'];
const UNITS_FEMININE = ['', 'одна', 'две', 'три', 'четыре', 'пять', 'шесть', 'семь', 'восемь', 'девять'];
const TEENS = [
  'десять', 'одиннадцать', 'двенадцать', 'тринадцать', 'четырнадцать',
  'пятнадцать', 'шестнадцать', 'семнадцать', 'восемнадцать', 'девятнадцать',
];
const TENS = ['', '', 'двадцать', 'тридцать', 'сорок', 'пятьдесят', 'шестьдесят', 'семьдесят', 'восемьдесят', 'девяносто'];
const HUNDREDS = ['', 'сто', 'двести', 'триста', 'четыреста', 'пятьсот', 'шестьсот', 'семьсот', 'восемьсот', 'девятьсот'];

// Стандартный русский выбор формы по числительному: 1 -> forms[0], 2-4 -> forms[1],
// 0/5-20 -> forms[2] (11-14 всегда forms[2], даже когда последняя цифра 1-4).
function pluralForm(n: number, forms: [string, string, string]): string {
  const hundredRem = n % 100;
  if (hundredRem >= 11 && hundredRem <= 14) return forms[2];
  const tenRem = n % 10;
  if (tenRem === 1) return forms[0];
  if (tenRem >= 2 && tenRem <= 4) return forms[1];
  return forms[2];
}

function groupToWords(n: number, feminine: boolean): string[] {
  const words: string[] = [];
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  if (hundreds) words.push(HUNDREDS[hundreds]);
  if (rest >= 10 && rest <= 19) {
    words.push(TEENS[rest - 10]);
  } else {
    const tens = Math.floor(rest / 10);
    const units = rest % 10;
    if (tens) words.push(TENS[tens]);
    if (units) words.push((feminine ? UNITS_FEMININE : UNITS_MASCULINE)[units]);
  }
  return words;
}

// Поддержка до миллиардов с запасом — реальные суммы найма в разы меньше.
function integerToWords(n: number): string {
  if (n === 0) return 'ноль';
  const parts: string[] = [];
  const millions = Math.floor(n / 1_000_000);
  const thousands = Math.floor((n % 1_000_000) / 1000);
  const rest = n % 1000;
  if (millions) {
    parts.push(...groupToWords(millions, false));
    parts.push(pluralForm(millions, ['миллион', 'миллиона', 'миллионов']));
  }
  if (thousands) {
    parts.push(...groupToWords(thousands, true));
    parts.push(pluralForm(thousands, ['тысяча', 'тысячи', 'тысяч']));
  }
  if (rest || parts.length === 0) {
    parts.push(...groupToWords(rest, false));
  }
  return parts.join(' ');
}

function capitalize(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

// "Девять тысяч пятьсот рублей" — целая часть суммы прописью с правильным
// склонением "рубль/рубля/рублей" по числу рублей, первая буква заглавная.
export function rublesInWords(rubles: number): string {
  const words = integerToWords(rubles);
  const currency = pluralForm(rubles, ['рубль', 'рубля', 'рублей']);
  return capitalize(`${words} ${currency}`);
}

// "9 500" — целая часть суммы цифрами с разбивкой по разрядам, без суффикса валюты
// (валюта и копейки печатаются отдельными тегами в шаблоне, см. contract-document-data.ts).
export function formatRublesDigits(rubles: number): string {
  return rubles.toLocaleString('ru-RU', { maximumFractionDigits: 0 });
}

// Decimal(12,2) -> целые рубли + копейки как двузначная строка. Prisma.Decimal не
// склонен к бинарным ошибкам округления float, но toDecimalPlaces(2) на всякий случай
// нормализует значение перед разбиением на разряды.
export function splitRublesAndKopecks(value: Prisma.Decimal): { rubles: number; kopecksText: string } {
  const normalized = value.toDecimalPlaces(2);
  const rubles = Math.trunc(normalized.toNumber());
  const kopecks = Math.round((normalized.toNumber() - rubles) * 100);
  return { rubles, kopecksText: String(kopecks).padStart(2, '0') };
}
