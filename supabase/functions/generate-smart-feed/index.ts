import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1"

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const LAUNCH_ZONES = {
  ZARIA: {
    name: "Zaria",
    coords: { lat: 11.1500, long: 7.6500 },
    threshold: 500,
  },
  ABUJA: {
    name: "Abuja",
    coords: { lat: 9.0765, long: 7.3986 },
    threshold: 1000,
  },
};

function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; 
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { user_id, user_lat, user_long } = await req.json();
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    // 1. DETECT LOCATION
    let detectedCity = "Global mode";
    if (user_lat && user_long) {
      try {
        const geoRes = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${user_lat}&lon=${user_long}`,
          { headers: { 'User-Agent': 'Ahmia/1.0' } }
        );
        const geoData = await geoRes.json();
        detectedCity = geoData.address.city || geoData.address.town || geoData.address.village || "Global mode";
      } catch (e) { console.error("Geocoding failed", e); }
    }

    // 2. MATCH ZONE
    let activeZone = null;
    for (const zone of Object.values(LAUNCH_ZONES)) {
      if (user_lat && user_long) {
        const dist = calculateDistance(user_lat, user_long, zone.coords.lat, zone.coords.long);
        if (dist < 25) { activeZone = zone; break; }
      }
    }
  
    if (!activeZone && detectedCity !== "Global mode") {
      activeZone = Object.values(LAUNCH_ZONES).find(z => 
        detectedCity.toLowerCase().includes(z.name.toLowerCase())
      );
    }

    // 3. FETCH DATA (Crucial: This was missing!)
    // Get total users in this city/zone to show progress
    const { count: pioneerCount } = await supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true }); 
      // Note: You might want to filter by city in your DB: .ilike('city', `%${activeZone?.name || detectedCity}%`)

    // Fetch actual feed content
    const { data: eventsData } = await supabase.from('events').select('*').limit(10);
    const { data: communitiesData } = await supabase.from('communities').select('*').limit(5);

    // 4. LOCK LOGIC
    const targetThreshold = activeZone?.threshold || 500;
    const isCityLocked = activeZone 
      ? (pioneerCount || 0) < targetThreshold 
      : true; // Default to TRUE for "Coming Soon"

    const milestone = {
      current: pioneerCount || 0,
      target: targetThreshold,
      is_unlocked: !isCityLocked,
      zone_name: activeZone ? activeZone.name : (detectedCity !== "Global mode" ? detectedCity : "Your City")
    };
  
    return new Response(JSON.stringify({ 
      success: true, 
      events: eventsData || [], 
      communities: communitiesData || [],
      milestone,
      location_context: detectedCity, 
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders });
  }
});
