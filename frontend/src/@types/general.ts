export type HTMLProps<T extends keyof JSX.IntrinsicElements = "div"> =
  JSX.IntrinsicElements[T]
