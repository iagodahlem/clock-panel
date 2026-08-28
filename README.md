# clock-panel

A panel of small analog clocks whose hands align to display the time. Inspired by ClockClock 24 by Humans since 1982.

## Status

Early. The panel renders the current local time as 24 clocks (4 digits, HH:MM, 2x3 clocks each), fit to and centered on the canvas at any size. On a minute change, the hands that need to move sweep into their new pose with a staggered, directional choreography instead of jumping straight there. Between changes the panel is not fully still either: every so often it plays a brief ambient pattern across the hands, always returning every hand to its digit pose by the end. Each clock is filled at the page's own background color and reads as a shallow well pressed into it rather than a disc sitting on top: the wall on the side toward the light falls into a soft, wide shadow that bleeds onto the face, the wall opposite it catches the light as a thin bright crescent, and the raised hands drop soft shadows onto the face away from the light. With a mouse on the panel the cursor is that light, measured from each clock's own centre, so all three cues turn together on all 24 clocks as it moves.

## Running it

```sh
pnpm install
pnpm dev
```

Open the URL it prints. The panel shows the current local time and keeps ticking as the minute changes. Append `?time=HHMM` or `?time=HH:MM` to the URL (e.g. `?time=13:45`) to override the displayed time with any 4 digits, for reviewing the digit font. Add a second `?to=HHMM` alongside it (e.g. `?time=13:45&to=13:46`) and any key press or click transitions the panel between the two, for watching the choreography on demand. Between minute changes the panel occasionally plays a short ambient hand pattern on its own; append `?idle=wave`, `?idle=breathe`, or `?idle=cascade` and any key press or click plays that pattern once on demand instead of waiting for it. Append `?light=force` to keep the pointer light active even with the OS's Reduce Motion setting on, for demoing the light on a machine that has it enabled; every other reduced-motion behavior (hand transitions, idle choreography) stays off. Append `?hands=<hourDegrees>,<minuteDegrees>` (e.g. `?hands=270,180`) to pin every clock's hands to that exact pose, degrees clockwise from 12 o'clock, overriding the live clock and any choreography, for reviewing hand geometry at a known angle.

## Architecture

The app is a thin React shell around a plain-canvas render loop. `src/controller.ts` owns everything animated: the `requestAnimationFrame` loop, the spring-driven hand angles, the minute-change and idle choreography, the pointer position the lighting follows, and the canvas drawing itself. `createPanelController(canvas, options)` returns a small imperative handle (`setTime`, `transitionTo`, `playIdle`, `start`/`stop`/`destroy`, `getState`, `on`) - React never touches the loop's internals directly.

`src/PanelCanvas.tsx` is the only React component today. It mounts the canvas, creates the controller inside a `useEffect` (with `destroy()` as cleanup), reads `?time=`/`?to=`/`?idle=` once into initial state, and wires up the existing any-key/click QA transition trigger as a plain handler. React never reads the controller's live state during render and never re-creates it on a prop change, so the animation is free to run entirely on its own clock. Keeping the loop outside React's render cycle this way - rather than driving it from render or from an effect that closes over changing state - is what avoids the class of bug where a stale closure or a mid-render ref read reaches into a running animation.

## Scripts

- `pnpm dev` - start the dev server
- `pnpm build` - build for production
- `pnpm preview` - preview the production build
- `pnpm typecheck` - run `tsc --noEmit`
- `pnpm lint` - run eslint
- `pnpm test` - run the unit tests
- `pnpm deploy:pages` - build and publish `dist/` to `gh-pages`

## Deploying

Live at <https://iagodahlem.github.io/clock-panel/>. Run `pnpm deploy:pages` to build and publish.

## Dev server hosts

If you need to reach the dev server (or the preview server) from a hostname other than localhost, for example through a tunnel, set `DEV_ALLOWED_HOSTS` in a `.env.local` file to a comma-separated list of hostnames. See `.env.example`.
