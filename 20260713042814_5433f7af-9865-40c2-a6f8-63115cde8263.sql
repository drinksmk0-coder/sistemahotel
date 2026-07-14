-- Allow anonymous guests (QR code / printed form) to submit feedback and complaints.

GRANT INSERT ON public.feedbacks TO anon;
GRANT INSERT ON public.complaints TO anon;

-- Guests can submit a feedback (evaluation) without logging in.
CREATE POLICY feedbacks_insert_anon ON public.feedbacks
  FOR INSERT TO anon
  WITH CHECK (true);

-- Guests can submit a complaint only through the public QR channel.
CREATE POLICY complaints_insert_anon ON public.complaints
  FOR INSERT TO anon
  WITH CHECK (origem = 'qrcode' AND created_by IS NULL);