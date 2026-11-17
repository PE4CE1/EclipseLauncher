import { createRoot } from 'react-dom/client'
import { PosterArt } from '../src/components/shared/PosterArt'
import { SmartImage } from '../src/components/shared/SmartImage'
import { getNonSteamGame } from '../src/services/nonSteamGames'
import '../src/index.css'

function App() {
  return <main style={{ padding: 28, minHeight: '100vh', background: '#0d0c0c', color: '#fff', fontFamily: 'Inter, sans-serif' }}>
    <h1 style={{ fontSize: 24, fontWeight: 650, marginBottom: 24 }}>Installed games · Epic & Riot</h1>
    {['Fortnite', 'VALORANT'].map(name => {
      const game = getNonSteamGame(name)!
      const identity = { id: game.id, name, platform: 'custom' as const, steamId: 12345, iconUrl: 'https://invalid.test/old-artwork.jpg' }
      return <section key={name} data-game={game.id} style={{ display: 'grid', gridTemplateColumns: '150px 1fr', gap: 24, marginBottom: 28 }}>
        <div data-poster style={{ height: 225, borderRadius: 10, overflow: 'hidden' }}><PosterArt game={identity} /></div>
        <div style={{ position: 'relative', overflow: 'hidden', borderRadius: 10, height: 225 }}>
          <div data-hero style={{ position: 'absolute', inset: 0 }}><SmartImage type="hero" appId={12345} alt={name} /></div>
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(90deg, #080808f2, #08080855 65%, transparent)', pointerEvents: 'none' }} />
          <div style={{ position: 'absolute', bottom: 24, left: 24, maxWidth: 430 }}><small style={{ color: '#aaa' }}>{game.publisher}</small><h2 style={{ fontSize: 26, fontWeight: 700, margin: '5px 0 10px' }}>{name}</h2><p style={{ fontSize: 13, color: '#ccc', lineHeight: 1.5 }}>{game.description.en}</p></div>
        </div>
      </section>
    })}
  </main>
}
createRoot(document.getElementById('root')!).render(<App />)
