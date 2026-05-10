import { useEffect, useState } from "react"
import { twMerge } from "tailwind-merge"
import fallbackImg from "../../assets/fallback1.png"

type ImgSizes = "4" | "5" | "6" | "8" | "10" | "20" | "custom"

type Props = {
  src: string | undefined
  size?: ImgSizes
  customClass?: string
  showFallback?: boolean
  isFetchingLink?: boolean
  imgClassName?: string
  role?: string
  alt?: string
  isRounded?: boolean
}

const avatarSize: Record<ImgSizes, string> = {
  "4": "size-4",
  "5": "size-5",
  "6": "size-6",
  "8": "size-8",
  "10": "size-10",
  "20": "size-20",
  custom: "",
}

const ImgSkeletonLoader = ({ isRounded }: { isRounded: boolean }) => {
  return (
    <div
      className={twMerge(
        "h-full w-full shrink-0 animate-pulse overflow-hidden bg-white/10",
        isRounded && "rounded-full",
      )}
    >
      <div className="h-full w-full animate-slide-skeleton bg-gradient-to-r from-white/0 via-white/40 to-white/0"></div>
    </div>
  )
}

const Img = ({
  alt,
  src,
  customClass,
  imgClassName,
  size = "custom",
  showFallback = true,
  role = "presentation",
  isFetchingLink = false,
  isRounded = false,
}: Props) => {
  const [isLoadingImg, setIsLoadingImg] = useState(true)
  const [renderFallback, setRenderFallback] = useState(false)

  const onError = () => {
    setRenderFallback(true)
    setIsLoadingImg(false)
  }

  useEffect(() => {
    if (src) setRenderFallback(false)
  }, [src])

  if (!src && !showFallback) return null

  const renderImage = !isLoadingImg && !isFetchingLink

  const crossOrigin = src?.startsWith("https://drive.google.com") ? "anonymous" : undefined

  return (
    <div
      className={twMerge(
        "shrink-0 overflow-hidden",
        isLoadingImg && "bg-white/20",
        isRounded && "rounded-full",
        avatarSize[size],
        customClass,
      )}
    >
      {(isLoadingImg || isFetchingLink) && <ImgSkeletonLoader isRounded={isRounded} />}
      <img
        alt={alt}
        role={role}
        src={!renderFallback ? src : fallbackImg}
        onLoad={() => setIsLoadingImg(false)}
        crossOrigin={crossOrigin}
        onError={onError}
        className={twMerge("h-full w-full object-cover", !renderImage ? "hidden" : "", avatarSize[size], imgClassName)}
      />
    </div>
  )
}

export default Img
