// Печать PDF "как будто нажал Ctrl+P" — грузим blob в скрытый iframe и сами вызываем
// window.print() на нём, как только PDF отрисовался, вместо открытия отдельной вкладки,
// где пользователю пришлось бы жать Ctrl+P самому (по прямой просьбе, доп. к обычному
// скачиванию .docx/печати ZIP — не замена, см. downloadContractDocument/printContractsBatch
// в contracts-api.ts).
//
// iframe не display:none — в части браузеров скрытый через display:none iframe не
// печатает вообще (известная особенность, не баг в этом коде) — вместо этого уводим его
// за пределы экрана 1x1px, оставляя реально отрендеренным.
import { i18n } from '@/i18n'

const PRINT_IFRAME_CLEANUP_MS = 60_000;
const PRINT_IFRAME_LOAD_TIMEOUT_MS = 30_000;

export async function printPdfBlob(blob: Blob): Promise<void> {
  const url = URL.createObjectURL(blob)
  const iframe = document.createElement('iframe')
  iframe.style.position = 'fixed'
  iframe.style.right = '0'
  iframe.style.bottom = '0'
  iframe.style.width = '1px'
  iframe.style.height = '1px'
  iframe.style.border = '0'
  iframe.style.opacity = '0'
  iframe.src = url

  const cleanup = () => {
    iframe.onload = null
    iframe.onerror = null
    iframe.remove()
    URL.revokeObjectURL(url)
  }

  let printed = false
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(i18n.global.t('errors.printPdfLoadFailed'))), PRINT_IFRAME_LOAD_TIMEOUT_MS)
      iframe.onload = () => { clearTimeout(timer); resolve() }
      iframe.onerror = () => { clearTimeout(timer); reject(new Error(i18n.global.t('errors.printPdfLoadFailed'))) }
      document.body.appendChild(iframe)
    })

    const win = iframe.contentWindow
    if (!win) throw new Error(i18n.global.t('errors.printWindowFailed'))
    win.focus()
    win.print()
    printed = true
  } finally {
    // No browser exposes a reliable "print dialog closed" event. Keep a successful
    // preview briefly; on failure release the iframe and Blob URL immediately.
    if (printed) setTimeout(cleanup, PRINT_IFRAME_CLEANUP_MS)
    else cleanup()
  }
}
