import { useLocation } from "react-router-dom";

import { useQueryParams } from "./useQueryParams";

export type GiDLoginType = {
  access_token?: string
  error_description?: string
}

export function useGidLoginParams(): { access_token?: string; error_description?: string} {
  const params = useQueryParams()
  const { state } = useLocation()

  if (params !== undefined && params.state === 'gid_login') {
    return params
  }

  if (state != null) {
    const st = <{queryParams?: GiDLoginType & { state?: string } }>state
    if (st.queryParams !== undefined && st.queryParams.state === 'gid_login') {
      return st.queryParams
    }
  }

  return {}
}
