import { AvailableIcons, Icon } from "@/components/Icon/Icon"
import { useState } from "react"
import { twMerge } from "tailwind-merge"

type DropdownMenuButtonProps = {
  icon: AvailableIcons
  tooltipText: string
  onClick?: () => void
  iconClass?: string
}
const DropdownMenuButton = ({ icon, onClick, tooltipText, iconClass }: DropdownMenuButtonProps) => {
  const [isTooltipVisible, setIsTooltipVisible] = useState(false)

  const classes = twMerge(
    "relative",
    "flex items-center h-[32px] w-[32px] p-2",
    "rounded-lg border border-bd-primary",
    "bg-default hover:bg-secondary",
    "cursor-pointer select-none",
  )

  const tooltipClasses = twMerge(isTooltipVisible && "animate-fade-in")
  return (
    <div
      onMouseEnter={() => setIsTooltipVisible(true)}
      onMouseLeave={() => setIsTooltipVisible(false)}
      className={classes}
      onClick={onClick}
    >
      <Icon icon={icon} className={iconClass} />
      {isTooltipVisible && <Tooltip className={tooltipClasses} text={tooltipText} />}
    </div>
  )
}

export default DropdownMenuButton

type TooltipProps = {
  className: string
  text: string
}
const Tooltip = ({ className, text }: TooltipProps) => {
  const classes = twMerge(
    "absolute top-9 -right-0 px-2 py-1",
    "bg-black border border-bd-secondary",
    "whitespace-nowrap text-fg-primary",
    "rounded-lg",
    "z-10",
    className,
  )
  return <div className={classes}>{text}</div>
}
