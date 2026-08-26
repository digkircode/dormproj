<script setup lang="ts">
import { computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Globe, ChevronDown } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { AppLocale } from '@/i18n'
import { LOCALE_STORAGE_KEY } from '@/i18n'

// Названия языков в списке — всегда на самих себе ("Русский"/"English"), не переводятся
// вместе с остальным интерфейсом: стандартный паттерн для переключателя языка, человек,
// не читающий текущий язык интерфейса, должен всё равно узнать свой в списке.
const localeOptions: { value: AppLocale; label: string }[] = [
  { value: 'ru', label: 'Русский' },
  { value: 'en', label: 'English' },
]
const { t, locale } = useI18n()
const localeLabel = computed(() => localeOptions.find((o) => o.value === locale.value)?.label ?? '')

// Accept-Language на бэкенд читается напрямую из localStorage (см. api-base.ts) — не из
// реактивного locale, поэтому смена языка сохраняется сразу, до следующего запроса.
watch(locale, (value) => {
  try {
    localStorage.setItem(LOCALE_STORAGE_KEY, value)
  } catch {
    // localStorage может быть недоступен (приватный режим и т.п.) — выбор просто не переживёт перезагрузку
  }
  document.documentElement.lang = value
}, { immediate: true })

// Пути и брендовые цвета — из simple-icons (VK 0077FF, Telegram 26A5E4). У себя
// используем цвет из TeamSwitcher.vue (тот же логотип RosNOU в сайдбаре).
const socialLinks = [
  {
    href: 'https://vk.ru/rosnou',
    label: 'VK',
    hoverColor: '#0077FF',
    path: 'm9.489.004.729-.003h3.564l.73.003.914.01.433.007.418.011.403.014.388.016.374.021.36.025.345.03.333.033c1.74.196 2.933.616 3.833 1.516.9.9 1.32 2.092 1.516 3.833l.034.333.029.346.025.36.02.373.025.588.012.41.013.644.009.915.004.98-.001 3.313-.003.73-.01.914-.007.433-.011.418-.014.403-.016.388-.021.374-.025.36-.03.345-.033.333c-.196 1.74-.616 2.933-1.516 3.833-.9.9-2.092 1.32-3.833 1.516l-.333.034-.346.029-.36.025-.373.02-.588.025-.41.012-.644.013-.915.009-.98.004-3.313-.001-.73-.003-.914-.01-.433-.007-.418-.011-.403-.014-.388-.016-.374-.021-.36-.025-.345-.03-.333-.033c-1.74-.196-2.933-.616-3.833-1.516-.9-.9-1.32-2.092-1.516-3.833l-.034-.333-.029-.346-.025-.36-.02-.373-.025-.588-.012-.41-.013-.644-.009-.915-.004-.98.001-3.313.003-.73.01-.914.007-.433.011-.418.014-.403.016-.388.021-.374.025-.36.03-.345.033-.333c.196-1.74.616-2.933 1.516-3.833.9-.9 2.092-1.32 3.833-1.516l.333-.034.346-.029.36-.025.373-.02.588-.025.41-.012.644-.013.915-.009ZM6.79 7.3H4.05c.13 6.24 3.25 9.99 8.72 9.99h.31v-3.57c2.01.2 3.53 1.67 4.14 3.57h2.84c-.78-2.84-2.83-4.41-4.11-5.01 1.28-.74 3.08-2.54 3.51-4.98h-2.58c-.56 1.98-2.22 3.78-3.8 3.95V7.3H10.5v6.92c-1.6-.4-3.62-2.34-3.71-6.92Z',
  },
  {
    href: 'https://t.me/rosnou',
    label: 'Telegram',
    hoverColor: '#26A5E4',
    path: 'M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z',
  },
]
</script>

<template>
  <footer class="flex flex-col gap-3 border-t bg-card px-4 py-3 sm:flex-row sm:items-center sm:justify-between md:px-6">
    <div class="flex flex-wrap items-center gap-3">
      <span class="text-xs text-muted-foreground">{{ t('footer.copyright') }}</span>
    </div>

    <div class="flex items-center gap-3">
      <DropdownMenu>
        <DropdownMenuTrigger as-child>
          <Button variant="outline" size="sm" class="w-36 justify-start">
            <Globe class="text-primary" />
            <span class="flex-1 text-left">{{ localeLabel }}</span>
            <ChevronDown />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuRadioGroup :model-value="locale" @update:model-value="(value) => (locale = value as AppLocale)">
            <DropdownMenuRadioItem v-for="option in localeOptions" :key="option.value" :value="option.value">
              {{ option.label }}
            </DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      <a
        v-for="social in socialLinks"
        :key="social.label"
        :href="social.href"
        target="_blank"
        rel="noopener"
        :aria-label="social.label"
        class="text-muted-foreground transition-colors"
        @mouseenter="($event.currentTarget as HTMLElement).style.color = social.hoverColor"
        @mouseleave="($event.currentTarget as HTMLElement).style.color = ''"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path :d="social.path" /></svg>
      </a>
      <a
        href="https://rosnou.ru/"
        target="_blank"
        rel="noopener"
        aria-label="RosNOU"
        class="text-muted-foreground transition-colors"
        @mouseenter="($event.currentTarget as HTMLElement).style.color = '#2699D4'"
        @mouseleave="($event.currentTarget as HTMLElement).style.color = ''"
      >
        <svg width="20" height="20" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path
            d="M11.4862 28.1964H16.2772H24.4827C25.8043 28.1964 27.082 28.0088 28.2935 27.6668C34.4503 25.9349 38.911 20.0993 38.5365 13.3149C38.129 5.80254 31.7629 0 24.2514 0H1.44141V8.06398V8.97959L8.09385 17.5951H20.5176L13.8652 8.97959H24.3835C26.9388 8.97959 29.1746 10.8108 29.5491 13.337C30.0007 16.492 27.5666 19.2168 24.4937 19.2168H21.7732H9.34944H1.44141V22.9233V28.1964V40H11.4862V28.1964Z"
            fill="currentColor"
          />
          <path d="M37.8206 40L29.9566 29.818H17.5328L25.3968 40H37.8206Z" fill="currentColor" />
        </svg>
      </a>
    </div>
  </footer>
</template>
