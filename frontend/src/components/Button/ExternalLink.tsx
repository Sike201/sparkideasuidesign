import { twMerge } from "tailwind-merge"
import { AvailableIcons, Icon } from "../Icon/Icon"

type Props = {
  externalLink: ExternalLinkType
  className?: string
  iconClassName?: string
  textClassName?: string
}
export type ExternalLinkType = {
  url: string
  iconType: IconLinkType
  label?: string
}
export const ALL_ICON_LINK_TYPES = [
  "MEDIUM",
  "LINKED_IN",
  "WEB",
  "X_TWITTER",
  "OUTER_LINK",
  "TELEGRAM",
  "NO_ICON",
  "DISCORD",
] as const
export type IconLinkType = (typeof ALL_ICON_LINK_TYPES)[number]

export const externalLinkObj: Record<Exclude<IconLinkType, "NO_ICON">, { icon: AvailableIcons; label: string }> = {
  MEDIUM: { icon: "SvgMedium", label: "Medium" },
  LINKED_IN: { icon: "SvgLinkedin", label: "LinkedIn" },
  WEB: { icon: "SvgWeb", label: "Web Url" },
  X_TWITTER: { icon: "SvgTwitter", label: "X (ex Twitter)" },
  TELEGRAM: { icon: "SvgTelegram", label: "Telegram" },
  DISCORD: { icon: "SvgDiscord", label: "Discord" },
  OUTER_LINK: { icon: "SvgExternalLink", label: "External Link" },
}

const ExternalLinkWithLabel = ({ externalLink, className, iconClassName, textClassName }: Props) => {
  return (
    <a
      href={externalLink.url}
      target={"_blank"}
      rel="noreferrer"
      className={twMerge(
        "flex items-center gap-2 rounded-full border-[1px] border-bd-primary px-2 py-1.5 hover:bg-bd-primary/40 active:scale-[98%]",
        className,
      )}
    >
      {externalLink.iconType !== "NO_ICON" && (
        <Icon
          icon={externalLinkObj[externalLink.iconType].icon}
          className={twMerge("text-xl leading-none", iconClassName)}
        />
      )}
      <span className={twMerge("text-nowrap text-sm", textClassName)}>{externalLink?.label}</span>
    </a>
  )
}
const ExternalLinkIcon = ({
  externalLink,
  className,
  iconClassName,
}: Props) => {
  return (
    <a
      href={externalLink.url}
      target="_blank"
      rel="noreferrer"
      className={twMerge(
        "flex h-9 w-9 items-center justify-center rounded-full border-[1px] border-bd-primary p-1 px-[7px] hover:bg-bd-primary/40 active:scale-[98%]",
        className,
      )}
    >
      {externalLink.iconType !== "NO_ICON" && (
        <Icon
          icon={externalLinkObj[externalLink.iconType].icon}
          className={twMerge("leading-none", iconClassName)}
        />
      )}
    </a>
  )
}
const ExternalLinkIcon2 = ({ externalLink, className, iconClassName }: Props) => {
  return (
    <a
      href={externalLink.url}
      target="_blank"
      rel="noreferrer"
      className={twMerge(
        "flex items-center justify-center rounded-lg bg-secondary p-2 px-[7px] text-xl hover:bg-bd-primary/40 active:scale-[98%]",
        className,
      )}
    >
      {externalLink.iconType !== "NO_ICON" && (
        <Icon icon={externalLinkObj[externalLink.iconType].icon} className={twMerge("leading-none", iconClassName)} />
      )}
    </a>
  )
}

export const ExternalLink = Object.assign(ExternalLinkWithLabel, {
  Icon: ExternalLinkIcon,
  Icon2: ExternalLinkIcon2,
})
