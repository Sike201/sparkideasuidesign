import { useNavigate } from "react-router-dom"
import Img from "@/components/Image/Img"
import solanaImg from "@/assets/angelStaking/solana.png"

const PwaInstall = () => {
  const navigate = useNavigate();
  return (
    <main className="relative min-h-screen flex flex-col items-center bg-accent pt-0 pb-16 px-4 text-fg-primary">
      {/* Top bar avec logo Solana centré et cliquable */}
      <div className="w-full flex justify-center items-center h-20 bg-transparent mb-4">
        <button onClick={() => navigate('/mathis')} className="focus:outline-none">
          <Img src={solanaImg} size="custom" customClass="h-12 w-auto transition-opacity hover:opacity-80 active:opacity-60" alt="Solana Logo" />
        </button>
      </div>
      <div className="max-w-4xl w-full flex flex-col items-center mt-4">
        <h1 className="text-3xl md:text-4xl font-bold mb-12 text-center">How to install a PWA App</h1>
        <div className="w-full flex flex-col md:flex-row items-stretch justify-center gap-0 relative">
          {/* iOS */}
          <div className="flex-1 flex flex-col items-center px-4 pb-8 md:pb-0">
            <Img src={solanaImg} size="custom" customClass="w-14 h-14 rounded-lg shadow-lg mb-4" alt="Logo iOS" />
            <h2 className="text-xl font-semibold mb-2 text-center">On iOS (iPhone/iPad)</h2>
            <ol className="list-decimal list-inside text-base opacity-90 space-y-1 text-left max-w-xs mx-auto">
              <li>Open Spark-it in Safari.</li>
              <li>Tap <b>Share</b> <span role="img" aria-label="share">🔗</span> at the bottom of the screen.</li>
              <li>Scroll and select <b>Add to Home Screen</b> <span role="img" aria-label="home">🏠</span>.</li>
              <li>Confirm, the Spark-it icon will appear on your home screen!</li>
            </ol>
          </div>
          {/* Vertical divider */}
          <div className="hidden md:flex w-px bg-bd-primary opacity-30 mx-4" />
          {/* Android */}
          <div className="flex-1 flex flex-col items-center px-4 pt-8 md:pt-0">
            <Img src={solanaImg} size="custom" customClass="w-14 h-14 rounded-lg shadow-lg mb-4" alt="Logo Android" />
            <h2 className="text-xl font-semibold mb-2 text-center">On Android</h2>
            <ol className="list-decimal list-inside text-base opacity-90 space-y-1 text-left max-w-xs mx-auto">
              <li>Open Spark-it in Chrome.</li>
              <li>Tap <b>Menu</b> <span role="img" aria-label="menu">⋮</span> at the top right.</li>
              <li>Select <b>Install App</b> or <b>Add to Home Screen</b>.</li>
              <li>Confirm, the Spark-it icon will appear on your home screen!</li>
            </ol>
          </div>
        </div>
      </div>
    </main>
  )
}

export default PwaInstall 