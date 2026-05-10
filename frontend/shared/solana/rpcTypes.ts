export type RpcResponseError = {
  id: unknown
  jsonrpc: string
  error: {
    code: number
    message: string
  }
}
export type RpcResponseSuccess<T> = {
  id: unknown
  jsonrpc: string
  result: T
}
export type RpcResponse<T> = RpcResponseError | RpcResponseSuccess<T>
