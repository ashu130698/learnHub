import { connectDatabase } from './config/database'
import redis from './config/redis'
import { authResolvers } from './graphql/resolvers/authResolvers'

async function main() {
  await connectDatabase()
  await redis.connect()

  // Verify resolver object structure is correct
  console.log('Auth mutations available:', Object.keys(authResolvers.Mutation))
  console.log('✅ Auth resolvers loaded')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})