# Guess the Pantone Color of the Year

A small contest site. Entrants dress fashion sketches in their guess and sign
their name. Whoever is closest to Pantone’s announcement wins.

It started as a fork of the wonderful [OKLCH Color Picker] by [Evil Martians].

[OKLCH Color Picker]: https://github.com/evilmartians/oklch-picker
[Evil Martians]: https://evilmartians.com/

## Setup

1. Install Node.js 24+ and [pnpm](https://pnpm.io/), then run `pnpm install`.
2. Run `pnpm keygen`. Save the **private key** in your password manager.
   Without it nobody, including you, can read who entered.
3. Copy `.env.example` to `.env.local` and fill it in. Add the same three
   variables to Production and Preview of the Vercel project. The build fails
   if any of them is missing.
4. In the Supabase SQL editor, run [the migrations](./supabase/migrations/) in
   order. They also take the table of the 2026 site away from the public. Run
   new ones before deploying the code which needs them.
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

Do steps 4 and 5 right before deploying because the old site stops working.
Entries on the server stay available under 2026 in the admin panel, but the new
site deletes everything the old one stored in browsers. If a device has entries
which never reached the server, copy `localStorage['contest:entries']` from its
console first. Afterwards, open `/?party` once on every shared device while it
is online (twice on iPadOS 15, which first shows the old page), and send a test
entry from a real iPhone.

In existing clones, run `rm -f .git/hooks/pre-commit` once: the tool it calls
is gone.

## Running a contest

Open `/?admin` or press <kbd>Ctrl</kbd> <kbd>Shift</kbd> <kbd>A</kbd> to log
in. Prefer your own device over the one entrants use.

- **Share the link.** People keep their entry on their own phone and can come
  back to change it.
- **At parties,** open `/?party` or press “Hand this phone to someone else”.
  Until you press “Exit” on the first screen, the phone forgets every guest
  but keeps your own entry. Use it on all shared devices.
- **Close submissions** as soon as Pantone announces the color. Missed it? Set
  the closing time to the moment of the announcement in your own time zone.
  Colors which were chosen later are marked as late and cannot win. A time in
  the future schedules the closing. Opening submissions again removes it.
- **Set the color** as HEX or any CSS color. No entries are accepted while it
  is set. Entries are ranked by CIEDE2000 between sRGB colors; wider gamut
  guesses are mapped to sRGB first.
- **Two colors?** Set one, note its winner, then set the other.
- **Delete the entries** once the prize is handed out. Only pause the Supabase
  project after that: the admin panel needs it too.

### Next year

1. Resume the Supabase project.
2. Update dependencies: `pnpm update --latest`, `pnpm audit`, `pnpm test`.
3. Add last year’s color to `lib/winners.ts`.
4. Bump `CONTEST_YEAR` in `lib/config.ts` and deploy.
5. Press “Open submissions” in the admin panel.

## Colors

The picker only offers colors which both sRGB screens can show and real
surfaces can have according to Pointer’s gamut. Every previous winner is among
them. The database does not enforce this. Everybody starts from a random color,
which is stored as the “primer” to see how it influences guesses.

## Security model

- **Database.** Tables live in a schema which browsers cannot reach. Visitors
  can call one function, `submit_entry`, which validates the values and
  enforces the deadline, rate limits and a cap on entries. Admin functions
  check an allowlist and require a session younger than an hour.
- **Names, contacts and color names** are encrypted in the browser to the admin’s public key
  (ECDH P-256, HKDF, AES-256-GCM) and bound to their row. Colors and
  timestamps are not encrypted.
- **IP addresses** are hashed for rate limiting. Whoever has database access
  could reverse them. They are purged after a day of activity and whenever you
  close submissions by hand, set the color or delete all entries.
- **Editing** needs a random 256-bit token. The database only has its hash.
  The token stays in the entrant’s browser along with their details.
- **Admin sessions,** the private key and decrypted entries only exist in
  memory. They are dropped when the panel is closed or idle for 10 minutes.
- **Party mode** reloads the page from scratch after each guest, 5 idle minutes
  after submitting, or 15 idle minutes otherwise.
- **Pages** have a strict Content Security Policy with Trusted Types and can
  only talk to this Supabase project.

Known limits:

- There is no CAPTCHA. A determined person can enter many times (the panel
  flags repeated names and contacts) or fill the contest up. To recover, delete the spam
  from `contest.entries` by `created_at` or raise `max_entries` in
  `contest.contests`.
- Rate limits rely on the `CF-Connecting-IP` header. The fallback,
  `X-Forwarded-For`, can be forged.
- Only accepted requests count towards the rate limits because Postgres rolls
  the counter back together with a rejected one.
- Until submissions are closed for real, an entry which is on time can be
  handed to somebody else. The panel flags details changed after closing.
- The contact is optional, so a winner may only be known by name.
- Safari may clear the storage of sites which were not visited for a week.
  Such entrants can only enter again, which the panel flags if the name or
  contact is the same.
- Guests can leave party mode and see the entry of the phone’s owner.
- Entries of 2026 were encrypted with a password which was public, so only the
  database protects them.

## Development

| Command       | What it does                                     |
| ------------- | ------------------------------------------------ |
| `pnpm start`  | Dev server on localhost                          |
| `pnpm build`  | Production build in `dist/`                      |
| `pnpm test`   | Types, linters, unit, database and browser tests |
| `pnpm art`    | Paint the sketches, link preview and icons       |
| `pnpm format` | Prettier                                         |

Browser tests need `pnpm exec playwright install` once. They run the production
build in Chromium, WebKit and Firefox against the real migrations on an
in-memory Postgres. Set `CHROMIUM_PATH` to use an installed Chromium.

- `lib/` has logic without state, `stores/` has signals, `view/` connects them
  to the markup in `index.html`.
- `art/` paints the sketches. Each has a watercolor mask, which CSS fills with
  any color, and an ink layer. List new ones in `lib/looks.ts` and
  `view/look/index.css`. Their order is random on every visit. `cast()` keeps
  similar ones apart, including the pairs and the model of the first screen.
- `build/` has Vite plugins for placeholders, CSP and the service worker.
- The fonts are subsets of Bodoni Moda and Jost under
  [their license](./view/base/fonts/OFL.txt).
