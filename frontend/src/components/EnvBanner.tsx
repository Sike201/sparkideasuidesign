import React from "react"
import { twMerge } from "tailwind-merge"

const EnvBanner = () => {
  const isLocalhost = window.location.href.slice(0, 16) === "http://localhost"

  if (import.meta.env.VITE_ENVIRONMENT_TYPE === "develop")
    return (
      <>
        <div
          className={twMerge(
            "fixed left-[-100px] top-10 z-[100] flex w-[320px] rotate-[-45deg] justify-center border-2 border-l-0 border-black  py-2",
            isLocalhost ? "bg-brand-primary" : "bg-orange-400",
          )}
        >
          <span className="text-black">{isLocalhost ? "localhost" : "STAGE"}</span>
        </div>
      </>
    )
  return <></>
}

export default EnvBanner
