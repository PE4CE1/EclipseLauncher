import { useQuery } from '@tanstack/react-query'
import { fetchLatestLauncherRelease, fetchLauncherReleaseHistory } from '../services/launcherReleases'
const options={staleTime:5*60_000,refetchOnWindowFocus:false,retry:false as const}
export const useLatestLauncherRelease=()=>useQuery({...options,queryKey:['launcher-release','latest'],queryFn:({signal})=>fetchLatestLauncherRelease(signal)})
export const useLauncherReleaseHistory=()=>useQuery({...options,queryKey:['launcher-release','history'],queryFn:({signal})=>fetchLauncherReleaseHistory(signal)})
