import { useEffect } from 'react'

export function usePageMeta(title: string, description: string) {
  useEffect(() => {
    document.title = `${title} | Meridion Marketplace`
    const descriptionTag = document.querySelector<HTMLMetaElement>('meta[name="description"]')
    if (descriptionTag) descriptionTag.content = description
    const ogTitle = document.querySelector<HTMLMetaElement>('meta[property="og:title"]')
    if (ogTitle) ogTitle.content = `${title} | Meridion Marketplace`
    const ogDescription = document.querySelector<HTMLMetaElement>('meta[property="og:description"]')
    if (ogDescription) ogDescription.content = description
  }, [title, description])
}
