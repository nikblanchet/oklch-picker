import { generateKeyPair } from '../lib/crypto.ts'

const { privateKey, publicKey } = await generateKeyPair()

console.log(`Public key: add it to .env.local and to the Vercel project

  VITE_CONTEST_PUBLIC_KEY=${publicKey}

Private key: save it in your password manager and nowhere else. The admin
login asks for it. If it is lost, contact details cannot be recovered.

  ${privateKey}
`)
