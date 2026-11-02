/*
 * Tradução da interface do Swagger UI para português.
 *
 * O Swagger UI não tem suporte oficial a outros idiomas, então este script
 * observa a página e troca os textos fixos da interface (botões, títulos,
 * rótulos) pelas versões em português. O conteúdo da API (JSON de exemplo,
 * respostas) não é alterado.
 */
(function () {
  const TEXTOS = {
    "Try it out": "Testar",
    "Cancel": "Cancelar",
    "Execute": "Executar",
    "Clear": "Limpar",
    "Reset": "Restaurar",
    "Parameters": "Parâmetros",
    "No parameters": "Sem parâmetros",
    "Name": "Nome",
    "Description": "Descrição",
    "Request body": "Corpo da requisição",
    "required": "obrigatório",
    "Responses": "Respostas",
    "Response body": "Corpo da resposta",
    "Response headers": "Cabeçalhos da resposta",
    "Code": "Código",
    "Details": "Detalhes",
    "Links": "Links",
    "No links": "Sem links",
    "Curl": "cURL",
    "Request URL": "URL da requisição",
    "Request Duration": "Duração da requisição",
    "Server response": "Resposta do servidor",
    "Media type": "Tipo de conteúdo",
    "Controls Accept header.": "Define o cabeçalho Accept.",
    "Example Value": "Exemplo",
    "Example Value ": "Exemplo",
    "Schema": "Esquema",
    "Schemas": "Esquemas",
    "Successful Response": "Resposta bem-sucedida",
    "Validation Error": "Erro de validação",
    "Undocumented": "Não documentado",
    "Loading...": "Carregando...",
    "Download": "Baixar",
    "Expand all": "Expandir tudo",
    "Collapse all": "Recolher tudo",
    "Send empty value": "Enviar valor vazio",
    "Failed to fetch.": "Falha ao conectar.",
    "Possible Reasons:": "Possíveis motivos:",
    "Edit Value": "Editar valor",
    "Model": "Modelo",
    "Servers": "Servidores",
    "Authorize": "Autorizar",
    "Filter by tag": "Filtrar por tag",
    "Please correct the following validation errors and try again.":
      "Corrija os erros de validação abaixo e tente novamente.",
    "Required field is not provided": "Campo obrigatório não informado",
    "Value must be an integer": "O valor deve ser um número inteiro",
    "Value must be a number": "O valor deve ser um número",
    "Parameter string value must be valid JSON": "O valor deve ser um JSON válido",
    "Executing...": "Executando...",
    "No response from server": "Sem resposta do servidor",
    "Response content type": "Tipo de conteúdo da resposta",
    "Parameter content type": "Tipo de conteúdo do parâmetro",
    "Examples": "Exemplos",
    "Example": "Exemplo",
    "Default value": "Valor padrão",
    "Available values": "Valores disponíveis",
    "Expand operation": "Expandir operação",
    "Collapse operation": "Recolher operação",
    "Copy to clipboard": "Copiar",
    "Show/Hide": "Mostrar/Ocultar",
    "Expand": "Expandir",
    "Collapse": "Recolher",
    "Controls": "Define o cabeçalho",
    "Copy path to clipboard": "Copiar rota",
    "Copy cURL command to clipboard": "Copiar comando cURL",
    "Copy code to clipboard": "Copiar código",
    "Request content type": "Tipo de conteúdo da requisição",
    "Media Type": "Tipo de conteúdo",
  };

  // Textos que substituem o nó inteiro (sem manter espaços em volta)
  const SUBSTITUIR_NO = {
    "header.": ".",
  };

  // Textos que contêm partes variáveis
  const PADROES = [
    [/^Possible Reasons:$/, "Possíveis motivos:"],
    [/^CORS$/, "CORS"],
    [/^Network Failure$/, "Falha de rede"],
    [/^URL scheme must be "http" or "https" for CORS request\.$/, 'O esquema da URL deve ser "http" ou "https".'],
    [/^Error: (.+)$/, "Erro: $1"],
    [/^Value must be greater than or equal to (.+)$/, "O valor deve ser maior ou igual a $1"],
    [/^Value must be less than or equal to (.+)$/, "O valor deve ser menor ou igual a $1"],
    [/^Value must be greater than (.+)$/, "O valor deve ser maior que $1"],
    [/^Value must be less than (.+)$/, "O valor deve ser menor que $1"],
    [/^Value must be no longer than (\d+) characters$/, "O valor deve ter no máximo $1 caracteres"],
    [/^Value must be at least (\d+) characters$/, "O valor deve ter pelo menos $1 caracteres"],
  ];

  // Não mexer no conteúdo de código/JSON
  const IGNORAR = "pre, code, textarea, .microlight";

  const ATRIBUTOS = ["title", "placeholder", "aria-label"];

  function traduzirTexto(original) {
    const limpo = original.trim();
    if (!limpo) return null;
    if (Object.prototype.hasOwnProperty.call(SUBSTITUIR_NO, limpo)) return SUBSTITUIR_NO[limpo];
    if (Object.prototype.hasOwnProperty.call(TEXTOS, limpo)) {
      return original.replace(limpo, TEXTOS[limpo]);
    }
    for (const [regex, troca] of PADROES) {
      if (regex.test(limpo)) return original.replace(limpo, limpo.replace(regex, troca));
    }
    return null;
  }

  function traduzirNo(raiz) {
    if (!raiz) return;
    const andarilho = document.createTreeWalker(raiz, NodeFilter.SHOW_TEXT);
    let no;
    while ((no = andarilho.nextNode())) {
      const pai = no.parentElement;
      if (!pai || pai.closest(IGNORAR)) continue;
      const novo = traduzirTexto(no.nodeValue);
      if (novo !== null && novo !== no.nodeValue) no.nodeValue = novo;
    }
    const elementos = raiz.querySelectorAll ? raiz.querySelectorAll("[title],[placeholder],[aria-label]") : [];
    elementos.forEach((el) => {
      ATRIBUTOS.forEach((attr) => {
        const valor = el.getAttribute(attr);
        if (!valor) return;
        const novo = traduzirTexto(valor);
        if (novo !== null && novo !== valor) el.setAttribute(attr, novo);
      });
    });
  }

  // O "required" ao lado dos campos vem do CSS do Swagger, não do texto da página
  const estilo = document.createElement("style");
  estilo.textContent = '.swagger-ui .parameter__name.required:after { content: "obrigatório"; }';
  document.head.append(estilo);

  let agendado = false;
  function agendar() {
    if (agendado) return;
    agendado = true;
    requestAnimationFrame(() => {
      agendado = false;
      traduzirNo(document.getElementById("swagger-ui"));
    });
  }

  new MutationObserver(agendar).observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
  });
  agendar();
})();
