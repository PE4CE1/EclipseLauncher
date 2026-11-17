import { useId } from 'react'

export const PROFILE_BANNERS = [
  { id:'solar', de:'Sonnenfinsternis', en:'Solar eclipse' },
  { id:'ridge', de:'Abendberge', en:'Evening ridge' },
  { id:'carbon', de:'Carbon', en:'Carbon' },
  { id:'contour', de:'Konturen', en:'Contours' },
  { id:'aurora', de:'Nordlicht', en:'Northern light' },
  { id:'orbit', de:'Umlaufbahn', en:'Orbit' },
] as const
export const profileBannerPreset = (value?: string | null) => PROFILE_BANNERS.find(banner => value === `eclipse-banner:${banner.id}`)?.id

export function ProfileBannerArt({ preset = 'solar', className = '' }: { preset?: string; className?: string }) {
  const id = useId().replace(/:/g, '')
  const color = preset === 'aurora' ? '#487f76' : preset === 'orbit' ? '#647192' : '#bc7647'
  return <svg className={`profile-banner-art ${className}`} data-profile-banner={preset} viewBox="0 0 1200 340" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
    <defs><radialGradient id={`${id}glow`}><stop stopColor={color} stopOpacity=".55"/><stop offset="1" stopColor={color} stopOpacity="0"/></radialGradient><linearGradient id={`${id}sky`} x2="1" y2="1"><stop stopColor="#111318"/><stop offset=".65" stopColor={preset === 'aurora' ? '#192e30' : '#302015'}/><stop offset="1" stopColor="#0c0d10"/></linearGradient><linearGradient id={`${id}edge`}><stop stopColor={color} stopOpacity="0"/><stop offset=".6" stopColor={color} stopOpacity=".7"/><stop offset="1" stopColor="#e4b388" stopOpacity=".1"/></linearGradient></defs>
    <rect width="1200" height="340" fill={`url(#${id}sky)`}/>
    {preset === 'solar' && <><ellipse cx="850" cy="115" rx="400" ry="250" fill={`url(#${id}glow)`}/><circle cx="855" cy="115" r="118" fill="#0e0e10" stroke="#ce8c57" strokeWidth="1.4"/><path d="M742 150A118 118 0 0 1 972 104" fill="none" stroke="#f5c68e" strokeOpacity=".7" strokeWidth="3"/><circle cx="855" cy="115" r="164" fill="none" stroke="#d4a16d" strokeOpacity=".07"/></>}
    {preset === 'ridge' && <><ellipse cx="775" cy="195" rx="580" ry="260" fill={`url(#${id}glow)`}/><circle cx="780" cy="178" r="35" fill="#cf916c" opacity=".6"/><path d="M0 290L140 163L260 215L430 86L600 200L750 130L910 241L1070 119L1200 192V340H0Z" fill="#1a1c20"/><path d="M0 325L200 230L330 280L530 202L720 271L890 211L1040 285L1200 239V340H0Z" fill="#0e1217"/></>}
    {preset === 'carbon' && <><path d="M500-10H1200V350H130Z" fill="#191c21"/><path d="M800-10H1200V350H430Z" fill="#111316"/><path d="M1110-10H1200V350H740Z" fill="#242329"/><path d="M805-10L435 340" stroke={`url(#${id}edge)`} strokeWidth="2"/></>}
    {preset === 'contour' && <>{Array.from({length:11},(_,i)=><path key={i} d={`M-80 ${100+i*23}C250 ${330+i*8} 440 ${-100+i*19} 780 ${30+i*29}S1120 ${290+i*15} 1300 ${-60+i*28}`} fill="none" stroke={`url(#${id}edge)`} strokeWidth={i===5?2:1} opacity={i===5?.8:.24}/>)}</>}
    {preset === 'aurora' && <><ellipse cx="760" cy="90" rx="700" ry="290" fill={`url(#${id}glow)`}/><path d="M-100 210Q330-80 650 160T1300 60V0H-100Z" fill="#7ab7a6" opacity=".08"/><path d="M-80 240Q330-70 650 170T1300 100" fill="none" stroke="#7ab7a6" strokeOpacity=".24" strokeWidth="2"/><path d="M0 330L240 280L430 300L580 250L860 300L1100 270L1200 300V340H0Z" fill="#0d151a"/></>}
    {preset === 'orbit' && <><ellipse cx="865" cy="145" rx="400" ry="250" fill={`url(#${id}glow)`}/><g fill="none" stroke="#97a6c0" strokeOpacity=".19" transform="rotate(-25 830 140)"><ellipse cx="830" cy="140" rx="325" ry="92"/><ellipse cx="830" cy="140" rx="420" ry="135"/></g><circle cx="830" cy="140" r="63" fill="#141922" stroke="#8190a7" strokeOpacity=".38"/><circle cx="1099" cy="39" r="4" fill="#c9d1dd"/></>}
  </svg>
}
