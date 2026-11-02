"""
API de Produtos — CRUD com FastAPI + SQLite, com painel web (dashboard).

Rotas:
    GET    /                 painel web (dashboard com gráficos)
    GET    /docs             documentação interativa (Swagger, em português)
    GET    /api              informações da API
    GET    /health           verificação de saúde (usada para testar o deploy)
    GET    /produtos         lista todos os produtos
    POST   /produtos         cria um produto
    GET    /produtos/{id}    consulta um produto pelo ID
    PUT    /produtos/{id}    atualiza um produto
    DELETE /produtos/{id}    remove um produto
    POST   /exemplos         insere produtos de exemplo (para demonstração)
"""

from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException, Response, status
from fastapi.openapi.docs import get_swagger_ui_html
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from app.database import get_connection, init_db
from app.erros import registrar_tratadores
from app.exemplos import linhas_exemplo

STATIC_DIR = Path(__file__).resolve().parent / "static"


# ---------- Modelos (formato dos dados que entram e saem) ----------

class ProdutoEntrada(BaseModel):
    """Dados enviados para criar ou atualizar um produto."""
    nome: str = Field(..., min_length=1, max_length=100, description="Nome do produto",
                      examples=["Teclado mecânico"])
    descricao: str | None = Field(None, max_length=500, description="Descrição curta (opcional)",
                                  examples=["Switch azul, ABNT2"])
    categoria: str = Field("Geral", min_length=1, max_length=50, description="Categoria do produto",
                           examples=["Periféricos"])
    preco: float = Field(0, ge=0, description="Preço unitário em reais", examples=[249.90])
    quantidade: int = Field(0, ge=0, description="Unidades em estoque", examples=[10])


class Produto(ProdutoEntrada):
    """Produto como fica gravado no banco."""
    id: int = Field(..., description="Identificador gerado pelo banco")
    criado_em: str = Field(..., description="Data e hora do cadastro")


class Erro(BaseModel):
    """Resposta de erro simples."""
    detail: str = Field(..., examples=["Produto 5 não encontrado"])


class ErroCampo(BaseModel):
    campo: str = Field(..., examples=["nome"])
    mensagem: str = Field(..., examples=["Deve ter pelo menos 1 caractere(s)"])


class ErroValidacao(BaseModel):
    """Resposta quando os dados enviados são inválidos."""
    detail: str = Field(..., examples=["Dados inválidos"])
    erros: list[ErroCampo]


NAO_ENCONTRADO = {404: {"model": Erro, "description": "Produto não encontrado"}}
DADOS_INVALIDOS = {422: {"model": ErroValidacao, "description": "Dados inválidos"}}


# ---------- Inicialização ----------

@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()  # cria o banco e a tabela ao subir a API
    yield


app = FastAPI(
    title="API de Produtos",
    description="CRUD de produtos com FastAPI e SQLite, hospedado em uma máquina virtual na nuvem.\n\n"
                "O painel com gráficos fica em [/](/).",
    version="2.0.0",
    lifespan=lifespan,
    docs_url=None,   # a página /docs é montada abaixo, em português
    redoc_url=None,
    openapi_tags=[
        {"name": "Produtos", "description": "Cadastro, consulta, atualização e remoção de produtos"},
        {"name": "Informações", "description": "Estado e dados gerais da API"},
        {"name": "Utilitários", "description": "Ferramentas para demonstração"},
    ],
)

registrar_tratadores(app)  # mensagens de erro em português

# Arquivos do painel (HTML, CSS, JS, fontes e bibliotecas)
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


def buscar_produto(produto_id: int) -> dict:
    with get_connection() as conn:
        linha = conn.execute("SELECT * FROM produtos WHERE id = ?", (produto_id,)).fetchone()
    if linha is None:
        raise HTTPException(status_code=404, detail=f"Produto {produto_id} não encontrado")
    return dict(linha)


# ---------- Páginas ----------

@app.get("/", include_in_schema=False)
def painel():
    return FileResponse(STATIC_DIR / "index.html")


