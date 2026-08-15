# clock-panel

A panel of small analog clocks whose hands align to display the time. An homage to ClockClock 24 by Humans since 1982.

## Status

Early. What's here right now is a single-clock motion study: one large clock demonstrating the rotation primitive that the full panel will later run on 24 copies of. There's no digit layout, no panel grid, and no minute-change choreography yet.

## Running it

```sh
pnpm install
pnpm dev
```

Open the URL it prints. The clock picks a new random hand pose every few seconds on its own. Click it to retarget immediately, mid-motion, and watch the hands redirect instead of snapping.

## Scripts

- `pnpm dev` - start the dev server
- `pnpm build` - build for production
- `pnpm preview` - preview the production build
- `pnpm typecheck` - run `tsc --noEmit`
- `pnpm lint` - run eslint

## Dev server hosts

If you need to reach the dev server (or the preview server) from a hostname other than localhost, for example through a tunnel, set `DEV_ALLOWED_HOSTS` in a `.env.local` file to a comma-separated list of hostnames. See `.env.example`.
