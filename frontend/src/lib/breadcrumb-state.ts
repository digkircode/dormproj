import { ref } from 'vue'
import type { Router, RouteLocationNormalized } from 'vue-router'

export interface BreadcrumbCrumb {
  name: string
  title: string
  path: string
}

// Реальный пройденный путь пользователя, а не статичная иерархия роутов — если попали
// на страницу физлица кликом с карточки договора, крошки должны показать "Договоры >
// Договор № X > Физлицо", а не "Физические лица > Физлицо" (статичный meta.parent того
// физлица). Обновляется в трекере ниже через router.afterEach.
export const breadcrumbTrail = ref<BreadcrumbCrumb[]>([])
// Детальные страницы переопределяют заголовок ПОСЛЕДНЕЙ крошки на что-то конкретное
// (номер договора, имя физлица) — на момент самой навигации (afterEach) meta.title ещё
// общий ("Информация о договоре"), т.к. данные страницы только начинают грузиться;
// страница выставляет точное значение сама, когда данные приходят (и сбрасывает в null
// при размонтировании — см. ContractDetail.vue/IndividualDetail.vue).
export const breadcrumbOverride = ref<string | null>(null)

function buildCrumb(to: RouteLocationNormalized): BreadcrumbCrumb {
  return { name: to.name as string, title: (to.meta.title as string) ?? '', path: to.fullPath }
}

// Полная статичная цепочка по meta.parent (см. router/index.ts) — запасной вариант для
// прямого захода/обновления страницы, когда реального пройденного пути ещё нет.
function buildStaticTrail(router: Router, to: RouteLocationNormalized): BreadcrumbCrumb[] {
  const trail: BreadcrumbCrumb[] = []
  let current = router.getRoutes().find((r) => r.name === to.name)
  while (current) {
    if (current.meta.title) {
      trail.unshift({
        name: current.name as string,
        title: current.meta.title as string,
        // У самой конечной (запрашиваемой) страницы — реальный resolved-путь с
        // подставленными параметрами, у промежуточных статичных родителей — их
        // собственный (всегда статичный в этом роутере, без :param) путь.
        path: current.name === to.name ? to.fullPath : current.path,
      })
    }
    const parentName = current.meta.parent as string | undefined
    current = parentName ? router.getRoutes().find((r) => r.name === parentName) : undefined
  }
  if (to.name !== 'home') trail.unshift({ name: 'home', title: 'Главная', path: '/' })
  return trail
}

// Вызывается один раз при создании роутера (см. router/index.ts).
export function trackBreadcrumbs(router: Router) {
  router.afterEach((to) => {
    if (!to.name) return
    breadcrumbOverride.value = null

    // Уже есть в текущем хвосте — кликнули по самой крошке или это обычная навигация
    // назад/вперёд внутри уже пройденного пути. Обрезаем до этой точки вместо того чтобы
    // задублировать её в конце.
    const existingIndex = breadcrumbTrail.value.findIndex((c) => c.name === to.name)
    if (existingIndex !== -1) {
      breadcrumbTrail.value = breadcrumbTrail.value.slice(0, existingIndex + 1)
      breadcrumbTrail.value[existingIndex] = buildCrumb(to)
      return
    }

    // Корневая страница (список из сайдбара, без meta.parent) — начинаем путь заново.
    // Так же — самый первый заход в приложение (пустой trail), даже если он сразу на
    // детальную страницу: реального пути ещё не было, статичная цепочка — единственный
    // осмысленный вариант.
    if (!to.meta.parent || breadcrumbTrail.value.length === 0) {
      breadcrumbTrail.value = buildStaticTrail(router, to)
      return
    }

    // Детальная страница, до которой реально дошли из чего-то другого (по ссылке в
    // контенте, не по объявленной в роутере иерархии предок/потомок) — просто
    // дописываем текущую страницу к уже пройденному пути, ничего не подставляя.
    breadcrumbTrail.value = [...breadcrumbTrail.value, buildCrumb(to)]
  })
}
