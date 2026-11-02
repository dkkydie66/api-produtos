"""
Dados de exemplo para popular o banco e deixar o painel com gráficos
interessantes na apresentação. Usados pela rota POST /exemplos.
"""

from datetime import datetime, timedelta

# (nome, descrição, categoria, preço, quantidade, dias atrás)
PRODUTOS_EXEMPLO = [
    ("Teclado mecânico TKL", "Switch marrom, layout ABNT2", "Periféricos", 289.90, 34, 29),
    ("Mouse sem fio ergonômico", "Sensor 4000 DPI, bateria recarregável", "Periféricos", 149.90, 52, 28),
    ("Webcam Full HD", "1080p, microfone embutido", "Periféricos", 219.00, 3, 26),
    ("Mousepad estendido", "90 x 40 cm, base emborrachada", "Periféricos", 59.90, 120, 25),
    ("Monitor 24\" IPS", "Full HD, 75 Hz, borda fina", "Monitores", 899.00, 14, 24),
    ("Monitor 27\" QHD", "2560 x 1440, 144 Hz", "Monitores", 1799.00, 6, 22),
    ("Suporte articulado para monitor", "Braço a gás, até 9 kg", "Monitores", 179.90, 2, 21),
    ("Notebook 14\" i5", "16 GB RAM, SSD 512 GB", "Notebooks", 3999.00, 8, 20),
    ("Notebook 15\" Ryzen 7", "16 GB RAM, SSD 1 TB", "Notebooks", 4899.00, 4, 18),
    ("Chromebook 11\"", "4 GB RAM, 64 GB eMMC", "Notebooks", 1499.00, 11, 17),
    ("SSD NVMe 1 TB", "Leitura até 3500 MB/s", "Armazenamento", 429.90, 40, 16),
    ("SSD SATA 480 GB", "2,5 polegadas", "Armazenamento", 199.90, 63, 15),
    ("HD externo 2 TB", "USB 3.0, portátil", "Armazenamento", 449.00, 18, 13),
    ("Pen drive 64 GB", "USB 3.2", "Armazenamento", 39.90, 150, 12),
    ("Headset gamer", "Som surround 7.1, microfone removível", "Áudio", 259.90, 27, 11),
    ("Caixa de som Bluetooth", "20 W, à prova d'água", "Áudio", 329.00, 4, 10),
    ("Fone intra-auricular", "Cancelamento de ruído", "Áudio", 499.00, 22, 8),
    ("Microfone condensador USB", "Padrão cardioide, tripé incluso", "Áudio", 389.90, 9, 7),
    ("Roteador Wi-Fi 6", "Dual band, 4 antenas", "Redes", 549.00, 16, 6),
    ("Switch 8 portas gigabit", "Não gerenciável", "Redes", 189.90, 25, 5),
    ("Cabo de rede Cat6 10 m", "Com conectores RJ45", "Redes", 34.90, 200, 4),
    ("Repetidor de sinal Wi-Fi", "300 Mbps", "Redes", 119.90, 1, 3),
    ("Hub USB-C 7 em 1", "HDMI 4K, leitor SD, PD 100 W", "Periféricos", 239.00, 31, 2),
    ("Monitor portátil 15,6\"", "USB-C, Full HD", "Monitores", 1149.00, 5, 1),
]


def linhas_exemplo():
    """Gera as linhas prontas para INSERT, com datas espalhadas nos últimos 30 dias."""
    agora = datetime.now()
    for nome, descricao, categoria, preco, quantidade, dias in PRODUTOS_EXEMPLO:
        quando = (agora - timedelta(days=dias, hours=dias % 7, minutes=dias * 3)).strftime("%Y-%m-%d %H:%M:%S")
        yield (nome, descricao, categoria, preco, quantidade, quando)
