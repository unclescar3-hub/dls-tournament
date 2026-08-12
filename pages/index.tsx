export default function Home() {
  return (
    <main style={{padding: 40, fontFamily: 'Inter, system-ui'}}>
      <h1>DLS Tournament - MVP scaffold</h1>
      <p>This repository has a Next.js + Prisma scaffold for the DLS tournament platform.</p>
      <ul>
        <li>Auth: NextAuth (email)</li>
        <li>Payments: Flutterwave placeholders</li>
        <li>Database: Prisma (Postgres)</li>
      </ul>
      <p>See README for setup instructions.</p>
    </main>
  )
}
