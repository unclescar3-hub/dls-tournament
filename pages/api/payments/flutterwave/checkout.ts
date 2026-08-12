import { NextApiRequest, NextApiResponse } from 'next'

// Placeholder checkout endpoint for Flutterwave integration
// Expects { tournamentId, userId } in body and returns a payment reference/url
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end()
  const { tournamentId, userId } = req.body
  // TODO: create a Flutterwave payment session server-side using your keys
  // For now return a fake reference and instruct to replace with real integration
  return res.status(200).json({
    reference: `FLW_REF_${Date.now()}`,
    message: 'Replace this endpoint with real Flutterwave checkout integration'
  })
}
