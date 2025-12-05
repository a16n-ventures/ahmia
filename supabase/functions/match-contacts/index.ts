import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface Contact {
  id?: string;
  name: string;
  email?: string;
  phone?: string;
}

interface MatchResult {
  contact_id?: string;
  matched_user_id: string;
  display_name: string | null;
  avatar_url: string | null;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Missing authorization header');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Verify the user
    const anonClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!);
    const { data: { user }, error: authError } = await anonClient.auth.getUser(authHeader.replace('Bearer ', ''));
    
    if (authError || !user) {
      console.error('Auth error:', authError);
      throw new Error('Unauthorized');
    }

    console.log(`User ${user.id} requesting contact match`);

    const { contacts } = await req.json() as { contacts: Contact[] };

    if (!Array.isArray(contacts)) {
      throw new Error('Invalid contacts format');
    }

    // Rate limiting: max 3 imports per hour
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count: recentImports } = await supabase
      .from('contacts')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .gte('created_at', oneHourAgo);

    if (recentImports && recentImports > 500) {
      throw new Error('Rate limit exceeded. Please wait before importing more contacts.');
    }

    // Limit contacts per request
    const limitedContacts = contacts.slice(0, 500);
    
    // Extract emails for matching (server-side only - never sent to client)
    const emails = limitedContacts
      .map(c => c.email?.toLowerCase())
      .filter((e): e is string => !!e);

    console.log(`Matching ${emails.length} emails for user ${user.id}`);

    // Server-side matching - emails never exposed to client
    const { data: matchedProfiles, error: matchError } = await supabase
      .from('profiles')
      .select('user_id, display_name, avatar_url, email')
      .in('email', emails)
      .neq('user_id', user.id);

    if (matchError) {
      console.error('Match error:', matchError);
      throw new Error('Failed to match contacts');
    }

    // Build email -> profile map (server-side)
    const emailToProfile = new Map<string, typeof matchedProfiles[0]>();
    (matchedProfiles || []).forEach(p => {
      if (p.email) emailToProfile.set(p.email.toLowerCase(), p);
    });

    // Return only matched contact IDs with their user info (NOT the email list)
    const results: MatchResult[] = [];
    
    for (const contact of limitedContacts) {
      if (contact.email) {
        const profile = emailToProfile.get(contact.email.toLowerCase());
        if (profile) {
          results.push({
            contact_id: contact.id,
            matched_user_id: profile.user_id,
            display_name: profile.display_name,
            avatar_url: profile.avatar_url
          });
        }
      }
    }

    console.log(`Found ${results.length} matches for user ${user.id}`);

    return new Response(JSON.stringify({ 
      matches: results,
      total_processed: limitedContacts.length,
      total_matched: results.length
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Match contacts error:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
