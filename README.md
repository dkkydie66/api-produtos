# API de Produtos: FastAPI + SQLite na nuvem

API REST de cadastro de produtos (CRUD) escrita em **Python** com **FastAPI**. Usa **SQLite** como banco de dados e roda numa **máquina virtual Linux na Microsoft Azure**, com **Nginx** como proxy reverso.

A API vem com um **painel web (dashboard)** que consome os próprios endpoints. O painel mostra indicadores, gráficos interativos, a tabela de produtos com cadastro, edição e exclusão, e um console com cada requisição feita à API em tempo real.

||Endereço|
|-|-|
|📊 Painel (dashboard)|http://68.211.121.69/|
|📄 Documentação interativa (Swagger, em português)|http://68.211.121.69/docs|
|🔌 API|http://68.211.121.69/produtos|

---

## Tecnologias

|Camada|Tecnologia|
|-|-|
|Linguagem|Python 3|
|Framework web|FastAPI|
|Servidor da aplicação|Uvicorn|
|Banco de dados|SQLite (arquivo `data/produtos.db`)|
|Painel web|HTML, CSS e JavaScript puro + Chart.js (gráficos)|
|Proxy reverso|Nginx|
|Gerenciador de processo|systemd|
|Nuvem|Microsoft Azure: máquina virtual Ubuntu Server|

Todas as bibliotecas do painel (Chart.js, Swagger UI e as fontes) ficam dentro do projeto, em `app/static/`. A página não depende de nenhum site externo para funcionar.

## Arquitetura

```
Navegador (painel / Swagger / Postman)
        │  HTTP :80
        ▼
   Internet ──► NSG (firewall da Azure: libera 22 e 80)
                        │
                        ▼
              ┌──────────── VM Ubuntu ─────────────┐
              │  Nginx :80                         │
              │     │ proxy_pass                   │
              │     ▼                              │
              │  Uvicorn + FastAPI 127.0.0.1:8000  │
              │     │  ├─ /         painel web     │
              │     │  ├─ /docs     Swagger        │
              │     │  └─ /produtos API REST       │
              │     ▼                              │
              │  SQLite  data/produtos.db          │
              │  (gravado no disco da VM)          │
              └────────────────────────────────────┘
```

## Endpoints

|Método|Rota|Descrição|Resposta|
|-|-|-|-|
|GET|`/`|Painel web (dashboard)|200|
|GET|`/docs`|Documentação interativa (Swagger)|200|
|GET|`/api`|Informações da API|200|
|GET|`/health`|Verifica se a API e o banco estão ok|200|
|GET|`/produtos`|Lista todos os produtos|200|
|POST|`/produtos`|Cria um produto|201 / 422|
|GET|`/produtos/{id}`|Consulta um produto pelo ID|200 / 404|
|PUT|`/produtos/{id}`|Atualiza um produto|200 / 404 / 422|
|DELETE|`/produtos/{id}`|Remove um produto|204 / 404|
|POST|`/exemplos`|Insere 24 produtos de exemplo (para demonstração)|201|

### Formato de um produto

```json
{
  "nome": "Teclado mecânico",
  "descricao": "Switch azul, ABNT2",
  "categoria": "Periféricos",
  "preco": 249.90,
  "quantidade": 12
}
```

|Campo|Tipo|Regra|
|-|-|-|
|`nome`|texto|obrigatório, de 1 a 100 caracteres|
|`descricao`|texto|opcional, até 500 caracteres|
|`categoria`|texto|opcional (padrão `"Geral"`), até 50 caracteres|
|`preco`|número|maior ou igual a 0|
|`quantidade`|número inteiro|maior ou igual a 0|

O banco preenche sozinho os campos `id` e `criado_em`.

### Erros (em português)

Dados inválidos retornam **422**:

```json
{
  "detail": "Dados inválidos",
  "erros": [
    { "campo": "nome", "mensagem": "Deve ter pelo menos 1 caractere(s)" },
    { "campo": "preco", "mensagem": "Deve ser maior ou igual a 0" }
  ]
}
```

Um produto que não existe retorna **404**: `{"detail": "Produto 5 não encontrado"}`

## O painel

* **Indicadores:** valor total em estoque, produtos cadastrados, unidades e produtos com estoque baixo (menos de 5 unidades).
* **Gráficos interativos:**

  * valor em estoque por categoria (clique numa barra para filtrar o painel inteiro);
  * total de produtos cadastrados nos últimos 30 dias;
  * produtos por faixa de preço.

  Cada gráfico tem o botão "Ver tabela".

* **Atividade da API:** lista em tempo real cada requisição que o painel faz (método, rota, código de status e tempo de resposta).
* **Tabela de produtos:** busca, filtro por categoria, ordenação por coluna, e botões para criar, editar e excluir.
* **Outros:** tema claro e escuro, e layout que funciona no celular.

## Estrutura do projeto

```
api-produtos/
├── app/
│   ├── main.py          # rotas da API
│   ├── database.py      # conexão, criação da tabela e migração no SQLite
│   ├── erros.py         # mensagens de erro em português
│   ├── exemplos.py      # dados de exemplo
│   └── static/          # painel web
│       ├── index.html
│       ├── styles.css
│       ├── app.js
│       ├── swagger-pt.js       # tradução do Swagger para português
│       ├── fonts/              # fontes Instrument Sans e JetBrains Mono
│       └── vendor/             # Chart.js e Swagger UI
├── deploy/
│   ├── deploy.sh                  # configura a VM inteira automaticamente
│   ├── api-produtos.service       # serviço systemd
│   ├── nginx-api-produtos.conf    # configuração do Nginx
│   └── testar.sh                  # testa todos os endpoints
├── requirements.txt
└── README.md
```

## Rodar localmente

Pré-requisito: Python 3.10 ou superior.

**Windows (PowerShell):**

```powershell
python -m venv venv
venv\Scripts\python -m pip install -r requirements.txt
venv\Scripts\python -m uvicorn app.main:app --reload
```

**Linux/Mac:**

```bash
python3 -m venv venv
venv/bin/python -m pip install -r requirements.txt
venv/bin/python -m uvicorn app.main:app --reload
```

Abra http://127.0.0.1:8000 para ver o painel. Se o banco estiver vazio, clique em **Carregar dados de exemplo**.

## Deploy na VM (Ubuntu)

Com a VM criada, acessível por SSH e com a porta 80 liberada:

```bash
git clone https://github.com/dkkydie66/api-produtos.git
cd api-produtos
bash deploy/deploy.sh
```

Testar todos os endpoints:

```bash
bash deploy/testar.sh
```

Atualizar a API depois de mudar o código no GitHub:

```bash
cd ~/api-produtos
git pull
sudo systemctl restart api-produtos
```

Comandos úteis:

```bash
sudo systemctl status api-produtos         # status da API
sudo journalctl -u api-produtos -n 50      # logs da API
sudo systemctl status nginx                # status do Nginx
```

## Créditos de terceiros

* [Chart.js](https://www.chartjs.org/) (licença MIT)
* [Swagger UI](https://github.com/swagger-api/swagger-ui) (licença Apache 2.0)
* Fontes [Instrument Sans](https://github.com/Instrument/instrument-sans) e [JetBrains Mono](https://www.jetbrains.com/lp/mono/) (licença SIL Open Font)

