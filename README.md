# clock-panel

A panel of small analog clocks whose hands align to display the time. Inspired by ClockClock 24 by Humans since 1982.

## Status

Early. The panel renders the current local time as 24 clocks (4 digits, HH:MM, 2x3 clocks each), fit to and centered on the canvas at any size. On a minute change, the hands that need to move sweep into their new pose with a staggered, directional choreography instead of jumping straight there. Between changes the panel is not fully still either: every so often it plays a brief ambient pattern across the hands, always returning every hand to its digit pose by the end.

## Running it

```sh
pnpm install
pnpm dev
```

Open the URL it prints. The panel shows the current local time and keeps ticking as the minute changes. Append `?time=HHMM` or `?time=HH:MM` to the URL (e.g. `?time=13:45`) to override the displayed time with any 4 digits, for reviewing the digit font. Add a second `?to=HHMM` alongside it (e.g. `?time=13:45&to=13:46`) and any key press or click transitions the panel between the two, for watching the choreography on demand. Between minute changes the panel occasionally plays a short ambient hand pattern on its own; append `?idle=wave`, `?idle=breathe`, or `?idle=cascade` and any key press or click plays that pattern once on demand instead of waiting for it.

## Scripts

- `pnpm dev` - start the dev server
- `pnpm build` - build for production
- `pnpm preview` - preview the production build
- `pnpm typecheck` - run `tsc --noEmit`
- `pnpm lint` - run eslint
- `pnpm deploy:pages` - build and publish `dist/` to `gh-pages`

## Deploying

Live at <https://iagodahlem.github.io/clock-panel/>. Run `pnpm deploy:pages` to build and publish.

## Dev server hosts

If you need to reach the dev server (or the preview server) from a hostname other than localhost, for example through a tunnel, set `DEV_ALLOWED_HOSTS` in a `.env.local` file to a comma-separated list of hostnames. See `.env.example`.
