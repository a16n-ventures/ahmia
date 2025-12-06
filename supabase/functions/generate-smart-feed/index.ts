// File: supabase/functions/generate-smart-feed/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1"
import { Configuration, OpenAIApi } from "https://esm.sh/openai@3.2.1"

serve(async (req) => {
  const { user_id, user_lat, user_long } = await req.json()

  // 1. Setup Clients
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  )
  const openai = new OpenAIApi(new Configuration({ apiKey: Deno.env.get('OPENAI_API_KEY') }))

  // 2. Fetch User Profile (Interests & Propensity)
  const { data: profile } = await supabase
    .from('profiles')
    .select('interests, travel_propensity, is_premium')
    .eq('id', user_id)
    .single()

  // 3. Logic Fork: Premium vs Standard
  if (!profile.is_premium) {
    // Standard User: Return basic feed (sorted by date + boost only)
    const { data: basicFeed } = await supabase
      .from('events')
      .select('id, title, start_date, boost_multiplier')
      .gt('start_date', new Date().toISOString())
      .order('boost_multiplier', { ascending: false }) // Boosted events first
      .order('start_date', { ascending: true })
      .limit(20)
    
    return new Response(JSON.stringify(basicFeed), { headers: { 'Content-Type': 'application/json' } })
  }

  // 4. Premium Logic: Generate Embedding for User Interests
  // We turn text like "I love tech and jazz" into a vector
  const embeddingResponse = await openai.createEmbedding({
    model: 'text-embedding-3-small',
    input: profile.interests?.join(' ') || 'general events',
  })
  const userVector = embeddingResponse.data.data[0].embedding

  // 5. Call the Database Matching Engine
  const { data: smartFeed, error } = await supabase.rpc('match_events_smart', {
    query_embedding: userVector,
    user_lat: user_lat,
    user_long: user_long,
    match_threshold: 0.7, // Minimum 70% match relevance
    match_count: 30,
    travel_propensity: profile.travel_propensity || 0.1
  })

  if (error) console.error(error)

  return new Response(JSON.stringify(smartFeed), { 
    headers: { 'Content-Type': 'application/json' } 
  })
})
