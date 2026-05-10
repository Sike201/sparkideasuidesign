import { ScrollRestoration } from "react-router-dom"

const NotFound = () => {
  return (
    <div className="z-10 flex h-screen flex-col items-center justify-center gap-4">
      <ScrollRestoration />
      <h1 className="text-5xl">404</h1>
      <h2 className="text-2xl">PAGE NOT FOUND</h2>
    </div>
  )
}

export default NotFound
