import { NextApiRequest, NextApiResponse } from 'next'

// Placeholder webhook endpoint for Flutterwave
// Configure your Flutterwave webhook to POST here and handle event verification
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end()
  // TODO: verify signature/encryption per Flutterwave docs
  const event = req.body
  console.log('Received Flutterwave webhook:', event)
  // TODO: handle payment.success, transfer.success, etc.
  res.status(200).json({ received: true })
}
