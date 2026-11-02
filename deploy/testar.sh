#!/usr/bin/env bash
# Testa todos os endpoints da API em sequência (bom para tirar print!).
#
# Uso:
#     bash deploy/testar.sh                       # testa em http://localhost
#     bash deploy/testar.sh http://20.10.30.40    # testa no IP público da VM
set -uo pipefail

URL="${1:-http://localhost}"
linha() { echo; echo "------------------------------------------------------------"; echo "$1"; echo "------------------------------------------------------------"; }

linha "1) GET $URL/health  (saúde da API)"
curl -s "$URL/health"; echo

linha "2) POST $URL/produtos  (criar)"
RESP=$(curl -s -X POST "$URL/produtos" -H "Content-Type: application/json" \
     -d '{"nome": "Teclado mecânico", "descricao": "Switch azul, ABNT2", "categoria": "Periféricos", "preco": 249.90, "quantidade": 12}')
echo "$RESP"
ID=$(echo "$RESP" | python3 -c "import sys, json; print(json.load(sys.stdin)['id'])")

linha "3) GET $URL/produtos  (listar)"
curl -s "$URL/produtos"; echo

linha "4) GET $URL/produtos/$ID  (consultar por ID)"
curl -s "$URL/produtos/$ID"; echo

linha "5) PUT $URL/produtos/$ID  (atualizar)"
curl -s -X PUT "$URL/produtos/$ID" -H "Content-Type: application/json" \
     -d '{"nome": "Teclado mecânico RGB", "descricao": "Switch vermelho, ABNT2", "categoria": "Periféricos", "preco": 299.90, "quantidade": 8}'; echo

linha "6) POST $URL/produtos  (dados inválidos — deve dar 422 com mensagens em português)"
curl -s -w "\nHTTP %{http_code}\n" -X POST "$URL/produtos" -H "Content-Type: application/json" \
     -d '{"nome": "", "preco": -10}'

linha "7) DELETE $URL/produtos/$ID  (remover)"
curl -s -o /dev/null -w "HTTP %{http_code}\n" -X DELETE "$URL/produtos/$ID"

linha "8) GET $URL/produtos/$ID  (deve dar 404 — já foi removido)"
curl -s -w "\nHTTP %{http_code}\n" "$URL/produtos/$ID"
