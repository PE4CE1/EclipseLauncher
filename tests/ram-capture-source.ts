export {describeCaptureError} from '../src/services/captureErrors'
export async function requestDesktopStream(_id:unknown,fps:number,width:number,height:number):Promise<MediaStream>{
  const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height
  const context=canvas.getContext('2d')!,texture=document.createElement('canvas');texture.width=width;texture.height=height
  const pixels=context.createImageData(width,height),values=new Uint32Array(pixels.data.buffer)
  let seed=19
  for(let i=0;i<values.length;i++){seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;values[i]=(seed>>>0)|0xff000000}
  texture.getContext('2d')!.putImageData(pixels,0,0)
  let frame=0
  const draw=()=>{const x=frame++%width;context.drawImage(texture,x,0);context.drawImage(texture,x-width,0);context.fillStyle='#ef8f46';context.fillRect(frame%width,40,140,140)}
  draw()
  const stream=canvas.captureStream(fps),track=stream.getVideoTracks()[0],stop=track.stop.bind(track)
  const timer=setInterval(draw,1000/fps)
  track.stop=()=>{clearInterval(timer);canvas.width=1;canvas.height=1;texture.width=1;texture.height=1;stop()}
  return stream
}
