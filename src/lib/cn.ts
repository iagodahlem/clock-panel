import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/**
 * Merges className strings/conditionals (clsx) and then resolves any
 * conflicting Tailwind utilities so the last one wins predictably
 * (tailwind-merge) — e.g. `cn("px-2", condition && "px-4")` always
 * resolves to a single padding utility instead of shipping both classes
 * and letting CSS source order decide. Standard shadcn convention.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