@app.get("/docs", include_in_schema=False)
def documentacao():
    """Swagger UI servido localmente + script que traduz a interface para português."""
    pagina = get_swagger_ui_html(
        openapi_url=app.openapi_url,
        title="API de Produtos — Documentação",
        swagger_js_url="/static/vendor/swagger-ui-bundle.js",
        swagger_css_url="/static/vendor/swagger-ui.css",
        swagger_favicon_url="/static/favicon.svg",
        swagger_ui_parameters={"defaultModelsExpandDepth": -1, "docExpansion": "list"},
    )
    html = pagina.body.decode().replace(
        "</body>", '<script src="/static/swagger-pt.js"></script></body>'
    ).replace('<html>', '<html lang="pt-BR">')
    return HTMLResponse(html)


# ---------- Informações ----------

@app.get("/api", tags=["Informações"], summary="Informações da API",
         response_description="Nome, versão e endereços úteis")
def info():
    return {
        "api": "API de Produtos",
        "versao": app.version,
        "painel": "/",
        "documentacao": "/docs",
        "endpoints": "/produtos",
    }


@app.get("/health", tags=["Informações"], summary="Verificar saúde",
         response_description="A API e o banco estão respondendo")
def health():
    with get_connection() as conn:
        conn.execute("SELECT 1")
    return {"status": "ok", "banco": "conectado"}


# ---------- CRUD de produtos ----------

@app.get("/produtos", response_model=list[Produto], tags=["Produtos"],
         summary="Listar produtos", response_description="Lista de todos os produtos")
def listar_produtos():
    with get_connection() as conn:
        linhas = conn.execute("SELECT * FROM produtos ORDER BY id").fetchall()
    return [dict(l) for l in linhas]


@app.post("/produtos", response_model=Produto, status_code=status.HTTP_201_CREATED, tags=["Produtos"],
          summary="Criar produto", response_description="Produto criado",
          responses=DADOS_INVALIDOS)
def criar_produto(produto: ProdutoEntrada):
    with get_connection() as conn:
        cursor = conn.execute(
            "INSERT INTO produtos (nome, descricao, categoria, preco, quantidade) VALUES (?, ?, ?, ?, ?)",
            (produto.nome, produto.descricao, produto.categoria, produto.preco, produto.quantidade),
        )
        novo_id = cursor.lastrowid
    return buscar_produto(novo_id)


@app.get("/produtos/{produto_id}", response_model=Produto, tags=["Produtos"],
         summary="Consultar produto por ID", response_description="Produto encontrado",
         responses={**NAO_ENCONTRADO, **DADOS_INVALIDOS})
def consultar_produto(produto_id: int):
    return buscar_produto(produto_id)


@app.put("/produtos/{produto_id}", response_model=Produto, tags=["Produtos"],
         summary="Atualizar produto", response_description="Produto atualizado",
         responses={**NAO_ENCONTRADO, **DADOS_INVALIDOS})
def atualizar_produto(produto_id: int, produto: ProdutoEntrada):
    buscar_produto(produto_id)  # garante que existe (senão 404)
    with get_connection() as conn:
        conn.execute(
            "UPDATE produtos SET nome = ?, descricao = ?, categoria = ?, preco = ?, quantidade = ? WHERE id = ?",
            (produto.nome, produto.descricao, produto.categoria, produto.preco, produto.quantidade, produto_id),
        )
    return buscar_produto(produto_id)


@app.delete("/produtos/{produto_id}", status_code=status.HTTP_204_NO_CONTENT, tags=["Produtos"],
            summary="Remover produto", response_description="Produto removido",
            responses={**NAO_ENCONTRADO, **DADOS_INVALIDOS})
def remover_produto(produto_id: int):
    buscar_produto(produto_id)
    with get_connection() as conn:
        conn.execute("DELETE FROM produtos WHERE id = ?", (produto_id,))
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ---------- Utilitários ----------

@app.post("/exemplos", status_code=status.HTTP_201_CREATED, tags=["Utilitários"],
          summary="Inserir produtos de exemplo", response_description="Quantidade de produtos inseridos")
def inserir_exemplos():
    """Insere 24 produtos de exemplo, com datas espalhadas nos últimos 30 dias."""
    linhas = list(linhas_exemplo())
    with get_connection() as conn:
        conn.executemany(
            "INSERT INTO produtos (nome, descricao, categoria, preco, quantidade, criado_em) "
            "VALUES (?, ?, ?, ?, ?, ?)",
            linhas,
        )
    return {"inseridos": len(linhas)}
