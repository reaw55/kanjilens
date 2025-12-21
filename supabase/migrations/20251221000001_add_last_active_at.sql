-- Add last_active_at column if it doesn't exist
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'last_active_at') THEN
        ALTER TABLE public.profiles ADD COLUMN last_active_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
    END IF;
END $$;
