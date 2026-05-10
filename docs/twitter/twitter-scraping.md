
# Twitter Followers Scraping

## Intro

As Twitter doesn't allow fetching followers with their free developer plan, we sought other solutions.  

[Rettiwt](https://github.com/Rishikant181/Rettiwt-API) seemed like a perfect solution, however the problem is that we're developing our app on CloudFlare Workers where the lib cannot work because of its reliance on NodeJS core APIs, for which the Workers do not have the full compatibility for. [Read more](https://developers.cloudflare.com/workers/runtime-apis/nodejs/).  

An [issue](https://github.com/Rishikant181/Rettiwt-API/issues/572) for this has been raised on GitHub.

Since we cannot fix this quickly, can't install the lib on CF Workers, we can reimplement the libs functionalities we're interested in.  

## Implementation

The functionality is implemented manually (no lib) using `fetch` to pull data from Twitter's internal APIs.

To authorize to the API we need three things (three headers):
- Authorization - bearer token
- Cookies
- x-csrf-token

The procedure to get those is the following: 
- Install Rettiwt lib `npm install -g rettiwt-api`
- Execute `rettiwt auth login "<email>" "<username>" "<password>"` to get api key
- run the script `NODE_DEBUG=http,https node scripts/rettiwt.mjs` with the api key to inspect network values
- extract Authorization, Cookie, and X-CSRF-Token headers' values

## Problems

### Pagination (resolved)

Twitter APIs uses [cursors](https://developer.x.com/en/docs/x-api/v1/pagination) for [pagination](https://developer.x.com/en/docs/x-ads-api/pagination).

The problem is that even though there's `count: 100` , it returns an arbitrary number of users each time. 

```
 (log) {
  topCursor: '-1|1829538019120512197',
  bottomCursor: '1806732549773649334|1829538019120512172',
  usersCount: 22
}
.......  
 (log) {
  topCursor: '-1|1829538019120512173',
  bottomCursor: '1806730134264717594|1829538019120512145',
  usersCount: 25
}
......
  (log) {
  topCursor: '-1|1829538019120512146',
  bottomCursor: '1806727616985219624|1829538019120512121',
  usersCount: 22
}
.......
  (log) {
  topCursor: '-1|1829538019120512100',
  bottomCursor: '1806722660012457668|1829538019120512075',
  usersCount: 22
}
......
```

This means that we cannot rely on the number of users in the response to decide if we've fetched all users. 

This issue is resolved by relying on cursor format instead of number of users to decide if it's all fetched. 

### Subrequest Limit (unresolved)

Unfortunately, CloudFlare Workers have a limit of 50 [subrequests](https://developers.cloudflare.com/workers/platform/limits/#subrequests) per function invocation.

```
A subrequest is any request that a Worker makes to either Internet resources using the Fetch API or requests to other Cloudflare services like R2, KV, or D1.
```

Example of error after 50 subrequests:

```
...
  (log) Calling API: cursor=1807191214268185776|1829516771174907710, subrequestCounter=49, now=2024-08-30T14:04:33.000Z
  (log) {
  rateLimitHeaders: {
    xRateLimitLimit: '50',
    xRateLimitReset: '1725027573',
    xRateLimitRemaining: '49'
  }
}
  (log) {
  topCursor: '-1|1829516771174907711',
  bottomCursor: '1807187956517341781|1829516771174907708',
  usersCount: 0
}
  (log) Calling API: cursor=1807191214268185776|1829516771174907710, subrequestCounter=50, now=2024-08-30T14:04:33.316Z
  (error) Error: Too many subrequests.
```

