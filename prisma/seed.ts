import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  // Create an example tournament
  const user = await prisma.user.upsert({
    where: { email: 'organizer@example.com' },
    update: {},
    create: { email: 'organizer@example.com', name: 'Organizer' }
  })

  const tournament = await prisma.tournament.create({
    data: {
      title: 'Sample DLS Tournament',
      slug: 'sample-dls-tournament',
      organizerId: user.id,
      entryFeeCents: 1000,
      currency: 'NGN',
      maxPlayers: 16,
      status: 'open'
    }
  })

  // seed some codes
  const codes = Array.from({ length: 20 }).map((_, i) => ({
    code: `DLSCODE-${1000 + i}`,
    tournamentId: tournament.id
  }))
  await prisma.gameCode.createMany({ data: codes })

  console.log('Seed complete')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
