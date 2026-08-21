import { ref } from 'vue'
import { fetchCurrentUser, type SessionUser } from './auth-api'

// Модульный singleton вместо стора — состояние одно на всё приложение,
// а полноценный Pinia под единственный кусок state было бы избыточно.
export const currentUser = ref<SessionUser | null>(null)
export const isAuthLoading = ref(true)

let loadPromise: Promise<void> | null = null

// Единая точка входа: и App.vue (перед первым рендером), и router-guard (перед первой
// навигацией) должны дождаться ОДНОГО и того же запроса, а не гонять fetchCurrentUser
// дважды — иначе на холодной загрузке guard успевает решить по ролям ДО того, как
// currentUser вообще загружен (currentUser===null трактовался бы как "ролей нет",
// хотя на деле мы просто ещё не спросили).
export function ensureUserLoaded(): Promise<void> {
  if (!loadPromise) {
    loadPromise = (async () => {
      isAuthLoading.value = true
      try {
        currentUser.value = await fetchCurrentUser()
      } finally {
        isAuthLoading.value = false
      }
    })()
  }
  return loadPromise
}

// loadCurrentUser — принудительный перезапрос (например после логина/логаута), в
// отличие от ensureUserLoaded, который переиспользует уже идущий/завершённый запрос.
export async function loadCurrentUser(): Promise<void> {
  loadPromise = null
  await ensureUserLoaded()
}
