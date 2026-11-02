#!/usr/bin/env bash
# =============================================================================
# Script de deploy da API de Produtos em uma VM Ubuntu (testado para 22.04/24.04)
#
# Como usar (dentro da VM, depois de clonar o repositório):
#     cd api-produtos
#     bash deploy/deploy.sh
#
# O que ele faz:
#   1. Instala Python (venv) e Nginx
#   2. Cria um ambiente virtual e instala as dependências da API
#   3. Cria um serviço systemd que mantém a API rodando (e reinicia se cair)
#   4. Configura o Nginx como proxy reverso: porta 80 (pública) -> 127.0.0.1:8000
#   5. Testa se está tudo respondendo
# =============================================================================
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_USER="$(whoami)"
SERVICE_NAME="api-produtos"

echo ">>> Pasta do projeto: $APP_DIR"
echo ">>> Usuário que vai rodar a API: $APP_USER"

echo ">>> [1/5] Instalando pacotes do sistema (python3-venv, nginx)..."
sudo DEBIAN_FRONTEND=noninteractive NEEDRESTART_MODE=a apt-get update -y
sudo DEBIAN_FRONTEND=noninteractive NEEDRESTART_MODE=a apt-get install -y python3-venv python3-pip nginx curl

echo ">>> [2/5] Criando ambiente virtual e instalando dependências..."
python3 -m venv "$APP_DIR/venv"
"$APP_DIR/venv/bin/pip" install --upgrade pip
"$APP_DIR/venv/bin/pip" install -r "$APP_DIR/requirements.txt"
mkdir -p "$APP_DIR/data"

echo ">>> [3/5] Criando serviço systemd '$SERVICE_NAME'..."
sed -e "s|__APP_DIR__|$APP_DIR|g" -e "s|__APP_USER__|$APP_USER|g" \
    "$APP_DIR/deploy/api-produtos.service" | sudo tee /etc/systemd/system/$SERVICE_NAME.service > /dev/null
sudo systemctl daemon-reload
sudo systemctl enable "$SERVICE_NAME"
sudo systemctl restart "$SERVICE_NAME"

echo ">>> [4/5] Configurando Nginx como proxy reverso..."
sudo cp "$APP_DIR/deploy/nginx-api-produtos.conf" /etc/nginx/sites-available/$SERVICE_NAME
sudo ln -sf /etc/nginx/sites-available/$SERVICE_NAME /etc/nginx/sites-enabled/$SERVICE_NAME
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl enable nginx
sudo systemctl reload nginx

echo ">>> [5/5] Testando..."
for i in $(seq 1 15); do
    if curl -fs http://127.0.0.1/health > /dev/null; then
        echo
        echo "============================================================"
        echo " DEPLOY CONCLUÍDO!"
        echo " Resposta do /health: $(curl -s http://127.0.0.1/health)"
        echo
        echo " Agora abra no navegador:"
        echo "   Painel:        http://<IP-PUBLICO-DA-VM>/"
        echo "   Documentação:  http://<IP-PUBLICO-DA-VM>/docs"
        echo " (o IP público aparece na página 'Visão geral' da VM no portal)"
        echo "============================================================"
        exit 0
    fi
    sleep 2
done

echo "!!! A API não respondeu. Veja os logs com:"
echo "    sudo journalctl -u $SERVICE_NAME -n 50 --no-pager"
exit 1
