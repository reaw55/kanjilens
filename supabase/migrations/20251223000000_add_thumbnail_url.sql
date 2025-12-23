-- Add thumbnail_url column to captures table
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'captures' AND column_name = 'thumbnail_url') THEN
        ALTER TABLE public.captures ADD COLUMN thumbnail_url TEXT;
    END IF;
END $$;
