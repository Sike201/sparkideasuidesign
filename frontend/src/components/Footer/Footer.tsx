import React from "react"
import Logo from "../Logo"
import { Link } from "react-router-dom"
import { ExternalLink } from "../Button/ExternalLink"
import { Button } from "../Button/Button"
import { useTranslation } from "react-i18next"
import { twMerge } from "tailwind-merge"

type Props = {
  showBackground?: boolean
}

const Footer = ({ showBackground = true }: Props) => {
  const { t } = useTranslation()
  return (
    <footer
      className={twMerge(
        "relative flex h-[300px] w-full flex-col items-center justify-center overflow-hidden border-t border-t-bd-primary bg-accent",
        !showBackground && "border-none",
      )}
    >
      {/* {showBackground && (
        <div className="max-w-screen absolute bottom-0 left-0 -z-[0] w-full rotate-180 overflow-hidden">
          <img src={backdropImg} className="h-[740px] min-w-[1440px] lg:h-auto lg:w-screen" />
        </div>
      )} */}
      <div className="z-[0] flex flex-col items-center justify-center gap-6">
        <div className="flex flex-col items-center gap-2">
          <Logo />
          <span className="text-sm">© 2024</span>
        </div>
        <div className={twMerge("flex flex-col items-center gap-0 text-sm md:flex-row md:gap-2 lg:gap-5")}>
          <a href="https://justspark.notion.site/SPARK-PROTOCOL-TERMS-OF-USE-32541bf35b7780c697c2f28fa430b615" target="_blank" rel="noopener noreferrer">
            <Button color="plain" btnText={t("terms_of_use")} className="py-1 text-sm font-normal" />
          </a>
          <div className="hidden h-5 border-l-[1px] border-l-fg-primary/50 md:block"></div>
          <Link to="/terms-and-conditions">
            <Button color="plain" btnText={t("terms_and_conditions")} className="py-1 text-sm font-normal" />
          </Link>
          <div className="hidden h-5 border-l-[1px] border-l-fg-primary/50 md:block"></div>
          <ExternalLink.Icon
            externalLink={{ iconType: "X_TWITTER", url: "https://x.com/JustSparkIdeas" }}
            className="mx-2 my-[4px] h-[1em] w-[1em] border-none p-0 text-3xl"
            iconClassName="text-xl"
          />
          <ExternalLink.Icon
            externalLink={{ iconType: "TELEGRAM", url: "https://t.me/sparkdotfun" }}
            className="mx-2 my-[4px] h-[1em] w-[1em] border-none p-0 text-3xl"
            iconClassName="text-xl"
          />
        </div>
      </div>
    </footer>
  )
}

export default Footer
