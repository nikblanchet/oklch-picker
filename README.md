# Guess the Pantone Color of the Year

A small contest site. Entrants pick a color in OKLCH, leave their contact
details, and whoever is closest to Pantone’s announcement wins.

It is built on the wonderful [OKLCH Color Picker] by [Evil Martians].

[OKLCH Color Picker]: https://github.com/evilmartians/oklch-picker
[Evil Martians]: https://evilmartians.com/

## Setup

1. Install Node.js 24+ and [pnpm](https://pnpm.io/), then run `pnpm install`.
2. Run `pnpm keygen`. Save the **private key** in your password manager.
   Without it nobody, including you, can read the contact details.
3. Copy `.env.example` to `.env.local` and fill it in. Add the same three
   variables to the Vercel project, for Production and Preview. The build fails
   if any of them is missing.
4. In the Supabase SQL editor, run
   [the migration](./supabase/migrations/20261113000000_contest.sql). It also
   takes the table of the 2026 site away from the public.
5. In Supabase, open Authentication:
   - Turn off “Allow new users to sign up”.
   - Delete the users of the 2026 site: their passwords and sessions may have
     leaked.
   - Add a user for yourself, then make it an admin in the SQL editor:

     ```sql
     insert into contest.admins
     select id from auth.users where email = 'you@example.com';
     ```

The site supports Safari 15.5, Chrome 111, Firefox 114 and newer.

### Upgrading from the 2026 site

Do steps 4 and 5 right before deploying, since the old site stops working.
Entries on the server stay available under 2026 in the admin panel, but the new
site deletes everything the old one stored in browsers. If a device has entries
which never reached the server, copy `localStorage['contest:entries']` from its
console first. Afterwards, open the site once on every shared device while it
is online (twice on iPadOS 15, which first shows the old page), and send a test
entry from a real iPhone.

In existing clones, run `rm -f .git/hooks/pre-commit` once: the tool it calls
is gone.

## Running a contest

Open `/?admin` or press <kbd>Ctrl</kbd> <kbd>Shift</kbd> <kbd>A</kbd> to log
in. Prefer your own device over the one entrants use.

- **Close submissions** before Pantone announces the color. To schedule it, for
  example:

  ```sql
  update contest.contests set closes_at = '2026-12-01 00:00 America/New_York'
  where year = 2027;
  ```

  Opening submissions again removes the deadline.

- **Set the color** as HEX or any CSS color. No entries are accepted while it
  is set. Entries are ranked by CIEDE2000 between sRGB colors; wider gamut
  guesses are mapped to sRGB first.
- **Delete the entries** once the prize is handed out.

### Next year

1. Add last year’s 440×660 chip to `public/images/pantone/`, named like
   `2026_11-4201-TCX.webp`. The gallery is generated from that folder.
2. Bump `CONTEST_YEAR` in `lib/config.ts` and deploy.
3. Press “Open submissions” in the admin panel.

## Security model

- **Database.** Tables live in a schema which browsers cannot reach. Visitors
  can call one function, `submit_entry`, which validates the values and
  enforces the deadline, rate limits and a cap on entries. Admin functions
  check an allowlist and require a session younger than an hour.
- **Contact details** are encrypted in the browser to the admin’s public key
  (ECDH P-256, HKDF, AES-256-GCM) and bound to their row. Colors and
  timestamps are not encrypted.
- **IP addresses** are hashed for rate limiting. Whoever has database access
  could reverse them. They are purged after a day of activity, and whenever you
  close submissions, set the color or delete all entries.
- **Editing** needs a random 256-bit token. The database only has its hash.
- **Admin sessions,** the private key and decrypted entries only exist in
  memory. They are dropped when the panel is closed or idle for 10 minutes.
- **Shared devices.** The page is reloaded from scratch after each entrant, 5
  idle minutes after submitting, or 15 idle minutes otherwise.
- **Pages** have a strict Content Security Policy with Trusted Types, and can
  only talk to this Supabase project and Google Fonts.

Known limits:

- There is no CAPTCHA. A determined person can enter many times (the panel
  flags repeated contacts) or fill the contest up. To recover, delete the spam
  from `contest.entries` by `created_at`, or raise `max_entries` in
  `contest.contests`.
- Rate limits rely on the `CF-Connecting-IP` header. The fallback,
  `X-Forwarded-For`, can be forged.
- Only accepted requests count towards the rate limits, since Postgres rolls
  the counter back together with a rejected one.
- Entries of 2026 were encrypted with a password which was public, so only the
  database protects them.

## Development

| Command       | What it does                                     |
| ------------- | ------------------------------------------------ |
| `pnpm start`  | Dev server on localhost                          |
| `pnpm build`  | Production build in `dist/`                      |
| `pnpm test`   | Types, linters, unit, database and browser tests |
| `pnpm format` | Prettier                                         |

Browser tests need `pnpm exec playwright install` once. They run the production
build in Chromium, WebKit and Firefox, against the real migration on an
in-memory Postgres. Set `CHROMIUM_PATH` to use an installed Chromium.

- `lib/` has logic without state, `stores/` has signals, `view/` connects them
  to the markup in `index.html`.
- `lib/gamut.ts` is the fast color math for charts. `colorjs.io` handles
  parsing and the other notations.
- `build/` has Vite plugins for generated markup, CSP and the service worker.
