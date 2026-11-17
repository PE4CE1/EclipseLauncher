import { useTranslation } from './hooks/useTranslation'
import { useLaunchOverlay } from './components/splash/LaunchOverlay'

export default function LaunchPreview() {
  const { t } = useTranslation()
  useLaunchOverlay({ message: t('uiLaunchMessage') })
  return null
}
