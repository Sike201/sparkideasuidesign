import React from "react"
import { Icon } from "./Icon/Icon"

const Logo = () => {
  return (
    <div className="flex items-center gap-1 py-2">
      {/* <div className="h-[19px] w-[19px] rounded-full bg-brand-primary" /> */}
      <Icon
        icon="SvgLogo"
        className="-mt-[7px] h-[24px] w-[30px] text-[24px]"
      />
      <span className="font-sulphur-point text-[26px] leading-[28px] text-fg-primary">
        BorgPad
      </span>
    </div>
  )
}

export default Logo
