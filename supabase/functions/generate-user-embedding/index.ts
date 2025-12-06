import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1"
import { Configuration, OpenAIApi } from "https://esm.sh/openai@3.2.1"

serve(async (req) => {
  const { user_id, interests } = await req.json()

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  )
  const openai = new OpenAIApi(new Configuration({ apiKey: Deno.env.get('OPENAI_API_KEY') }))

  // Convert tags array to a sentence for better semantic understanding
  const input = `User is interested in: ${interests.join(', ')}.`

  // Generate Vector
  const embeddingResponse = await openai.createEmbedding({
    model: 'text-embedding-3-small',
    input: input,
  })
  const vector = embeddingResponse.data.data[0].embedding

  // Save to Profile
  const { error } = await supabase
    .from('profiles')
    .update({ 
      interest_embedding: vector,
      updated_at: new Date().toISOString()
    })
    .eq('id', user_id)

  if (error) return new Response(JSON.stringify({ error }), { status: 500 })

  return new Response(JSON.stringify({ success: true }), { 
    headers: { 'Content-Type': 'application/json' } 
  })
})
