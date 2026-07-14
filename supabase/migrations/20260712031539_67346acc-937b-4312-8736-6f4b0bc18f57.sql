-- Rooms: manual situation (cleaning / maintenance)
ALTER TABLE public.rooms ADD COLUMN IF NOT EXISTS situacao text;

-- Reservations: guests count, discount and sales channel (all editable)
ALTER TABLE public.reservations ADD COLUMN IF NOT EXISTS pessoas integer NOT NULL DEFAULT 1;
ALTER TABLE public.reservations ADD COLUMN IF NOT EXISTS desconto numeric NOT NULL DEFAULT 0;
ALTER TABLE public.reservations ADD COLUMN IF NOT EXISTS canal text;