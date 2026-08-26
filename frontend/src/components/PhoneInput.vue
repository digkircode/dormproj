<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import intlTelInput, { NUMBER_FORMAT, type Iti } from 'intl-tel-input'
import 'intl-tel-input/styles'
import { PhoneNumberUtil } from 'google-libphonenumber'

// Локаль ru/en у intl-tel-input поставляется только с типами общего "бандла" (все языки
// сразу), не конкретного файла — импорт default оттуда не совпадает с рантаймом
// (несоответствие в типах пакета). Проще и надёжнее взять реально нужные строки вручную.
// Виджет инициализируется один раз в onMounted (см. ниже) под язык, актуальный на момент
// открытия диалога — переключение языка интерфейса, пока диалог уже открыт, не
// переинициализирует сам виджет (сознательно, без watch/remount): PhoneInput живёт внутри
// модалки, а повторная инициализация intl-tel-input поверх портала Dialog — ровно тот
// класс хрупкости с фокус-трапом/pointer-events, что уже задокументирован в промпте
// проекта как известная ловушка, рисковать им ради секундного окна на лету не стали.
const UI_TRANSLATIONS = {
  ru: {
    selectedCountryAriaLabel: 'Изменить страну для номера телефона',
    noCountrySelected: 'Выберите страну для номера телефона',
    countryListAriaLabel: 'Список стран',
    searchPlaceholder: 'Поиск',
    clearSearchAriaLabel: 'Очистить поиск',
  },
  en: {
    selectedCountryAriaLabel: 'Change phone number country',
    noCountrySelected: 'Select a country for the phone number',
    countryListAriaLabel: 'Country list',
    searchPlaceholder: 'Search',
    clearSearchAriaLabel: 'Clear search',
  },
}

const props = defineProps<{ placeholder?: string; required?: boolean }>()
// Храним не сырой текст поля, а нормализованный номер (getNumber) — при
// separateDialCode код страны показывается отдельно от инпута, поэтому raw
// input.value самого "+7" не содержит, а в БД должен уйти номер целиком.
const model = defineModel<string>({ default: '' })

const { locale } = useI18n()
const inputRef = ref<HTMLInputElement | null>(null)
// Ошибка показывается только по явному validate() (родитель вызывает его при нажатии
// "Сохранить"), не на blur — поле обязательно только для части договоров (несовершеннолетний),
// и мешать бы мигало ошибкой ещё до того, как стало понятно, что оно вообще нужно.
const touched = ref(false)
const isValid = ref(true)
let iti: Iti | null = null
const phoneUtil = PhoneNumberUtil.getInstance()

function syncModelFromInput() {
  if (!iti) return
  model.value = iti.getNumber(NUMBER_FORMAT.INTERNATIONAL) || inputRef.value?.value.trim() || ''
}

// Валидность — через google-libphonenumber (не через встроенный в intl-tel-input
// isValidNumber): парсим E164-представление и проверяем его же валидатором Google.
// Пустое поле — валидно, если только оно не required (тогда пустота сама по себе ошибка).
function checkValidity(): boolean {
  if (!iti || !inputRef.value?.value.trim()) return !props.required
  const e164 = iti.getNumber(NUMBER_FORMAT.E164)
  if (!e164) return false
  try {
    return phoneUtil.isValidNumber(phoneUtil.parse(e164))
  } catch {
    return false
  }
}

function onInput() {
  syncModelFromInput()
  if (touched.value) isValid.value = checkValidity()
}

// Вызывается родителем при попытке сохранить форму.
function validate(): boolean {
  touched.value = true
  isValid.value = checkValidity()
  return isValid.value
}
defineExpose({ validate })

onMounted(() => {
  if (!inputRef.value) return
  iti = intlTelInput(inputRef.value, {
    initialCountry: 'ru',
    separateDialCode: true,
    countryNameLocale: locale.value,
    uiTranslations: UI_TRANSLATIONS[locale.value as 'ru' | 'en'] ?? UI_TRANSLATIONS.ru,
    // Без dropdownParent — список стран остаётся внутри .iti (внутри модалки).
    // Вынос в document.body ломает выбор страны: фокус-трап/pointer-events Dialog
    // (см. известную ловушку с вложенными Reka-порталами в промпте проекта) блокирует
    // клики по элементам, оказавшимся вне DOM самого диалога.
    loadUtils: () => import('intl-tel-input/utils'),
  })
  if (model.value) iti.setNumber(model.value)
})

onBeforeUnmount(() => {
  iti?.destroy()
})
</script>

<template>
  <div class="phone-input">
    <input
      ref="inputRef"
      type="tel"
      :placeholder="props.placeholder"
      autocomplete="off"
      :class="[
        'flex h-10 w-full rounded-md border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground transition-shadow focus-visible:outline-none focus-visible:ring-4 focus-visible:shadow-sm disabled:cursor-not-allowed disabled:opacity-50',
        touched && !isValid
          ? 'border-red-500 focus-visible:border-red-500/50 focus-visible:ring-red-500/20'
          : 'border-input focus-visible:border-ring/50 focus-visible:ring-ring/20',
      ]"
      @input="onInput"
    />
  </div>
</template>

<style>
/* Глобально (не scoped) — intl-tel-input оборачивает наш <input> собственным DOM
   вне рендера Vue (.iti, .iti__country-container и т.д.), scoped-атрибут туда не
   попадёт. Namespace через .phone-input, чтобы не задеть другие места на странице. */
.phone-input .iti {
  display: block;
  width: 100%;
  --iti-country-selector-bg: transparent;
  --iti-hover-color: var(--accent);
  --iti-icon-color: var(--muted-foreground);
  --iti-border-color: var(--border);
}
.phone-input .iti__selected-country-primary:hover,
.phone-input .iti__selected-country[aria-expanded='true'] .iti__selected-country-primary {
  background-color: var(--accent);
  border-radius: calc(var(--radius-md) - 2px) 0 0 calc(var(--radius-md) - 2px);
}
.phone-input .iti__selected-dial-code {
  color: var(--foreground);
}
.phone-input .iti__country-list {
  background: var(--popover);
  color: var(--popover-foreground);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);
  margin-top: 4px;
  font-size: 0.875rem;
  z-index: 20;
}
.phone-input .iti__country:hover,
.phone-input .iti__country.iti__highlight {
  background-color: var(--accent);
  color: var(--accent-foreground);
}
.phone-input .iti__search-input {
  background: var(--background);
  color: var(--foreground);
  border-bottom: 1px solid var(--border);
}
</style>
