# Exchange

For currency exchange data the CoinGecko free API is used. 

As the CoinGecko API has rate limiting, we have created a database table `exchange_table` which stores the exchange data and has it ready for serving to our users.

The value in the database is updated on every X time interval by a cron-scheduled worker.

## Issues

CloudFlare Pages Functions, our main backend, unfortunately doesn't support cron workers yet ([source](https://community.cloudflare.com/t/schedule-a-cloudflare-pages-function/615507)), so the solution is to manually deploy a cron-scheduled worker ([link](https://developers.cloudflare.com/workers/configuration/cron-triggers/)) to trigger the refetching of the exchange data.


## Configuration

Since this worker is configured manually, below are the steps to reproduce the setup on CF:
1. Create a new CF worker
2. Disable auto-generated http endpoints for cron worker.
3. Add env variables:
    1. ADMIN_API_KEY
    2. REFRESH_EXCHANGE_DATA_API
4. Setup trigger = Trigger Events -> Cron -> */1 * * * * (once a minute)
5. Enable logging = Observability -> Worker Logs -> Enabled
