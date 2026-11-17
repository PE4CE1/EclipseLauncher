import { clipKeptRanges, type ClipRange } from '../src/services/clipEdits'
import { execFile } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { chooseUploadDimensions, uploadHardwareEncoding } from './uploadQuality'
import { randomUUID } from 'node:crypto'
export interface ReplayLease {get(id:string|undefined):{path:string;size:number}|undefined;release():void}
import { clipDimensions as dimensions, clipBitrateMbps as clipBitrate } from '../src/services/clipQuality'

export interface MediaFacts {
  width: number; height: number; fps: number; averageFps: number; frames: number
  duration: number; fileSize: number; bitrate: number; videoCodec: string
  hasVideo: boolean; hasAudio: boolean; audioCodec?: string
  videoCopied?: boolean
}
export interface ReplayTiming { currentStart?: number; previousStart?: number; currentMicOffset?: number; previousMicOffset?: number; currentWallStart?: number; previousWallStart?: number }
export interface ReplayHistorySegment { path: string; facts?: MediaFacts; start?: number; wallStart?: number; micOffset?: number; mic?: string; game?: string; discord?: string }
export interface ReplayAudioFiles { desktop?: boolean; desktopPath?: string; desktopGain?: number; desktopOutputPath?: string; microphoneProcessing?: {gain:number;gateDb:number;mono:boolean}; gameGain?: number; gamePath?: string; previousGamePath?: string; discordPath?: string; previousDiscordPath?: string; discordOutputPath?: string; micPath?: string; previousMicPath?: string; gameOutputPath?: string; micOutputPath?: string; timing?: ReplayTiming; history?: ReplayHistorySegment[] }

async function run(ffmpeg: string, args: string[], timeout = 120_000): Promise<{ stdout: string; stderr: string }> {
  let script: string | undefined
  const index = args.indexOf('-filter_complex')
  if (index >= 0 && args[index + 1].length > 6000) {
    script = path.join(os.tmpdir(), `eclipse-clip-filter-${randomUUID()}.txt`)
    fs.writeFileSync(script, args[index + 1], { flag: 'wx' })
    args = [...args.slice(0, index), '-filter_complex_script', script, ...args.slice(index + 2)]
  }
  try { return await new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    execFile(ffmpeg, ['-nostdin', '-hide_banner', ...args], { timeout, windowsHide: true, maxBuffer: 16 * 1024 * 1024, encoding: 'utf8' }, (error, stdout, stderr) => {
      if (error) reject(new Error(`FFmpeg: ${String(stderr || error.message).slice(-1600)}`))
      else resolve({ stdout: String(stdout), stderr: String(stderr) })
    })
  }) } finally { if (script) try { fs.unlinkSync(script) } catch {} }
}

function seconds(text: string): number {
  const match = /([\d]+):([\d]+):([\d.]+)/.exec(text)
  return match ? Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]) : 0
}

