<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import intlTelInput, { NUMBER_FORMAT, type Iti } from 'intl-tel-input'
import 'intl-tel-input/styles'
import { PhoneNumberUtil } from 'google-libphonenumber'

const props = defineProps<{ placeholder?: string }>()
// Храним не сырой текст поля, а нормализованный номер (getNumber) — при
// separateDialCode код страны показывается отдельно от инпута, поэтому raw
// input.value самого "+7" не содержит, а в БД должен уйти номер целиком.
const model = defineModel<string>({ default: '' })

const wrapperRef = ref<HTMLElement | null>(null)
const inputRef = ref<HTMLInputElement | null>(null)
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
function checkValidity(): boolean {
  if (!iti || !inputRef.value?.value.trim()) return true
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

// focusout на всём виджете (а не blur на самом инпуте) — клик по кнопке флага/списку
// стран сам по себе снимает фокус с инпута, и на голом blur ошибка выскакивала прямо
// в момент выбора страны, а не когда пользователь реально закончил с полем. relatedTarget
// внутри враппера (флаг, поиск по странам, сам список) — это ещё не уход с поля.
function onWrapperFocusOut(event: FocusEvent) {
  const next = event.relatedTarget as Node | null
  if (wrapperRef.value && next && wrapperRef.value.contains(next)) return
  touched.value = true
  isValid.value = checkValidity()
}

onMounted(() => {
  if (!inputRef.value) return
  iti = intlTelInput(inputRef.value, {
    initialCountry: 'ru',
    separateDialCode: true,
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
  <div ref="wrapperRef" class="phone-input" @focusout="onWrapperFocusOut">
    <input
      ref="inputRef"
      type="tel"
      :placeholder="props.placeholder"
      autocomplete="off"
      :class="[
        'flex h-10 w-full rounded-md border bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
        touched && !isValid ? 'border-red-500 focus-visible:ring-red-500' : 'border-input focus-visible:ring-ring',
      ]"
      @input="onInput"
    />
    <p v-if="touched && !isValid" class="mt-1 text-sm text-red-500">Похоже, номер телефона неполный или некорректный</p>
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
