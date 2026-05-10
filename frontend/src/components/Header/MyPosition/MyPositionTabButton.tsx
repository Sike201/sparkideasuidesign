import { MyPositionTabId } from "@/@types/frontend"
import { twMerge } from "tailwind-merge"

type MyPositionTabButtonProps = {
  activeTab: MyPositionTabId
  setActiveTab: (tab: MyPositionTabId) => void
  tab: {
    id: MyPositionTabId
    label: string
  }
}
const MyPositionTabButton = ({ setActiveTab, activeTab, tab }: MyPositionTabButtonProps) => {
  const isTabActive = activeTab === tab.id
  return (
    <div
      onClick={() => setActiveTab(tab.id)}
      className={twMerge(
        "hover:tabs-text-shadow group relative flex-1 cursor-pointer py-2 text-center text-sm active:scale-95",
      )}
    >
      <span
        className={twMerge(
          "group-hover:tabs-text-shadow font-vcr text-fg-tertiary group-hover:text-fg-brand-primary",
          isTabActive && "tabs-text-shadow text-fg-brand-primary",
        )}
      >
        {tab.label}
      </span>
      <div
        className={twMerge(
          "absolute bottom-0 h-0.5 w-full scale-x-0 transition-transform ",
          isTabActive && "tabs-bottom-border scale-x-100 bg-fg-brand-primary",
        )}
      ></div>
    </div>
  )
}

export default MyPositionTabButton
