import { jsonResponse, reportError } from "./cfPagesFunctionsUtils"

type ENV = {
  DB: D1Database
  VITE_ENVIRONMENT_TYPE?: string
}

export const onRequestGet: PagesFunction<ENV> = async (ctx) => {
  try {
    const { searchParams } = new URL(ctx.request.url)
    const username = searchParams.get("username")

    if (!username) {
      return jsonResponse({ message: "Username is required" }, 400)
    }

    // Fetch user from database
    const user = await ctx.env.DB
      .prepare("SELECT * FROM twitter_users WHERE username = ?")
      .bind(username)
      .first()

    if (!user) {
      return jsonResponse({ message: "User not found" }, 404)
    }

    return jsonResponse({ user }, 200)
  } catch (e) {
    await reportError(ctx.env.DB, e)
    return jsonResponse({ message: "Something went wrong..." }, 500)
  }
}
