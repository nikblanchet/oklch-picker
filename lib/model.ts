import Delaunator from 'delaunator'
import {
  BufferAttribute,
  BufferGeometry,
  ColorManagement,
  DoubleSide,
  LinearSRGBColorSpace,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  Vector3,
  WebGLRenderer
} from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'

import type { Lch } from './color.ts'
import { AXIS_MAX } from './config.ts'
import { gammaDecode, gammaEncode, linearToOklab, type Vec3 } from './gamut.ts'

ColorManagement.enabled = false

const STEPS = 100
const FLOOR = -0.5

/** Model space is a cube from -0.5 to 0.5: X is L, Y is C and Z is H. */
function toPosition({ c, h, l }: Lch): Vec3 {
  return [l - 0.5, c / (2 * AXIS_MAX.c) + FLOOR, h / AXIS_MAX.h - 0.5]
}

function* cubeSurface(): Generator<Vec3> {
  for (let r = 0; r <= STEPS; r++) {
    for (let g = 0; g <= STEPS; g++) {
      const isOnFace = r % STEPS === 0 || g % STEPS === 0
      for (let b = 0; b <= STEPS; b += isOnFace ? 1 : STEPS) {
        yield [r / STEPS, g / STEPS, b / STEPS]
      }
    }
  }
}

/** The edge of the P3 gamut as a height map over lightness and hue. */
function buildTop(): BufferGeometry {
  const positions: number[] = []
  const colors: number[] = []
  for (const rgb of cubeSurface()) {
    const [l, a, b] = linearToOklab('p3', rgb.map(gammaDecode) as Vec3)
    const c = Math.hypot(a, b)
    if (c < 1e-4) continue
    const h = ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360
    positions.push(...toPosition({ c, h, l }))
    colors.push(...rgb)
  }
  for (const l of [0, 1]) {
    for (const h of [0, AXIS_MAX.h]) {
      positions.push(...toPosition({ c: 0, h, l }))
      colors.push(l, l, l)
    }
  }
  const { triangles } = new Delaunator(positions.filter((_, i) => i % 3 !== 1))
  return new BufferGeometry()
    .setAttribute('position', toAttribute(positions))
    .setAttribute('color', toAttribute(colors))
    .setIndex(new BufferAttribute(triangles, 1))
}

function buildBottom(): BufferGeometry {
  const bottom = new PlaneGeometry(1, 1, 20, 1)
    .rotateX(-Math.PI / 2)
    .translate(0, FLOOR, 0)
  const position = bottom.getAttribute('position')
  const grays = Array.from({ length: position.count }, (_, i) => {
    const gray = gammaEncode((position.getX(i) + 0.5) ** 3)
    return [gray, gray, gray]
  })
  return bottom.setAttribute('color', toAttribute(grays.flat()))
}

function toAttribute(values: number[]): BufferAttribute {
  return new BufferAttribute(new Float32Array(values), 3)
}

/** Draws gray lines where the model crosses the `slice` planes. */
function createMaterial(slice: Vector3): MeshBasicMaterial {
  const material = new MeshBasicMaterial({
    side: DoubleSide,
    vertexColors: true
  })
  material.onBeforeCompile = shader => {
    shader.uniforms['slice'] = { value: slice }
    shader.vertexShader = `varying vec3 vPos;\n${shader.vertexShader}`.replace(
      '#include <begin_vertex>',
      '#include <begin_vertex>\nvPos = transformed;'
    )
    shader.fragmentShader =
      `uniform vec3 slice;\nvarying vec3 vPos;\n${shader.fragmentShader}`.replace(
        '#include <dithering_fragment>',
        `#include <dithering_fragment>
        vec3 lines = 1.0 - smoothstep(0.0, 0.0025, abs(vPos - slice));
        lines.y *= step(${FLOOR + 0.0001}, vPos.y);
        float line = max(lines.x, max(lines.y, lines.z));
        gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(0.5), line);`
      )
  }
  return material
}

// Shared by the small and the fullscreen models
const geometries = [buildTop(), buildBottom()]
const viewDirection = new Vector3(0.79, 0, 0.79)

export interface Model {
  highlight(color: Lch): void
  /** Turn to the side from which the other model was last looked at. */
  sync(): void
}

/** Renders on demand only, so an idle page does not drain the battery. */
export function createModel(
  canvas: HTMLCanvasElement,
  isFullControl: boolean
): Model {
  const renderer = new WebGLRenderer({ alpha: true, antialias: true, canvas })
  // Vertex colors are already encoded, they must be passed through as is
  renderer.outputColorSpace = LinearSRGBColorSpace
  renderer.getContext().drawingBufferColorSpace = 'display-p3'

  const slice = new Vector3(2, 2, 2)
  const material = createMaterial(slice)
  const scene = new Scene()
  for (const geometry of geometries) {
    scene.add(new Mesh(geometry, material).translateY(0.3))
  }

  const camera = new PerspectiveCamera(75, 1, 0.1, 1000)
  camera.position.copy(viewDirection)

  const controls = new OrbitControls(camera, canvas)
  controls.enablePan = controls.enableZoom = isFullControl
  // The small model must not block scrolling
  if (!isFullControl) canvas.style.touchAction = 'pan-y pinch-zoom'
  controls.minDistance = 0.9
  controls.maxDistance = 3

  let frame = 0
  function render(): void {
    frame ||= requestAnimationFrame(() => {
      frame = 0
      renderer.render(scene, camera)
    })
  }

  controls.addEventListener('change', render)
  controls.addEventListener('end', () => {
    viewDirection.copy(camera.position).sub(controls.target)
  })
  canvas.addEventListener('webglcontextrestored', () => {
    renderer.getContext().drawingBufferColorSpace = 'display-p3'
    render()
  })

  new ResizeObserver(() => {
    const { clientHeight: height, clientWidth: width } = canvas
    if (width === 0 || height === 0) return
    camera.aspect = width / height
    camera.updateProjectionMatrix()
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
    renderer.setSize(width, height, false)
    render()
  }).observe(canvas)

  return {
    highlight(color) {
      slice.set(...toPosition(color))
      render()
    },
    sync() {
      camera.position
        .copy(viewDirection)
        .setLength(controls.getDistance())
        .add(controls.target)
      controls.update()
      render()
    }
  }
}
