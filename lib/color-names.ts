import type { Color } from 'culori/fn'
import { formatHex, modeOklch, modeRgb, useMode } from 'culori/fn'

let rgb = useMode(modeRgb)
let oklch = useMode(modeOklch)

// Simplified color naming - TODO: Add color-name-list later if needed
let colorNames: Array<{ hex: string; name: string }> = []

/**
 * Get the basic hex representation of a color
 */
export function getColorHex(color: Color): string {
  try {
    return formatHex(rgb(color))
  } catch {
    return '#000000'
  }
}

/**
 * Find nearest named color from library
 * Uses simple Euclidean distance in RGB space for performance
 */
export function getNearestColorName(color: Color): { name: string; hex: string } {
  let hex = getColorHex(color)

  // If no color library loaded, return hex as name
  if (colorNames.length === 0) {
    return { name: hex.toUpperCase(), hex }
  }

  let rgbColor = rgb(color)

  if (!rgbColor || rgbColor.r === undefined) {
    return { name: 'Unknown', hex }
  }

  let r1 = rgbColor.r * 255
  let g1 = rgbColor.g * 255
  let b1 = rgbColor.b * 255

  let nearest = colorNames[0]
  let minDistance = Infinity

  for (let item of colorNames) {
    // Parse hex to RGB
    let r2 = parseInt(item.hex.slice(1, 3), 16)
    let g2 = parseInt(item.hex.slice(3, 5), 16)
    let b2 = parseInt(item.hex.slice(5, 7), 16)

    // Euclidean distance
    let distance = Math.sqrt(
      Math.pow(r1 - r2, 2) +
      Math.pow(g1 - g2, 2) +
      Math.pow(b1 - b2, 2)
    )

    if (distance < minDistance) {
      minDistance = distance
      nearest = item
    }
  }

  return { name: nearest.name, hex }
}

/**
 * Legacy function - now returns hex
 */
export function getColorName(color: Color): string {
  return getColorHex(color)
}

export function getColorFamily(color: Color): string {
  let rgbColor = rgb(color)
  let { b, g, r } = rgbColor

  let max = Math.max(r, g, b)
  let min = Math.min(r, g, b)
  let delta = max - min

  if (delta < 0.1) {
    if (max < 0.2) return 'black'
    if (max > 0.8) return 'white'
    return 'gray'
  }

  if (max === r) {
    if (g > b) {
      return g > 0.5 ? 'yellow' : 'orange'
    } else {
      return 'red'
    }
  } else if (max === g) {
    if (r > b) {
      return 'yellow'
    } else {
      return b > 0.5 ? 'cyan' : 'green'
    }
  } else {
    if (r > g) {
      return 'magenta'
    } else {
      return g > 0.5 ? 'cyan' : 'blue'
    }
  }
}

/**
 * Get OKLCH-aware color family based on hue
 */
export function getOklchColorFamily(color: Color): string {
  let lchColor = oklch(color)

  if (!lchColor || lchColor.l === undefined) {
    return 'gray'
  }

  // If chroma is very low, it's achromatic
  if (lchColor.c < 0.04) {
    if (lchColor.l < 0.2) return 'black'
    if (lchColor.l > 0.9) return 'white'
    return 'gray'
  }

  let h = lchColor.h ?? 0

  // Hue-based color families (in degrees)
  if (h >= 345 || h < 15) return 'red'
  if (h >= 15 && h < 45) return 'orange'
  if (h >= 45 && h < 75) return 'yellow'
  if (h >= 75 && h < 105) return 'lime'
  if (h >= 105 && h < 165) return 'green'
  if (h >= 165 && h < 195) return 'cyan'
  if (h >= 195 && h < 255) return 'blue'
  if (h >= 255 && h < 285) return 'purple'
  if (h >= 285 && h < 315) return 'magenta'
  if (h >= 315 && h < 345) return 'pink'

  return 'color'
}

/**
 * Get OKLCH-aware descriptive color name
 * Uses actual L/C/H values for more accurate descriptions
 */
export function getOklchDescription(color: Color): {
  description: string
  family: string
  name: string
} {
  let lchColor = oklch(color)

  if (!lchColor || lchColor.l === undefined) {
    return {
      description: 'unknown color',
      family: 'gray',
      name: getColorHex(color)
    }
  }

  let l = lchColor.l
  let c = lchColor.c
  let family = getOklchColorFamily(color)

  // Lightness descriptors (OKLCH lightness is 0-1)
  let lightness = ''
  if (l < 0.25) {
    lightness = 'very dark '
  } else if (l < 0.4) {
    lightness = 'dark '
  } else if (l > 0.85) {
    lightness = 'very light '
  } else if (l > 0.7) {
    lightness = 'light '
  }

  // Chroma descriptors (intensity/purity)
  let chromaDesc = ''
  if (c < 0.04) {
    chromaDesc = '' // achromatic, already handled by family
  } else if (c < 0.08) {
    chromaDesc = 'grayish '
  } else if (c < 0.12) {
    chromaDesc = 'muted '
  } else if (c > 0.25) {
    chromaDesc = 'vivid '
  } else if (c > 0.18) {
    chromaDesc = 'bright '
  }

  let description = `${lightness}${chromaDesc}${family}`.trim()

  return {
    description,
    family,
    name: getColorHex(color)
  }
}

/**
 * Get both library-based and algorithmic color descriptions
 */
export function getColorDescription(color: Color): {
  description: string
  family: string
  libraryName: string
  name: string
  oklchDescription: string
} {
  let nearestColor = getNearestColorName(color)
  let oklchDesc = getOklchDescription(color)

  return {
    name: oklchDesc.name,
    family: oklchDesc.family,
    description: oklchDesc.description,
    oklchDescription: oklchDesc.description,
    libraryName: nearestColor.name
  }
}
