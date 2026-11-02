"""
Tradução das mensagens de erro para português.

Por padrão o FastAPI/Pydantic devolve mensagens em inglês, por exemplo
"String should have at least 1 character". Aqui trocamos por mensagens
em português e num formato mais simples de ler:

    {
      "detail": "Dados inválidos",
      "erros": [ {"campo": "nome", "mensagem": "Deve ter pelo menos 1 caractere"} ]
    }
"""

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

MENSAGENS = {
    "missing": "Campo obrigatório",
    "string_type": "Deve ser um texto",
    "string_too_short": "Deve ter pelo menos {min_length} caractere(s)",
    "string_too_long": "Deve ter no máximo {max_length} caracteres",
    "int_type": "Deve ser um número inteiro",
    "int_parsing": "Deve ser um número inteiro",
    "int_from_float": "Deve ser um número inteiro, sem casas decimais",
    "float_type": "Deve ser um número",
    "float_parsing": "Deve ser um número",
    "greater_than_equal": "Deve ser maior ou igual a {ge}",
    "greater_than": "Deve ser maior que {gt}",
    "less_than_equal": "Deve ser menor ou igual a {le}",
    "json_invalid": "O corpo da requisição não é um JSON válido",
    "model_attributes_type": "O corpo da requisição deve ser um objeto JSON",
    "dict_type": "O corpo da requisição deve ser um objeto JSON",
}

ERROS_HTTP = {
    404: "Rota não encontrada",
    405: "Método não permitido para esta rota",
}


def _formatar_numero(valor):
    if isinstance(valor, float) and valor.is_integer():
        return int(valor)
    return valor


def traduzir(erro: dict) -> dict:
    tipo = erro.get("type", "")
    ctx = {k: _formatar_numero(v) for k, v in (erro.get("ctx") or {}).items()}
    modelo = MENSAGENS.get(tipo)
    try:
        mensagem = modelo.format(**ctx) if modelo else erro.get("msg", "Valor inválido")
    except (KeyError, IndexError):
        mensagem = modelo
    if tipo == "json_invalid":
        return {"campo": "corpo", "mensagem": mensagem}
    # "loc" vem como ("body", "nome") — mostramos só o nome do campo
    partes = [str(p) for p in erro.get("loc", []) if p not in ("body", "query", "path")]
    return {"campo": ".".join(partes) or "corpo", "mensagem": mensagem}


def registrar_tratadores(app: FastAPI) -> None:
    @app.exception_handler(RequestValidationError)
    async def erro_validacao(request: Request, exc: RequestValidationError):
        return JSONResponse(
            status_code=422,
            content={"detail": "Dados inválidos", "erros": [traduzir(e) for e in exc.errors()]},
        )

    @app.exception_handler(StarletteHTTPException)
    async def erro_http(request: Request, exc: StarletteHTTPException):
        detalhe = exc.detail
        # Mensagens padrão em inglês ("Not Found", ...) viram português.
        # Mensagens que nós mesmos escrevemos (ex.: "Produto 5 não encontrado") são mantidas.
        if detalhe in ("Not Found", "Method Not Allowed") or detalhe is None:
            detalhe = ERROS_HTTP.get(exc.status_code, detalhe)
        return JSONResponse(status_code=exc.status_code, content={"detail": detalhe}, headers=exc.headers)