export async function inspectMedia(ffmpeg: string, file: string): Promise<MediaFacts> {
  const fileSize = fs.statSync(file).size
  const { stdout, stderr } = await run(ffmpeg, ['-i', file, '-map', '0:v:0?', '-map', '0:a:0?', '-c', 'copy', '-f', 'framecrc', '-', '-nostats'], 30_000)
  const input = stderr.split('Output #')[0]
  const video = input.split(/\r?\n/).find(line => /Stream #.*Video:/.test(line)) || ''
  const audio = input.split(/\r?\n/).find(line => /Stream #.*Audio:/.test(line)) || ''
  const dimensions = /\b(\d{2,5})x(\d{2,5})\b/.exec(video)
  const fps = Number(/([\d.]+) fps/.exec(video)?.[1]) || 0
  const base = /^#tb 0:\s*(\d+)\/(\d+)/m.exec(stdout)
  const timebase = base ? Number(base[1])/Number(base[2]) : 0
  let frames = 0, first = Infinity, last = -Infinity
  for (const packet of stdout.matchAll(/^0,\s*(-?\d+),\s*(-?\d+),\s*(\d+),/gm)) {
    const pts = Number(packet[2])*timebase, length = Number(packet[3])*timebase || (video && fps ? 1/fps : 0)
    first = Math.min(first,pts); last = Math.max(last,pts+length); frames++
  }
  const packetDuration = last-first
  const duration = (Number.isFinite(packetDuration)&&packetDuration>0?packetDuration:0) || seconds(/Duration:\s*([^,]+)/.exec(input)?.[1] || '')
  return { width: Number(dimensions?.[1]) || 0, height: Number(dimensions?.[2]) || 0, fps,
    averageFps: video && frames && duration ? Math.round(frames / duration * 100) / 100 : fps, frames: video?frames:0, duration, fileSize,
    bitrate: duration ? fileSize * 8 / duration : 0, hasVideo: !!video, hasAudio: !!audio,
    videoCodec: /Video:\s*([^ ,]+)/.exec(video)?.[1] || '', audioCodec: /Audio:\s*([^ ,]+)/.exec(audio)?.[1] }
}

export function fitClipDimensions(width: number, height: number, quality: string): [number, number] {
  const [maxWidth, maxHeight] = dimensions[quality] || dimensions['720p']
  const factor = Math.min(1, maxWidth / width, maxHeight / height)
  return [Math.max(2, Math.floor(width * factor / 2) * 2), Math.max(2, Math.floor(height * factor / 2) * 2)]
}

export function fitUploadDimensions(width:number,height:number,videoRate:number,fps:number):[number,number]{
  const maximum=Math.min(1,1920/width,1080/height)
  const frameCost=Math.sqrt(Math.max(24,Math.min(120,fps||30))/30)
  let result:[number,number]=[2,2]
  for(const resolution of [1080,720,540,480,360,240]){
    const scale=Math.min(maximum,resolution/height,(resolution*16/9)/width)
    result=[Math.max(2,Math.floor(width*scale/2)*2),Math.max(2,Math.floor(height*scale/2)*2)]
    // Roughly 2.8 Mbps for 1080p30 / 4 Mbps for 1080p60. Smaller
    // frames preserve edges and textures better when the upload budget is tight.
    if(videoRate>=result[0]*result[1]*1.35*frameCost)return result
  }
  return result
}

export async function encodeReplay(ffmpeg: string, input: string, output: string, options: {
  previous?: string | null; duration: number; fps: number; quality: string; bitrate: string | number; format: string; encoder: string | (() => Promise<string>); audio?: ReplayAudioFiles
  allowVideoCopy?: boolean; inputFacts?: { current: MediaFacts; previous?: MediaFacts }
}): Promise<MediaFacts> {
  const current = options.inputFacts?.current || await inspectMedia(ffmpeg, input)
  if (!current.hasVideo || !current.duration || !current.width || !current.height) {
    // A newly started hardware recorder can finalize its container before its
    // first encoded frame arrives. Keep the last actual frames from the history.
    const history = options.audio?.history || []
    for (let index = history.length - 1; index >= 0; index--) {
      const segment = history[index], facts = segment.facts || await inspectMedia(ffmpeg, segment.path)
      if (!facts.hasVideo || !facts.duration || !facts.width || !facts.height) continue
      return encodeReplay(ffmpeg,segment.path,output,{...options,previous:null,inputFacts:{current:facts},audio:{
        ...options.audio,gamePath:segment.game,discordPath:segment.discord,micPath:segment.mic,
        history:history.slice(0,index),timing:{currentStart:segment.start,currentWallStart:segment.wallStart,currentMicOffset:segment.micOffset},
      }})
    }
    throw new Error('The replay contains no readable video frames')
  }
  const previous = current.duration < options.duration && options.previous && options.previous !== input && fs.existsSync(options.previous)
    ? options.inputFacts?.previous || await inspectMedia(ffmpeg, options.previous) : null
  const segments: { path: string; facts: MediaFacts; start: number; duration: number; mic?: string; micOffset: number; game?: string; discord?: string; desktop?: string }[] = []
  const audio = options.audio || {}
  const currentTake = Math.min(options.duration, current.duration)
  if (audio.history?.length && currentTake < options.duration) {
    let remaining = options.duration - currentTake, nextStart = audio.timing?.currentStart
    for (const segment of [...audio.history].reverse()) {
      if (remaining <= .01) break
      const facts = segment.facts || await inspectMedia(ffmpeg, segment.path)
      const end = Math.min(facts.duration, typeof nextStart === 'number' && typeof segment.start === 'number' ? Math.max(0, nextStart - segment.start) : facts.duration)
      const take = Math.min(remaining, end)
      if (facts.hasVideo && take > .01) {
        segments.unshift({ path: segment.path, facts, start: Math.max(0, end - take), duration: take, mic: segment.mic, micOffset: segment.micOffset || 0, game: segment.game, discord: segment.discord })
        remaining -= take
      }
      nextStart = segment.start
    }
  } else if (previous?.hasVideo && currentTake < options.duration) {
    const wallDuration = typeof audio.timing?.currentStart === 'number' && typeof audio.timing.previousStart === 'number'
      ? Math.max(0, audio.timing.currentStart - audio.timing.previousStart) : previous.duration
    const previousEnd = Math.min(previous.duration, wallDuration)
    const take = Math.min(previousEnd, options.duration - currentTake)
    if (take > .01) segments.push({ path: options.previous!, facts: previous, start: Math.max(0, previousEnd - take), duration: take, game: audio.previousGamePath, discord: audio.previousDiscordPath, mic: audio.previousMicPath, micOffset: audio.timing?.previousMicOffset || 0 })
  }
  segments.push({ path: input, facts: current, start: Math.max(0, current.duration - currentTake), duration: currentTake, game: audio.gamePath, discord: audio.discordPath, desktop: audio.desktopPath, mic: audio.micPath, micOffset: audio.timing?.currentMicOffset || 0 })
  const duration = segments.reduce((sum, segment) => sum + segment.duration, 0)
  const [width, height] = fitClipDimensions(current.width, current.height, options.quality)
  const bitrate = clipBitrate(options.bitrate, options.quality)
  // A complete, already suitable H.264 segment needs audio assembly and muxing only.
  // Partial segments and joins keep the frame-accurate encoding path.
  const copyVideo = options.allowVideoCopy !== false && segments.length === 1 && segments[0].start === 0 && current.videoCodec === 'h264'
    && ['mp4','mkv'].includes(options.format) && current.width === width && current.height === height
    && Math.max(current.fps,current.averageFps) <= options.fps + .01 && current.bitrate <= bitrate * 1_250_000
  const game = segments.some(segment => segment.game || !audio.desktop && segment.facts.hasAudio)
  const desktop = audio.desktop === true && segments.some(segment => segment.desktop || segment.facts.hasAudio)
  const discord = segments.some(segment => segment.discord)
  const mic = segments.some(segment => segment.mic && fs.existsSync(segment.mic))
  const args = ['-y']
  const filters: string[] = []
  let inputCount = 0
  for (const [i, segment] of segments.entries()) {
    const index = inputCount++; args.push('-i', segment.path)
    const minimumInterval = 1 / Math.max(24, Math.min(120, options.fps)) - .001
    if (!copyVideo) filters.push(`[${index}:v:0]trim=start=${segment.start}:duration=${segment.duration},setpts=PTS-STARTPTS,select='isnan(prev_selected_t)+gte(t-prev_selected_t,${minimumInterval})',scale=${width}:${height}:force_original_aspect_ratio=decrease:force_divisible_by=2,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1[v${i}]`)
    const makeAudio = (source: string | null, label: string, offset = 0, gain = 1) => {
      const seek = Math.max(0, segment.start - offset)
      const delay = Math.max(0, offset - segment.start) * 1000
      const processing = label === 'm' ? audio.microphoneProcessing : undefined
      const gate = Math.max(-60,Math.min(-10,Number.isFinite(processing?.gateDb)?processing!.gateDb:-60))
      const micGain = Math.max(0,Math.min(1,Number.isFinite(processing?.gain)?processing!.gain:1))
      const microphone = processing ? `${processing.mono?'pan=stereo|c0=0.5*c0+0.5*c1|c1=0.5*c0+0.5*c1,':''}${gate>-60?`agate=threshold=${10**(gate/20)}:ratio=8:attack=5:release=120:range=0.001,`:''}volume=${micGain},` : ''
      filters.push(source
        ? `${source}atrim=start=${seek}:duration=${segment.duration},asetpts=PTS-STARTPTS,aresample=48000,aformat=channel_layouts=stereo,${microphone}volume=${gain}${delay > .1 ? `,adelay=${Math.round(delay)}:all=1` : ''},apad,atrim=duration=${segment.duration}[${label}${i}]`
        : `anullsrc=r=48000:cl=stereo,atrim=duration=${segment.duration}[${label}${i}]`)
    }
    if (game) {
      let gameIndex = index
      if (segment.game) { gameIndex = inputCount++; args.push('-i', segment.game) }
      makeAudio(segment.game || !audio.desktop && segment.facts.hasAudio ? `[${gameIndex}:a:0]` : null, 'g', 0, segment.game ? audio.gameGain ?? 1 : 1)
    }
    if (desktop) {
      let desktopIndex = index
      if (segment.desktop) { desktopIndex = inputCount++; args.push('-i',segment.desktop) }
      makeAudio(segment.desktop || segment.facts.hasAudio ? `[${desktopIndex}:a:0]` : null, 's',0,Math.max(0,Math.min(1,audio.desktopGain??1)))
    }
    if (discord) {
      let discordIndex = -1
      if (segment.discord) { discordIndex = inputCount++; args.push('-i', segment.discord) }
      makeAudio(segment.discord ? `[${discordIndex}:a:0]` : null, 'd')
    }
    if (mic) {
      const present = segment.mic && fs.existsSync(segment.mic)
      let micIndex = -1
      if (present) { micIndex = inputCount++; args.push('-i', segment.mic!) }
      makeAudio(present ? `[${micIndex}:a:0]` : null, 'm', segment.micOffset)
    }
  }
  const concat = (prefix: string, outputLabel: string, video: boolean) => filters.push(segments.length === 1
    ? `[${prefix}0]${video ? 'null' : 'anull'}[${outputLabel}]`
    : `${segments.map((_, i) => `[${prefix}${i}]`).join('')}concat=n=${segments.length}:v=${video ? 1 : 0}:a=${video ? 0 : 1}[${outputLabel}]`)
  if (!copyVideo) concat('v', 'video', true)
  for (const [present, prefix, destination] of [[game, 'g', audio.gameOutputPath], [mic, 'm', audio.micOutputPath], [discord, 'd', audio.discordOutputPath], [desktop, 's', audio.desktopOutputPath]] as const) {
    if (!present) continue
    concat(prefix, `${prefix}joined`, false)
    filters.push(destination ? `[${prefix}joined]asplit=2[${prefix}mix][${prefix}save]` : `[${prefix}joined]anull[${prefix}mix]`)
    if (desktop && (prefix === 'g' || prefix === 'd')) filters.push(`[${prefix}mix]anullsink`)
  }
  // Desktop already contains game and Discord. Save their independent tracks,
  // but use the desktop mix only once in the ready-to-share video.
  const mixInputs = [[game && !desktop,'g'],[mic,'m'],[discord && !desktop,'d'],[desktop,'s']].filter(([present])=>present).map(([,prefix])=>'['+prefix+'mix]')
  if(mixInputs.length) filters.push(mixInputs.join('')+(mixInputs.length>1?'amix=inputs='+mixInputs.length+':duration=longest:normalize=0,alimiter=limit=0.98:level=0:latency=1':'anull')+'[mix]')
  if (filters.length) args.push('-filter_complex', filters.join(';'))
  args.push('-map', copyVideo ? '0:v:0' : '[video]')
  if (game || mic || discord || desktop) args.push('-map', '[mix]')
  const encode = (encoder: string) => {
    const webm = options.format === 'webm'
    const command = [...args, ...(copyVideo ? ['-c:v','copy'] : ['-c:v', webm ? 'libvpx-vp9' : encoder,
      ...(webm ? ['-deadline','realtime','-cpu-used','5','-b:v',`${bitrate}M`] : encoder === 'libx264'
        ? ['-preset','veryfast','-b:v',`${bitrate}M`] : encoder === 'h264_nvenc'
          ? ['-preset','p2','-rc','vbr','-b:v',`${bitrate}M`] : ['-b:v',`${bitrate}M`]),
      '-maxrate',`${bitrate * 1.25}M`,'-bufsize',`${bitrate * 2}M`,'-pix_fmt','yuv420p',
      '-fps_mode','vfr']),
      '-c:a',webm ? 'libopus' : 'aac','-b:a','160k','-t',String(duration),
      ...(options.format === 'mp4' ? ['-movflags','+faststart'] : []), output]
    for (const [present, prefix, destination] of [[game, 'g', audio.gameOutputPath], [mic, 'm', audio.micOutputPath], [discord, 'd', audio.discordOutputPath], [desktop, 's', audio.desktopOutputPath]] as const) {
      if (present && destination) command.push('-map',`[${prefix}save]`,'-c:a','aac','-b:a','160k','-t',String(duration),'-movflags','+faststart',destination)
    }
    return command
  }
  const encoder = copyVideo || options.format === 'webm' ? 'libx264' : typeof options.encoder === 'function' ? await options.encoder() : options.encoder
  try { await run(ffmpeg, encode(encoder)) }
  catch (error) {
    if (copyVideo) return encodeReplay(ffmpeg,input,output,{...options,allowVideoCopy:false,inputFacts:{current,previous:previous||undefined}})
    if (encoder === 'libx264' || options.format === 'webm') throw error
    console.warn('[Clips] Hardware encoder unavailable; retrying the same timeline with software encoding')
    await run(ffmpeg, encode('libx264'))
  }
  const result = await inspectMedia(ffmpeg, output)
  if (copyVideo && (result.frames !== current.frames || Math.abs(result.duration-current.duration) > .05 || result.width !== width || result.height !== height)) {
    return encodeReplay(ffmpeg,input,output,{...options,allowVideoCopy:false,inputFacts:{current,previous:previous||undefined}})
  }
  if (!result.hasVideo || result.width !== width || result.height !== height || !result.frames || result.duration < Math.min(.1, duration)) throw new Error('Encoded clip failed media validation')
  return { ...result, videoCopied: copyVideo }
}

export async function extractWaveform(ffmpeg: string, file: string, duration: number, points = 240): Promise<number[]> {
  const samples = Math.max(64, Math.round(duration * 8000 / points))
  const { stdout } = await run(ffmpeg, ['-v','error','-i',file,'-map','0:a:0','-af',`aformat=channel_layouts=mono,aresample=8000,asetnsamples=n=${samples}:p=1,astats=metadata=1:reset=1,ametadata=print:key=lavfi.astats.Overall.Peak_level:file=-`,'-f','null','-'], 30_000)
  return [...stdout.matchAll(/lavfi\.astats\.Overall\.Peak_level=(-?inf|[-\d.]+)/g)].slice(0, points).map(match => {
    const db = Number(match[1]); return Number.isFinite(db) ? Math.max(0, Math.min(1, 10 ** (db / 20))) : 0
  })
}

export async function exportEditedClip(ffmpeg: string, source: string, output: string, options: {
  start: number; end?: number; cuts?: ClipRange[]; output?: 'source' | 'portrait' | 'square'; cropX?: number; maxBytes?: number
  encoder?: string | (() => Promise<string>)
  gameFile?: string; micFile?: string; discordFile?: string; desktopFile?: string; separate: boolean; gameVolume: number; micVolume: number; discordVolume?: number; desktopVolume?: number
}): Promise<void> {
  const facts = await inspectMedia(ffmpeg, source)
  const start = Math.max(0, options.start), end = Math.min(facts.duration, options.end ?? facts.duration)
  const ranges = clipKeptRanges({ start, end, cuts: options.cuts })
  const duration = ranges.reduce((sum, range) => sum + range.end - range.start, 0)
  if (!facts.hasVideo || duration < .02 || start >= facts.duration || ranges.length > 101 || ranges.some(range => range.end > facts.duration + .02 || range.end <= range.start)) throw new Error('Invalid clip selection')
  const webm = output.toLowerCase().endsWith('.webm'), mp4 = output.toLowerCase().endsWith('.mp4')
  const limited = options.maxBytes !== undefined
  if (limited && (!Number.isSafeInteger(options.maxBytes) || options.maxBytes! < 1_000_000 || options.maxBytes! > 100_000_000)) throw new Error('Invalid export size limit')
  const tracks = options.separate
    ? [{ file: options.gameFile, volume: options.gameVolume }, { file: options.micFile, volume: options.micVolume }, { file: options.discordFile, volume: options.discordVolume ?? (options.desktopFile ? 0 : 1) }, { file: options.desktopFile, volume: options.desktopVolume ?? 1 }]
    : [{ file: facts.hasAudio ? source : undefined, volume: options.gameVolume }]
  const unchangedMix = options.separate
    ? (!options.gameFile || options.gameVolume === (options.desktopFile ? 0 : 1))
      && (!options.micFile || options.micVolume === 1)
      && (!options.discordFile || (options.discordVolume ?? (options.desktopFile ? 0 : 1)) === (options.desktopFile ? 0 : 1))
      && (!options.desktopFile || (options.desktopVolume ?? 1) === 1)
    : options.gameVolume === 1
  const sameContainer = mp4 && source.toLowerCase().endsWith('.mp4') && facts.videoCodec === 'h264' && (!facts.hasAudio || facts.audioCodec === 'aac')
    || webm && source.toLowerCase().endsWith('.webm') && ['vp8','vp9','av1'].includes(facts.videoCodec) && (!facts.hasAudio || ['opus','vorbis'].includes(facts.audioCodec||''))
  if (limited && sameContainer
    && start === 0 && end === facts.duration && ranges.length === 1 && (!options.output || options.output === 'source')
    && unchangedMix && facts.fileSize <= options.maxBytes!) {
    await fs.promises.copyFile(source, output)
    return
  }
  const inputs = ['-y','-i',source], audioInputs: { index: number; volume: number }[] = []
  let inputIndex = 1
  for (const track of tracks) {
    if (!track.file) continue
    const index = track.file === source ? 0 : inputIndex++
    if (index) inputs.push('-i', track.file)
    audioInputs.push({ index, volume: track.volume })
  }
  const shape = options.output || 'source', ratio = shape === 'portrait' ? 9/16 : shape === 'square' ? 1 : facts.width/facts.height
  const cropWidth = Math.floor(Math.min(facts.width, facts.height*ratio)/2)*2
  const cropHeight = Math.floor(Math.min(facts.height, facts.width/ratio)/2)*2
  const audioRate = 192_000
  const targetBytes = limited ? Math.floor(options.maxBytes! * .992) : 0
  const containerReserve = limited ? Math.ceil(options.maxBytes! * .001) + 8192 : 0
  let videoRate = limited ? Math.floor((targetBytes - containerReserve) * 8 / duration - (audioInputs.length ? audioRate : 0)) : 0
  if (limited && videoRate < 60_000) throw new Error('This selection is too long for the size limit. Shorten the clip.')
  const maximum = shape === 'portrait' ? 1920 : 1080
  const factor = Math.min(1, maximum / cropHeight, (shape === 'portrait' ? 1080 : 3840) / cropWidth)
  // Do not reduce the resolution of an already-small recording, including
  // when it needs a frame-accurate trim. Unchanged MP4s were copied above.
  let [width,height]:[number,number] = limited
    ? facts.fileSize<=options.maxBytes! ? [cropWidth,cropHeight] : fitUploadDimensions(cropWidth,cropHeight,videoRate,Math.max(facts.fps,facts.averageFps))
    : [Math.max(2,Math.floor(cropWidth*factor/2)*2),Math.max(2,Math.floor(cropHeight*factor/2)*2)]
  const cropX = Math.round((facts.width-cropWidth)*Math.max(0,Math.min(1,options.cropX ?? .5))/2)*2
  let encoder:string|undefined
  const resolveEncoder=async()=>{
    const value=limited&&!webm&&options.encoder?typeof options.encoder==='function'?await options.encoder():options.encoder:'libx264'
    return ['libx264','h264_nvenc','h264_amf','h264_qsv'].includes(value)?value:'libx264'
  }
  if(limited&&!webm&&facts.fileSize>options.maxBytes!&&duration>=5){
    const fullFactor=Math.min(1,1920/cropWidth,1080/cropHeight)
    const full:[number,number]=[Math.max(2,Math.floor(cropWidth*fullFactor/2)*2),Math.max(2,Math.floor(cropHeight*fullFactor/2)*2)]
    if(width!==full[0]||height!==full[1]){
      encoder=await resolveEncoder()
      if(encoder!=='libx264')[width,height]=await chooseUploadDimensions({source,cropWidth,cropHeight,cropX,fps:Math.max(facts.fps,facts.averageFps,24),rate:videoRate,encoder,ranges,full,suggested:[width,height]},(args,timeout)=>run(ffmpeg,args,timeout))
    }
  }
  const transformed = ranges.length !== 1 || start > .001 || end < facts.duration-.02 || shape !== 'source' || limited
  const filters: string[] = [], audioLabels: string[] = []
  if (transformed) {
    const select = ranges.map(range => `gte(t,${range.start})*lt(t,${range.end})`).join('+')
    let cursor = start, removed = ''
    for (const range of ranges) {
      if (range.start > cursor) removed += `-(${range.start-cursor})/TB*gte(PTS*TB,${range.start})`
      cursor = range.end
    }
    // Shift source timestamps by the removed durations instead of accumulating
    // independently rounded video-segment lengths against sample-accurate audio.
    // A stalled capture may have no frame at the cut's exact start. Show the
    // first retained frame at zero; keep later timestamps and audio unchanged.
    filters.push(`[0:v:0]trim=start=${start}:end=${end},select='${select}',setpts='if(eq(N,0),0,PTS-${start}/TB${removed})',crop=${cropWidth}:${cropHeight}:${cropX}:(ih-oh)/2,scale=${width}:${height},setsar=1[video]`)
  }
  for (const [i, range] of ranges.entries()) {
    const mix: string[] = []
    for (const [j, track] of audioInputs.entries()) {
      const label = 'a'+i+'_'+j
      filters.push('['+track.index+':a:0]atrim=start='+range.start+':end='+range.end+',asetpts=PTS-STARTPTS,aresample=48000,aformat=channel_layouts=stereo,volume='+track.volume+',apad,atrim=duration='+(range.end-range.start)+'['+label+']')
      mix.push('['+label+']')
    }
    if(mix.length) {
      filters.push(mix.join('')+(mix.length>1?'amix=inputs='+mix.length+':duration=longest:normalize=0,alimiter=limit=.98:level=0:latency=1':'anull')+'[m'+i+']')
      audioLabels.push('[m'+i+']')
    }
  }
  if(audioLabels.length) filters.push(audioLabels.join('')+(ranges.length>1?'concat=n='+ranges.length+':v=0:a=1':'anull')+'[audio]')
  const base = [...inputs,...(filters.length?['-filter_complex',filters.join(';')]:[]),'-map',transformed?'[video]':'0:v:0',...(audioLabels.length?['-map','[audio]']:[])]
  if (limited && mp4 && facts.videoCodec === 'h264' && ranges.length === 1 && start === 0 && end === facts.duration && shape === 'source'
    && facts.fileSize <= options.maxBytes!) {
    // Already-small compatible clips keep their original video bytes. Audio
    // edits still use the same mix; copying must never bypass a muted track.
    const audioFilters = filters.slice(1)
    await run(ffmpeg, [...inputs,...(audioFilters.length ? ['-filter_complex',audioFilters.join(';')] : []),
      '-map','0:v:0',...(audioLabels.length ? ['-map','[audio]'] : []),'-c:v','copy','-c:a','aac','-b:a','192k',
      '-t',String(duration),'-movflags','+faststart',output])
    const result = await inspectMedia(ffmpeg, output)
    if (result.hasVideo && result.frames === facts.frames && Math.abs(result.duration-duration) <= .02 && result.fileSize <= options.maxBytes!) return
  }
  let passDirectory: string | undefined
  encoder ??= await resolveEncoder()
  const threads = String(Math.max(2, Math.min(8, os.availableParallelism() - 2)))
  let twoPass = limited && !webm && encoder === 'libx264' && facts.bitrate * duration / 8 > targetBytes
  try {
    for (let attempt = 0; attempt < (limited ? 3 : 1); attempt++) {
      let pass: string[] = []
      if (twoPass) {
        // Analyze video alone; do not decode/mix the independent audio tracks
        // twice. A private directory also isolates concurrent clip exports.
        if (!passDirectory) {
          passDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'eclipse-clip-pass-'))
          const log = path.join(passDirectory, 'video')
          await run(ffmpeg, ['-y','-i',source,'-filter_complex',filters[0],'-map','[video]',
            '-c:v','libx264','-preset','fast','-threads',threads,'-b:v',String(videoRate),
            '-pix_fmt','yuv420p','-fps_mode','vfr','-pass','1','-passlogfile',log,
            '-an','-t',String(duration),'-f','null','-'])
        }
        pass = ['-pass','2','-passlogfile',path.join(passDirectory, 'video')]
      }
      const encoding = !transformed ? ['-c:v','copy'] : webm
        ? ['-c:v','libvpx-vp9','-deadline','realtime',...(limited ? ['-b:v',String(videoRate)] : ['-crf','24','-b:v','0'])]
        : encoder !== 'libx264'
          ? uploadHardwareEncoding(encoder,videoRate)
          : ['-c:v','libx264','-preset',limited ? 'fast' : 'veryfast','-threads',threads,
            ...(twoPass ? ['-b:v',String(videoRate),...pass] : ['-crf',limited ? '18' : '20'])]
      try {
        await run(ffmpeg,[...base,...encoding,...(transformed?['-pix_fmt','yuv420p','-fps_mode','vfr']:[]),'-c:a',webm?'libopus':'aac','-b:a','192k','-t',String(duration),...(mp4?['-movflags','+faststart']:[]),output])
      } catch (error) {
        if (encoder === 'libx264' || webm || /ENOSPC|no space|not enough space|permission denied|access (?:is )?denied/i.test(String(error))) throw error
        console.warn('[Clips] GPU export unavailable; retrying the same edit with CPU encoding')
        encoder = 'libx264'; twoPass = true; attempt--; continue
      }
      const result = await inspectMedia(ffmpeg,output)
      if (!result.hasVideo || Math.abs(result.duration-duration)>Math.max(.2,duration*.02) || transformed&&(result.width!==width||result.height!==height)) throw new Error('Exported clip failed media validation')
      if (!limited || result.fileSize <= options.maxBytes!) return
      if (twoPass || webm || encoder !== 'libx264') {
        const measuredAudioBytes = audioLabels.length ? audioRate * duration / 8 : 0
        videoRate = Math.floor(videoRate * (targetBytes - measuredAudioBytes) / Math.max(1, result.fileSize - measuredAudioBytes) * .995)
        if (videoRate < 60_000) break
      }
      twoPass = !webm && encoder === 'libx264'
    }
    throw new Error('The encoded clip exceeds the size limit. Shorten the selection.')
  } finally {
    if (passDirectory) fs.rmSync(passDirectory, { recursive: true, force: true })
  }
}
