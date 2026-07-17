// Add this import at the top
import { setupWebSocketServer } from './websocket/wsServer'

// Replace the httpServer.listen block at the bottom with this:
async function bootstrap() {
  // ... all existing code stays exactly the same ...

  const httpServer = createServer(app)

  // Attach WebSocket server to the same HTTP server
  // Both GraphQL (HTTP) and WebSocket share port 4000
  setupWebSocketServer(httpServer)

  const port = parseInt(env.PORT)
  httpServer.listen(port, () => {
    console.log(`🚀 GraphQL:   http://localhost:${port}/graphql`)
    console.log(`🔌 WebSocket: ws://localhost:${port}/ws`)
    console.log(`🏥 Health:    http://localhost:${port}/health`)
    console.log(`🌍 Env:       ${env.NODE_ENV}`)
  })
}