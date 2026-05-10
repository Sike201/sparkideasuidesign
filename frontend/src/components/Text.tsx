import { twMerge } from "tailwind-merge"

type Props = {
  text?: string | number
  isLoading?: boolean
  as?: "span" | "h1" | "h2" | "h3" | "p"
  className?: string
  loadingClass?: string
  fallback?: string
}

const skeleton = {
  h1: { class: "h-12 min-w-[280px]" },
  h2: { class: "h-11 min-w-[120px]" },
  h3: { class: "h-10 min-w-[60px]" },
  span: { class: "h-6 my-1 my-[1px] min-w-[40px]" },
  p: { class: "h-4 min-w-[40px]" },
}

type TextSkeletonLoaderProps = { className?: string }

const TextSkeletonLoader = ({ className }: TextSkeletonLoaderProps) => {
  return (
    <div
      className={twMerge("h-full w-full max-w-[120px] overflow-hidden rounded-2xl bg-white/20 opacity-50", className)}
    >
      <div
        className={twMerge(
          "h-full w-full animate-slide-skeleton bg-gradient-to-r from-white/0 via-white/40 to-white/0",
        )}
      ></div>
    </div>
  )
}

const Text = ({ text, isLoading, as = "span", className, fallback, loadingClass }: Props) => {
  if (isLoading) return <TextSkeletonLoader className={twMerge(skeleton[as].class, className, loadingClass)} />
  const Component = as
  return <Component className={className}>{text || fallback || "TBD"}</Component>
}

export default Text
