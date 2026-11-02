"""
Camada de acesso ao banco de dados SQLite.

O SQLite guarda todo o banco em um único arquivo (.db) no disco.
Na VM da nuvem, esse arquivo fica no disco do sistema operacional,
dentro da pasta do projeto: data/produtos.db
"""

import os
import sqlite3
from contextlib import contextmanager
from pathlib import Path

# Caminho do arquivo do banco. Pode ser trocado pela variável de ambiente DB_PATH.
BASE_DIR = Path(__file__).resolve().parent.parent
DB_PATH = Path(os.getenv("DB_PATH", BASE_DIR / "data" / "produtos.db"))


@contextmanager
def get_connection():
    """
    Abre uma conexão com o banco, confirma (commit) as alterações se tudo der
    certo, desfaz (rollback) se der erro, e sempre fecha a conexão no final.
    """
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row  # permite acessar colunas pelo nome
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def init_db() -> None:
    """Cria a pasta e a tabela 'produtos' se ainda não existirem."""
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    with get_connection() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS produtos (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                nome        TEXT    NOT NULL,
                descricao   TEXT,
                categoria   TEXT    NOT NULL DEFAULT 'Geral',
                preco       REAL    NOT NULL DEFAULT 0,
                quantidade  INTEGER NOT NULL DEFAULT 0,
                criado_em   TEXT    NOT NULL DEFAULT (datetime('now', 'localtime'))
            )
            """
        )

        # Migração simples: se o banco foi criado por uma versão anterior
        # (sem as colunas categoria/quantidade), adiciona as colunas que faltam.
        colunas = {linha["name"] for linha in conn.execute("PRAGMA table_info(produtos)")}
        if "categoria" not in colunas:
            conn.execute("ALTER TABLE produtos ADD COLUMN categoria TEXT NOT NULL DEFAULT 'Geral'")
        if "quantidade" not in colunas:
            conn.execute("ALTER TABLE produtos ADD COLUMN quantidade INTEGER NOT NULL DEFAULT 0")
