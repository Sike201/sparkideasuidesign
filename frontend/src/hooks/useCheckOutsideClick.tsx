import { RefObject, useEffect } from "react"

export function useCheckOutsideClick(
  node:
    | RefObject<HTMLDivElement>
    | RefObject<HTMLFormElement>
    | RefObject<HTMLElement>,
  onClickOutside: () => void,
  exclude?: RefObject<HTMLElement>[],
) {
  const helperFunc = (e: MouseEvent) => {
    if (node.current && !node.current?.contains(e.target as Element)) {
      if (!exclude) onClickOutside()

      const isAnyExceptionClicked = exclude?.some((exception) => {
        if (
          exception?.current &&
          exception.current.contains(e.target as Element)
        ) {
          return true
        }
      })
      if (isAnyExceptionClicked) {
        return
      } else {
        onClickOutside()
      }
    }
  }

  useEffect(() => {
    document.addEventListener("mousedown", helperFunc)

    return () => {
      document.removeEventListener("mousedown", helperFunc)
    }
  })
}
