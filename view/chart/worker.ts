import { type ChartTask, paintChart } from '../../lib/paint.ts'

addEventListener('message', ({ data }: MessageEvent<ChartTask>) => {
  const pixels = paintChart(data)
  postMessage(pixels, [pixels.buffer])
})
