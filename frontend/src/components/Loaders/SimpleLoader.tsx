import React from "react"
import { Icon } from "../Icon/Icon"
import { twMerge } from "tailwind-merge"

const SimpleLoader = ({ className }: { className?: string }) => {
  return (
    <Icon
      className={twMerge("shrink-0 animate-spin", className)}
      icon={"SvgLoader"}
    />
  )
}

export default SimpleLoader
