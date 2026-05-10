import { twMerge } from "tailwind-merge"

export const TableHeader = ({
  children,
  onClick,
  className = "",
}: {
  children: React.ReactNode
  onClick?: () => void
  className?: string
  isCategory?: boolean
}) => (
  <th
    className={twMerge(
      "w-[12%] px-2 py-3 text-left text-xs font-medium tracking-wider text-fg-tertiary md:table-cell lg:table-cell",
      onClick && "cursor-pointer transition-colors hover:bg-secondary/50",
      className,
    )}
    onClick={onClick}
  >
    {children}
  </th>
)
