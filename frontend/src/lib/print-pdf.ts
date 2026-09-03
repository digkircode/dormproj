// Печать PDF "как будто нажал Ctrl+P" — грузим blob в скрытый iframe и сами вызываем
// window.print() на нём, как только PDF отрисовался, вместо открытия отдельной вкладки,
// где пользователю пришлось бы жать Ctrl+P самому (по прямой просьбе, доп. к обычному
// скачиванию .docx/печати ZIP — не замена, см. downloadContractDocument/printContractsBatch
// в contracts-api.ts).
//
// iframe не display:none — в части браузеров скрытый через display:none iframe не
// печатает вообще (известная особенность, не баг в этом коде) — вместо этого уводим его
// за пределы экрана 1x1px, оставляя реально отрендеренным.
const PRINT_IFRAME_CLEANUP_MS = 60_000;

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

  await new Promise<void>((resolve, reject) => {
    iframe.onload = () => resolve()
    iframe.onerror = () => reject(new Error('Не удалось загрузить PDF для печати'))
    document.body.appendChild(iframe)
  })

  const win = iframe.contentWindow
  if (!win) throw new Error('Не удалось открыть окно печати')
  win.focus()
  win.print()

  // Ни один браузер не даёт события "диалог печати закрыт" — убираем iframe/blob-URL
  // отложенно, с запасом на то, что пользователь ещё разглядывает предпросмотр.
  setTimeout(() => {
    iframe.remove()
    URL.revokeObjectURL(url)
  }, PRINT_IFRAME_CLEANUP_MS)
}
