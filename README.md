# clock-panel

A panel of small analog clocks whose hands align to display the time. Inspired by ClockClock 24 by Humans since 1982.

## Status

Early. The panel now renders the current local time as 24 clocks (4 digits, HH:MM, 2x3 clocks each), fit to and centered on the canvas at any size. There's no minute-change choreography yet -- hands jump straight to their new pose when the time changes.

## Running it

```sh
pnpm install
pnpm dev
```

Open the URL it prints. The panel shows the current local time and keeps ticking as the minute changes. Append `?time=HHMM` or `?time=HH:MM` to the URL (e.g. `?time=13:45`) to override the displayed time with any 4 digits, for reviewing the digit font.

## Scripts

- `pnpm dev` - start the dev server
- `pnpm build` - build for production
- `pnpm preview` - preview the production build
- `pnpm typecheck` - run `tsc --noEmit`
- `pnpm lint` - run eslint

## Dev server hosts

If you need to reach the dev server (or the preview server) from a hostname other than localhost, for example through a tunnel, set `DEV_ALLOWED_HOSTS` in a `.env.local` file to a comma-separated list of hostnames. See `.env.example`.
