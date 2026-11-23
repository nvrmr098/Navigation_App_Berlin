# Bearline live sharing (Cloudflare Worker + KV)

Free tier, no server to run. Trips are deleted automatically after 6 hours.

## Deploy (about 5 minutes)

1. Make a free account at https://dash.cloudflare.com (no card needed).
2. In this folder:
   ```
   npm install
   npx wrangler login
   npx wrangler kv namespace create TRIPS
   ```
   Paste the printed `id` into `wrangler.toml` (replace PASTE_KV_ID_HERE).
3. `npx wrangler deploy`
4. Wrangler prints your address, like `https://bearline-share.YOURNAME.workers.dev`.
5. Put that address into `web/src/config.js` (`SHARE_API`), rebuild the app.

## Notes

- Each position update is one KV write. The app sends one every 20 seconds and only after you moved 25 m, so a 30 minute ride is roughly 90 writes. Check the current KV free limits in the Cloudflare docs.
- The viewer link is `https://YOUR-WORKER/t/<random id>`. Anyone with the link can see the position until you stop sharing or 6 hours pass.
- The secret key for updates stays on the sender phone only.
