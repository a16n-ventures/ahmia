-- Create comment_likes table
CREATE TABLE public.comment_likes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  comment_id UUID NOT NULL REFERENCES public.post_comments(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(comment_id, user_id)
);

-- Enable RLS
ALTER TABLE public.comment_likes ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can view all comment likes"
ON public.comment_likes FOR SELECT
USING (true);

CREATE POLICY "Users can like comments"
ON public.comment_likes FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can unlike their own likes"
ON public.comment_likes FOR DELETE
USING (auth.uid() = user_id);

-- Add likes_count column to post_comments
ALTER TABLE public.post_comments ADD COLUMN likes_count INTEGER DEFAULT 0;

-- Function to increment comment likes
CREATE OR REPLACE FUNCTION public.increment_comment_likes(p_comment_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE public.post_comments SET likes_count = COALESCE(likes_count, 0) + 1 WHERE id = p_comment_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to decrement comment likes
CREATE OR REPLACE FUNCTION public.decrement_comment_likes(p_comment_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE public.post_comments SET likes_count = GREATEST(COALESCE(likes_count, 0) - 1, 0) WHERE id = p_comment_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;