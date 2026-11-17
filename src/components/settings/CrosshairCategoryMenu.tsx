import { Select } from '../shared/Select'
import type { LibraryCategory } from '../../services/crosshairLibrary'

const DE: Record<string,string> = { Tactical:'Taktisch', Minimalist:'Minimalistisch', Animated:'Animiert', Funny:'Lustig', Experimental:'Experimentell', Utility:'Hilfsmittel', Educational:'Lernen', Green:'Grün', Red:'Rot', Cyan:'Cyan', White:'Weiß', Pink:'Pink', Yellow:'Gelb', Blue:'Blau', Purple:'Lila', Orange:'Orange', Black:'Schwarz', Multicolor:'Mehrfarbig', Dot:'Punkt', Circle:'Ring', Chevron:'Winkel', 'T-Shape':'T-Form', Shotgun:'Schrotflinte' }
export function CrosshairCategoryMenu({categories,value,de,change}:{categories:LibraryCategory[];value:string;de:boolean;change:(path:string)=>void}) {
  const groups=[{key:'style',label:de?'Stil':'Style'},{key:'game',label:de?'Spiel':'Game'},{key:'color',label:de?'Farbe':'Color'},{key:'collection',label:de?'Sammlungen':'Collections'}]
  return <div className="crosshair-category"><Select value={value} aria-label={de?'Kategorie':'Category'} menuClassName="crosshair-category-menu" triggerProps={{'data-crosshair-category-trigger':true}} onChange={event=>change(event.target.value)}>
    <option value="/crosshairs/all/" data-category-path="/crosshairs/all/">{de?'Alle Fadenkreuze':'All crosshairs'}</option>
    {groups.map(group=><optgroup label={group.label} key={group.key}>{categories.filter(item=>item.group===group.key).map(item=><option key={item.path} value={item.path} data-category-path={item.path}>{de?DE[item.name]||item.name:item.name}</option>)}</optgroup>)}
  </Select></div>
}
