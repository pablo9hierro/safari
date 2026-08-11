-- RAG knowledge base documents for the AI assistant

CREATE TABLE IF NOT EXISTS vrtech.assistant_rag_documents (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  filename TEXT NOT NULL,
  content TEXT NOT NULL,
  char_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE vrtech.assistant_rag_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "svc_rag_documents" ON vrtech.assistant_rag_documents
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "auth_rag_documents" ON vrtech.assistant_rag_documents
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

GRANT ALL ON vrtech.assistant_rag_documents TO service_role, authenticated;
