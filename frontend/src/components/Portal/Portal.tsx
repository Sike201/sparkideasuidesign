// This implementation is found at https://www.joshwcomeau.com/snippets/react-components/in-portal/
import { ReactNode, useLayoutEffect, useState } from "react"
import { createPortal } from "react-dom"

type Props = {
  children: ReactNode
  id: string
}

export function Portal({ id, children }: Props) {
  const [hasMounted, setHasMounted] = useState(false)
  useLayoutEffect(() => {
    setHasMounted(true)
  }, [])
  if (!hasMounted) {
    return null
  }
  return createPortal(children, document.querySelector(`#${id}`) as Element)
}
