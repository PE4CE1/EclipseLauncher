import { HomePreview } from './HomePreview'
import { useHomeAutoRefresh } from './useHomeAutoRefresh'
import './home-preview.css'

export function HomeView() {
  useHomeAutoRefresh()
  return <div className="home-workspace" data-home-layout="preview">
    <HomePreview />
  </div>
}
