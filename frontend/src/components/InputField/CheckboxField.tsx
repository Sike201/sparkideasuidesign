import { HTMLProps } from "@/@types/general"
import { twMerge } from "tailwind-merge"
import { ReactNode } from "react"

type CheckboxProps = {
  label?: ReactNode
  containerClassName?: HTMLProps["className"]
  inputClassName?: HTMLProps["className"]
  value: boolean
  onChange: (value: boolean) => void
  error?: string
}

// eslint-disable-next-line react/display-name
const CheckboxField = ({
  label,
  containerClassName,
  inputClassName,
  error,
  value,
  onChange,
}: CheckboxProps) => {
  const onChangeHandler = (event: React.ChangeEvent<HTMLInputElement>) => {
    onChange(event.target.checked)
  }
  return (
    <div className={twMerge("flex items-start gap-2 py-2", containerClassName)}>
      <input
        checked={value}
        onChange={onChangeHandler}
        type="checkbox"
        className={twMerge(
          "dark:accent-dark-accent accent-light-dark h-5 w-5 shrink-0 cursor-pointer rounded-md p-2",
          inputClassName,
        )}
      />
      <label className="font-secondary dark:text-dark-light text-light-dark text-sm">
        {label}
      </label>
      {error && (
        <span className="-mt-1 text-xs text-fg-error-primary">{error}</span>
      )}
    </div>
  )
}
export default CheckboxField
