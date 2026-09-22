// Request-local keys are weakly held and cannot cross users or outlive requests.
const nonces = new WeakMap<Request, string>()
export function requestNonce(request: Request) {
  let nonce = nonces.get(request)
  if (!nonce) { nonce = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(24)))); nonces.set(request, nonce) }
  return nonce
}
