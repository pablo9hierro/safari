/**
 * Swagger UI da API de agenda. Carregado pelo CDN do próprio swagger-ui —
 * é uma página de documentação de desenvolvimento, não faz parte do bundle
 * da loja.
 */
const HTML = `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>VR Tech — API da Agenda</title>
    <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css" />
  </head>
  <body>
    <div id="swagger"></div>
    <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js" crossorigin></script>
    <script>
      window.onload = () => {
        window.SwaggerUIBundle({ url: '/api/docs/openapi.json', dom_id: '#swagger' })
      }
    </script>
  </body>
</html>`

export async function GET() {
  return new Response(HTML, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
}
