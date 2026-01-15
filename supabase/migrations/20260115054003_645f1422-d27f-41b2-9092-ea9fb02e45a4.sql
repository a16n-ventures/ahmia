-- Drop and recreate RLS policies for profile_links with proper authentication checks
DROP POLICY IF EXISTS "Profile links are viewable by everyone" ON public.profile_links;
DROP POLICY IF EXISTS "Users can create their own links" ON public.profile_links;
DROP POLICY IF EXISTS "Users can update their own links" ON public.profile_links;
DROP POLICY IF EXISTS "Users can delete their own links" ON public.profile_links;

-- SELECT: Anyone can view profile links (public profile info)
CREATE POLICY "Anyone can view profile links"
ON public.profile_links
FOR SELECT
USING (true);

-- INSERT: Users can only insert links for themselves using auth.uid()
CREATE POLICY "Users can insert their own links"
ON public.profile_links
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- UPDATE: Users can only update their own links
CREATE POLICY "Users can update their own links"
ON public.profile_links
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- DELETE: Users can only delete their own links
CREATE POLICY "Users can delete their own links"
ON public.profile_links
FOR DELETE
USING (auth.uid() = user_id);

-- Also ensure user_id column is NOT NULL (critical for RLS)
ALTER TABLE public.profile_links ALTER COLUMN user_id SET NOT NULL;