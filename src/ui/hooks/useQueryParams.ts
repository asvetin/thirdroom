import { useLocation } from "react-router-dom";

export function useQueryParams() {
  const { search, hash } = useLocation()
  const allParams = []
  if (search !== undefined && search.length > 0) {
    allParams.push(...new URLSearchParams(search).entries())
  }
  if (hash !== undefined && hash.length > 1) {
    allParams.push(...new URLSearchParams(hash.substring(1)).entries())
  }

  return allParams.reduce<Record<string, string>>((acc, [k,v]) => {
    acc[k] = v

    return acc
  }, {})
}


