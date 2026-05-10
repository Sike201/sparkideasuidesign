import { HTMLProps } from "@/@types/general"
import { forwardRef, PropsWithChildren, ReactNode, useMemo } from "react"
import { twMerge as classNames } from "tailwind-merge"
import { AvailableIcons, Icon } from "../Icon/Icon"

export type ButtonColor =
  | "primary"
  | "secondary"
  | "tertiary"
  | "danger"
  | "plain"
export type ButtonSize = "xs" | "sm" | "md" | "lg" | "xl"
type ButtonSizeClassKey = "btnContainer" | "btnText"
type ButtonIconSizeClassKey = "btnContainer" | "iconContainer"

type ButtonProps<T extends keyof JSX.IntrinsicElements> = {
  border?: boolean
  color?: ButtonColor
  size?: ButtonSize
  btnText?: string
  prefixElement?: PropsWithChildren["children"]
  suffixElement?: PropsWithChildren["children"]
  isLoading?: boolean
  iconWrapperClassName?: string
  textClassName?: string
  as?: string
} & Omit<HTMLProps<T>, "size" | "color">

type IconButtonWithLabelProps = {
  icon: AvailableIcons
  iconWrapperClassName?: HTMLProps["className"]
} & ButtonProps<"button">

const BUTTON_COLOR_CLASS_NAMES: Record<ButtonColor, string> = {
  primary:
    "text-default bg-brand-primary active:bg-brand-secondary disabled:bg-opacity-50",
  secondary:
    "bg-default active:bg-secondary disabled:bg-opacity-50 text-fg-primary disabled:text-fg-primary/50 border-[1px] border-bd-primary hover:bg-default-hover",
  tertiary:
    "text-white bg-secondary active:bg-tertiary disabled:bg-secondary disabled:bg-opacity-50 text-fg-primary",
  danger:
    "text-gray-500 bg-fg-error-primary disabled:bg-fg-error-primary text-fg-alt-default",
  plain:
    "text-white bg-transparent text-fg-primary active:bg-secondary disabled:text-fg-primary/50",
}

const BUTTON_SIZE_CLASS_NAMES: Record<
  ButtonSize,
  Record<ButtonSizeClassKey, string>
> = {
  xs: { btnContainer: "rounded-lg py-1.5 px-3 text-sm", btnText: "px-1.5" },
  sm: { btnContainer: "rounded-lg py-2 px-3 text-sm", btnText: "px-2" },
  md: { btnContainer: "rounded-xl py-2.5 px-3 text-base", btnText: "px-2" },
  lg: { btnContainer: "rounded-xl py-3.5 px-4 text-base", btnText: "px-3" },
  xl: {
    btnContainer: "rounded-xl py-[18px] px-4 text-[18px] leading-[24px]",
    btnText: "px-3",
  },
}
const BUTTON_ICON_SIZE_CLASS_NAMES: Record<
  ButtonSize,
  Record<ButtonIconSizeClassKey, string>
> = {
  xs: {
    btnContainer: "rounded-lg p-1.5 text-[16px] leading-none",
    iconContainer: "h-5 w-5",
  },
  sm: {
    btnContainer: "rounded-lg p-2 text-[20px] leading-none",
    iconContainer: "h-5 w-5",
  },
  md: {
    btnContainer: "rounded-xl p-3 text-[24px] leading-none",
    iconContainer: "h-6 w-6",
  },
  lg: {
    btnContainer: "rounded-xl p-3.5 text-[28px] leading-none",
    iconContainer: "h-7 w-7",
  },
  xl: {
    btnContainer: "rounded-xl p-[18px] text-[28px] leading-none",
    iconContainer: "h-7 w-7",
  },
}

const ButtonRoot = forwardRef<HTMLButtonElement, ButtonProps<"button">>(
  (
    {
      color = "primary",
      size = "md",
      prefixElement,
      suffixElement,
      children,
      isLoading,
      textClassName,
      btnText,
      as,
      ...props
    },
    ref,
  ) => {
    const isDisabled = props.disabled || isLoading
    const prefixElementOrLoader = useMemo<ReactNode>(() => {
      if (isLoading)
        return <Icon className={"animate-spin"} icon={"SvgLoader"} />
      return prefixElement
    }, [isLoading, prefixElement])

    const btnContainerClasses = classNames([
      "relative flex items-center justify-center font-medium transition-opacity cursor-pointer-link",
      "hover:opacity-85 active:scale-[98%]",
      "focus-visible:outline-offset-2 focus-visible:outline-2 focus-visible:outline-black",
      "disabled:cursor-not-allowed disabled:bg-opacity-50",
      BUTTON_SIZE_CLASS_NAMES[size].btnContainer,
      BUTTON_COLOR_CLASS_NAMES[color],
      props.className,
    ])

    const btnTextClassName = classNames([
      "truncate",
      BUTTON_SIZE_CLASS_NAMES[size].btnText,
      textClassName,
    ])

    const Tag = (as ?? "button") as unknown as "button"

    return (
      <Tag
        type={props.type || "button"}
        {...props}
        disabled={isDisabled}
        className={btnContainerClasses}
        ref={ref}
      >
        {prefixElementOrLoader}
        {btnText ? (
          <span className={btnTextClassName}>{btnText}</span>
        ) : (
          children
        )}
        {suffixElement}
      </Tag>
    )
  },
)
ButtonRoot.displayName = "ButtonRoot"

const IconButton = forwardRef<HTMLButtonElement, IconButtonWithLabelProps>(
  (
    { icon, color = "primary", iconWrapperClassName, size = "md", ...props },
    ref,
  ) => {
    return (
      <Button
        {...props}
        color={color}
        size={size}
        className={classNames(
          "",
          BUTTON_ICON_SIZE_CLASS_NAMES[size].btnContainer,
          BUTTON_COLOR_CLASS_NAMES[color],
          props.className,
        )}
        ref={ref}
      >
        <div
          className={classNames(
            "flex items-center justify-center border-none bg-transparent",
            BUTTON_ICON_SIZE_CLASS_NAMES[size].iconContainer,
            iconWrapperClassName,
          )}
        >
          <Icon icon={icon} />
        </div>
      </Button>
    )
  },
)
IconButton.displayName = "IconButton"

export const Button = Object.assign(ButtonRoot, {
  Icon: IconButton,
})
