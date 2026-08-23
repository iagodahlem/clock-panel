// React root: mounts the panel's canvas shell. The render loop itself lives
// entirely in controller.ts and never touches React -- see PanelCanvas.tsx
// for that boundary.

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { PanelCanvas } from './PanelCanvas'

function requireRoot(): HTMLElement {
  const el = document.getElementById('root')
  if (!el) throw new Error('missing #root element')
  return el
}

createRoot(requireRoot()).render(
  <StrictMode>
    <PanelCanvas />
  </StrictMode>,
)
