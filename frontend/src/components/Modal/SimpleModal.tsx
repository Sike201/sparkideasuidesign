import { twMerge } from "tailwind-merge"
import { ReactNode, useCallback, useEffect, useRef } from "react"
import { Portal } from "@/components/Portal/Portal"
import { Button } from "../Button/Button"
import { useCheckOutsideClick } from "@/hooks/useCheckOutsideClick.tsx"

type Props = {
  children: ReactNode
  showCloseBtn?: boolean
  onClose?: () => void
  className?: string
  headerClass?: string
  title?: string
  actionButton?: {
    text: string
    onClick: () => void
  }
  isOpen?: boolean
}

export function SimpleModal({ 
  children, 
  showCloseBtn, 
  onClose, 
  className, 
  headerClass, 
  title,
  actionButton,
  isOpen = true
}: Props) {
  const modalRef = useRef<HTMLDivElement | null>(null)
  const backdropRef = useRef<HTMLDivElement | null>(null)

  const closeModalCallback = useCallback(() => {
    modalRef.current?.classList.add("animate-fade-out")
    backdropRef.current?.classList.add("animate-fade-out")
    setTimeout(() => {
      onClose?.()
    }, 300)
  }, [onClose])

  useCheckOutsideClick(modalRef, () => closeModalCallback())

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden" // disable document's scroll if modal is active
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeModalCallback()
      }
    }

    document.addEventListener("keydown", handleKeyDown)

    return () => {
      document.body.style.overflow = "" // restore document's scroll when modal is closed
      document.removeEventListener("keydown", handleKeyDown)
    }
  }, [closeModalCallback, isOpen])

  if (!isOpen) return null;

  return (
    <Portal id="simple-modal">
      {/* fixed backdrop */}
      <div ref={backdropRef} className="animate-opacity-in-fast fixed inset-0 z-20 bg-overlay bg-opacity-75 px-5"></div>

      {/* modal wrapper */}
      <div className="fixed inset-0 z-[30] flex h-screen w-screen items-center px-5 ">
        {/* modal */}
        <div
          ref={modalRef}
          className={twMerge(
            "mx-auto my-auto overflow-x-hidden overflow-y-scroll",
            "max-h-[95vh] w-[460px] max-w-[90vw]",
            "rounded-[10px] border border-solid border-bd-primary bg-secondary",
            "animate-fade-in-from-below",
            className,
          )}
        >
          <div
            className={twMerge(
              "sticky left-0 right-0 top-0 z-[31] flex w-full items-center justify-between bg-secondary/70 p-6 text-center backdrop-blur-sm",
              headerClass,
            )}
          >
            <div className="flex items-center gap-4">
              {onClose && showCloseBtn && <CloseButton onClose={closeModalCallback} />}
              {title && <h1 className="flex-1 text-body-xl-semibold text-white">{title}</h1>}
            </div>
            {actionButton && (
              <Button
                btnText={actionButton.text}
                color="plain"
                className="text-sm rounded-md text-white hover:bg-tertiary"
                onClick={actionButton.onClick}
              />
            )}
          </div>

          {children}
        </div>
      </div>
    </Portal>
  )
}

export function CloseButton({
  onClose,
  className = "",
}: {
  onClose?: () => void
  className?: string
}) {
  return (
    <Button.Icon
      icon="SvgClose"
      color="plain"
      className={twMerge(
        "w-[30px] rounded-md px-2 py-0.5 align-top text-2xl leading-none text-white hover:bg-tertiary",
        className,
      )}
      onClick={onClose}
    />
  )
}
