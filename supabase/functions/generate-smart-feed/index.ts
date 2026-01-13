import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1"
import { Configuration, OpenAIApi } from "https://esm.sh/openai@3.2.1"

interface FeedRequest {
  user_id: string;
  user_lat?: number;
  user_long?: number;
}

serve(async (req) => {
  try {
    const { user_id, user_lat, user_long } = await req.json() as FeedRequest;

    // 1. SETUP
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );
    const openai = new OpenAIApi(new Configuration({ apiKey: Deno.env.get('OPENAI_API_KEY') }));

    // 2. FETCH CONTEXT (Profile, Friends, Ads)
    const [profileRes, friendsRes, adsRes] = await Promise.all([
      supabase.from('profiles').select('*').eq('user_id', user_id).single(),
      supabase.from('friendships').select('addressee_id, requester_id').eq('status', 'accepted').or(`requester_id.eq.${user_id},addressee_id.eq.${user_id}`),
      supabase.from('advertisements').select('*, social_posts(*, profiles(*))').eq('is_active', true).limit(5)
    ]);

    const profile = profileRes.data;
    const ads = adsRes.data || [];
    
    // Flatten friend IDs for priority checking
    const friendIds = friendsRes.data?.map((f: any) => 
      f.requester_id === user_id ? f.addressee_id : f.requester_id
    ) || [];

    let feedData: any[] = [];
    let eventsData: any[] = [];

    // --- 3. LOGIC FORK ---

    if (!profile.is_premium) {
      // ============================================================
      // 👤 STANDARD USER: ENTIRE FEED (NO PERSONALIZATION)
      // ============================================================
      // Requirement: "regular users should see the entire feed with no personalizations"
      
      const { data: posts } = await supabase
        .from('social_posts')
        .select(`*, profiles(display_name, avatar_url, badge_type, is_premium)`)
        .order('created_at', { ascending: false }) // Strictly Chronological
        .limit(40);

      const { data: events } = await supabase
        .from('events')
        .select('*')
        .gt('start_date', new Date().toISOString())
        .order('created_at', { ascending: false }) // Strictly Chronological
        .limit(10);

      feedData = posts || [];
      eventsData = events || [];

    } else {
      // ============================================================
      // 💎 PREMIUM USER: AI PERSONALIZATION + PRIORITY + WIDER COVERAGE
      // ============================================================
      
      // A. Generate Embedding from Interests
      const inputContext = `Interests: ${profile.interests?.join(', ')}. Propensity: ${profile.travel_propensity || 'High'}.`;
      const embeddingResponse = await openai.createEmbedding({
        model: 'text-embedding-3-small',
        input: inputContext,
      });
      const userVector = embeddingResponse.data.data[0].embedding;

      // B. Fetch Content with Priority Logic
      // We fetch more content to sort it intelligently
      const { data: rawPosts } = await supabase
        .from('social_posts')
        .select(`*, profiles(display_name, avatar_url, badge_type, is_premium)`)
        .order('created_at', { ascending: false })
        .limit(100);

      if (rawPosts) {
        // C. Intelligent Scoring Algorithm
        feedData = rawPosts.map((post: any) => {
          let score = 0;
          const isFriend = friendIds.includes(post.user_id);
          const isPremiumAuthor = post.profiles?.is_premium;
          const isBoosted = post.boost_multiplier > 1;

          // Priority Weights
          if (isBoosted) score += 50;           // Paid Boost Priority
          if (isFriend) score += 30;            // Connection Priority
          if (isPremiumAuthor) score += 10;     // Premium Author Priority
          
          // Recency Decay (Keep feed fresh)
          const hoursOld = (Date.now() - new Date(post.created_at).getTime()) / (1000 * 60 * 60);
          score -= hoursOld * 0.5; 

          return { ...post, sortScore: score };
        }).sort((a: any, b: any) => b.sortScore - a.sortScore).slice(0, 40); // Top 40 relevant
      }

      // D. "Wider Coverage" Event Search (AI + Radius)
      // Uses propensity to decide how far to look
      const searchRadius = (profile.travel_propensity || 0.5) * 500; // up to 500km for high propensity

      const { data: aiEvents } = await supabase.rpc('match_content_smart', {
        query_embedding: userVector,
        user_lat: user_lat || null,
        user_long: user_long || null,
        travel_radius_km: searchRadius, // WIDER COVERAGE logic
        match_threshold: 0.60
      });
      
      eventsData = aiEvents || [];
    }

    // --- 4. AD & BANNER INJECTION ---
    // Inject ads every 6th post for visibility
    const finalFeed: any[] = [];
    let adIndex = 0;

    feedData.forEach((item, index) => {
      // Inject Ad
      if (index > 0 && index % 6 === 0 && ads[adIndex]) {
        // Map Ad to Post structure for seamless UI
        finalFeed.push({
          id: `ad-${ads[adIndex].id}`,
          post_type: 'ad',
          content: ads[adIndex].social_posts?.content,
          image_url: ads[adIndex].social_posts?.image_url,
          profiles: ads[adIndex].social_posts?.profiles,
          link_url: ads[adIndex].link_url,
          created_at: new Date().toISOString()
        });
        adIndex = (adIndex + 1) % ads.length;
      }
      finalFeed.push(item);
    });

    return new Response(JSON.stringify({ 
      success: true, 
      posts: finalFeed,
      events: eventsData,
      is_premium: profile.is_premium 
    }), { 
      headers: { 'Content-Type': 'application/json' } 
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
});
