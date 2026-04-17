import { useState } from 'react'
import { getWebSocketUrl, testWebSocketConnection } from './lib/websocket'
// import Versions from './components/Versions'

function App(): React.JSX.Element {
  const [isTesting, setIsTesting] = useState(false)
  const [wsMessage, setWsMessage] = useState<string | null>(null)
  const [wsError, setWsError] = useState<string | null>(null)
  const websocketTarget = (() => {
    try {
      return getWebSocketUrl()
    } catch (error) {
      return error instanceof Error ? error.message : 'Unable to resolve WebSocket URL'
    }
  })()

  const handleWebSocketTest = async (): Promise<void> => {
    setIsTesting(true)
    setWsMessage(null)
    setWsError(null)

    try {
      const response = await testWebSocketConnection()
      setWsMessage(response)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'WebSocket test failed'
      setWsError(errorMessage)
    } finally {
      setIsTesting(false)
    }
  }

  return (
    <>
      <h1>Corg</h1>
      {/* <Versions></Versions> */}
      <p>WebSocket target: {websocketTarget}</p>
      <button onClick={handleWebSocketTest} disabled={isTesting}>
        {isTesting ? 'Testing WebSocket...' : 'Test WebSocket Connection'}
      </button>
      {wsMessage ? <p>{wsMessage}</p> : null}
      {wsError ? <p>{wsError}</p> : null}
    </>
  )
}

export default App
