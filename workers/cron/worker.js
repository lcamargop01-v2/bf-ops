// BF Ops Cron Worker
// Triggers daily inventory snapshot at 6:30 PM Eastern (22:30 UTC / 23:30 UTC depending on DST)
// Deployed as a separate Cloudflare Worker with cron trigger

export default {
  async scheduled(controller, env, ctx) {
    const startTime = Date.now()
    console.log(`[bf-ops-cron] Triggered at ${new Date().toISOString()} (scheduledTime: ${new Date(controller.scheduledTime).toISOString()})`)

    try {
      const response = await fetch(`${env.BF_OPS_URL}/api/inventory/snapshot`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Cron-Secret': env.CRON_SECRET
        },
        body: JSON.stringify({})
      })

      const data = await response.json()
      const elapsed = Date.now() - startTime

      if (response.ok) {
        console.log(`[bf-ops-cron] Snapshot success in ${elapsed}ms:`, JSON.stringify(data))
      } else {
        console.error(`[bf-ops-cron] Snapshot failed (${response.status}) in ${elapsed}ms:`, JSON.stringify(data))
      }
    } catch (err) {
      console.error(`[bf-ops-cron] Fetch error:`, err.message || err)
    }
  },

  // Optional: health check via HTTP
  async fetch(request, env) {
    const url = new URL(request.url)
    if (url.pathname === '/health') {
      return new Response(JSON.stringify({
        status: 'ok',
        worker: 'bf-ops-cron',
        target: env.BF_OPS_URL,
        timestamp: new Date().toISOString()
      }), { headers: { 'Content-Type': 'application/json' } })
    }

    // Allow manual trigger via POST /trigger (with secret)
    if (url.pathname === '/trigger' && request.method === 'POST') {
      const secret = request.headers.get('X-Cron-Secret')
      if (secret !== env.CRON_SECRET) {
        return new Response('Unauthorized', { status: 401 })
      }

      try {
        const response = await fetch(`${env.BF_OPS_URL}/api/inventory/snapshot`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Cron-Secret': env.CRON_SECRET
          },
          body: JSON.stringify({})
        })
        const data = await response.json()
        return new Response(JSON.stringify(data), {
          status: response.status,
          headers: { 'Content-Type': 'application/json' }
        })
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        })
      }
    }

    return new Response('bf-ops-cron worker', { status: 200 })
  }
}
