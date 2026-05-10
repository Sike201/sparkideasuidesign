export type GetMeTwitterResponse = {
  data: {
    id: string // X id
    name: string // X name
    username: string // X handle
    profile_image_url: string // avatar url
  }
  errors?: {
    detail: string
    status: number
    title: string
    type: string
  }
}

type Entity = {
  link: string
  preview: string
  type: string
}

export type TweetScoutUser = {
  avatar: string
  can_dm: boolean
  created_at: string
  description: string
  followers_count: number
  friends_count: number
  id_str: string
  name: string
  screen_name: string
  statuses_count: number
}

export type TweetScoutTweetResponse = {
  bookmark_count: number
  conversation_id_str: string
  created_at: string
  entities: Entity[]
  favorite_count: number
  full_text: string
  id_str: string
  in_reply_to_status_id_str: string
  is_quote_status: boolean
  quote_count: number
  reply_count: number
  retweet_count: number
  user: TweetScoutUser
  view_count: number
}
