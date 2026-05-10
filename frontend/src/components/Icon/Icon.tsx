import * as Icons from "./Svg"
import { SVGProps } from "react"
import { twMerge as classNames } from "tailwind-merge"

export type AvailableIcons = keyof typeof Icons

type IconProps = {
  icon: AvailableIcons
} & SVGProps<SVGSVGElement>

export const Icon = ({ icon, ...props }: IconProps) => {
  const Component = Icons[icon]

  return (
    <Component
      fill={"currentColor"}
      stroke={"currentColor"}
      strokeWidth={"0"}
      {...props}
      className={classNames("flex h-[1em] w-[1em]", props.className)}
    />
  )
}
