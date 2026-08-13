import {
  createTableHook,
  tableFeatures,
  columnVisibilityFeature,
  columnSizingFeature,
  columnResizingFeature,
  rowPaginationFeature,
  rowSortingFeature,
  createPaginatedRowModel,
  createSortedRowModel,
} from '@tanstack/vue-table'

// Общий набор фич для всех таблиц приложения — заводится один раз здесь,
// а не в каждой странице отдельно (см. skills/create-table-hook у @tanstack/vue-table).
const features = tableFeatures({
  columnVisibilityFeature,
  columnSizingFeature,
  columnResizingFeature,
  rowPaginationFeature,
  rowSortingFeature,
  paginatedRowModel: createPaginatedRowModel(),
  sortedRowModel: createSortedRowModel(),
})

export type AppFeatures = typeof features

const hook = createTableHook({ features })
export const useAppTable = hook.useAppTable
export const createAppColumnHelper = hook.createAppColumnHelper
