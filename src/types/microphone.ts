export interface NativeMicrophoneDevice { deviceId: string; label: string; default: boolean }
export interface NativeMicrophonePacket { id: string; sequence?: number; pcm?: Uint8Array; ended?: boolean }
export interface NativeMicrophoneAPI {
  list: () => Promise<{ supported: boolean; inputs: NativeMicrophoneDevice[] }>
  start: (id: string, deviceId: string) => Promise<void>
  stop: (id: string) => Promise<void>
  onData: (callback: (packet: NativeMicrophonePacket) => void) => () => void
}
