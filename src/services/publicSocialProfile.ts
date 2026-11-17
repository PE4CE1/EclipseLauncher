import { collection, doc, getDoc, getDocs, limit, query, where, type Firestore } from 'firebase/firestore'
import { publicProfileData } from './profileModel'

export async function findPublicSocialProfile(db: Firestore, identifier: string): Promise<({uid: string} & Record<string, any>) | null> {
  if (typeof identifier !== 'string') return null
  const raw = identifier.trim().replace(/^#/, '').replace(/[\s\u200B-\u200D\uFEFF]/g, '')
  if (!raw || raw.includes('/') || raw.length > 512) return null
  const code = raw.toUpperCase(), fullCode = code.startsWith('ECL-') ? code : `ECL-${code}`
  const lookup = async (field: string, value: string) => {
    const result = await getDocs(query(collection(db, 'users'), where('schemaVersion', '==', 2), where(field, '==', value), limit(2)))
    if (result.size > 1) throw Error('This friend code matches more than one account')
    const profile = result.docs[0]
    return profile ? publicProfileData({ ...profile.data(), uid: profile.id }) as {uid:string} & Record<string,any> : null
  }
  const byUid = async () => {
    try {
      const profile = await getDoc(doc(db,'users',raw))
      return profile.exists() && profile.data().schemaVersion === 2 ? publicProfileData({...profile.data(),uid:profile.id}) as {uid:string} & Record<string,any> : null
    } catch (reason: any) { if (reason?.code === 'permission-denied') return null; throw reason }
  }
  if (!code.startsWith('ECL-')) { const profile = await byUid(); if (profile) return profile }
  return await lookup('friendCode', fullCode) || await lookup('friendCode', code.replace(/^ECL-/, ''))
    || (code.startsWith('ECL-') ? await byUid() : null)
}
