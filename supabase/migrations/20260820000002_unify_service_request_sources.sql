-- Unifica a origem de solicitações de serviço: independente de vir da
-- vitrine (formulário/autoagendamento), do WhatsApp (assistente IA), do
-- lojista cadastrando manualmente, ou do PDV, todo agendamento de serviço
-- passa a existir como vrtech.service_requests -- visível na mesma fila
-- "Solicitações" do painel.

-- WhatsApp e PDV não coletam e-mail nem descrição de problema como o
-- formulário /consultar coleta -- viram opcionais; problem_description
-- ganha fallback textual (nome do serviço) quando ausente, aplicado na
-- camada de aplicação, não aqui.
ALTER TABLE vrtech.service_requests ALTER COLUMN customer_email DROP NOT NULL;
ALTER TABLE vrtech.service_requests ALTER COLUMN problem_description DROP NOT NULL;

-- Rastreabilidade de origem -- sem isso não dá pra saber de onde veio cada
-- solicitação depois que tudo cai na mesma fila.
ALTER TABLE vrtech.service_requests
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'storefront_form'
    CHECK (source IN ('storefront_form', 'storefront_booking', 'whatsapp_ai', 'admin_manual', 'pdv'));

-- Linhas existentes (todas vieram do formulário até aqui) já ficam corretas
-- com o default acima -- nada a fazer no backfill.
