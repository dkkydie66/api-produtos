/* =========================================================================
   Painel de Estoque — lógica da página
   Toda a informação vem da API REST (GET/POST/PUT/DELETE em /produtos).
   ========================================================================= */
(function () {
  "use strict";

  // ---------- Formatação (padrão brasileiro) ----------
  const fmtMoeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
  const fmtMoedaCompacta = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", notation: "compact", maximumFractionDigits: 1 });
  const fmtInteiro = new Intl.NumberFormat("pt-BR");
  const fmtDecimal = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });

  const moeda = (v) => fmtMoeda.format(v || 0);
  const moedaCompacta = (v) => (Math.abs(v) < 1000 ? fmtMoeda.format(v).replace(",00", "") : fmtMoedaCompacta.format(v));
  const inteiro = (v) => fmtInteiro.format(v || 0);
  const doisDig = (n) => String(n).padStart(2, "0");

  function lerData(texto) {
    // "2026-11-02 08:15:03" -> Date local
    const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):?(\d{2})?/.exec(texto || "");
    if (!m) return new Date(NaN);
    return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0));
  }
  const dataCurta = (d) => `${doisDig(d.getDate())}/${doisDig(d.getMonth() + 1)}`;
  const dataCompleta = (d) => `${dataCurta(d)}/${d.getFullYear()}`;
  const dataHora = (d) => `${dataCompleta(d)} ${doisDig(d.getHours())}:${doisDig(d.getMinutes())}`;
  const hora = (d) => `${doisDig(d.getHours())}:${doisDig(d.getMinutes())}:${doisDig(d.getSeconds())}`;
  const normalizar = (s) => (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const plural = (n, um, varios) => `${inteiro(n)} ${n === 1 ? um : varios}`;

  const ESTOQUE_BAIXO = 5; // abaixo disso o produto é marcado como "estoque baixo"

  // ---------- Estado ----------
  const estado = {
    produtos: [],
    filtro: { categoria: "", busca: "" },
    ordem: { campo: "id", direcao: 1 },
    graficos: {},
    tabelas: {},
    editandoId: null,
    excluindoId: null,
    carregou: false,
  };

  const $ = (sel, raiz = document) => raiz.querySelector(sel);
  const $$ = (sel, raiz = document) => Array.from(raiz.querySelectorAll(sel));

  function el(tag, attrs = {}, ...filhos) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v === null || v === undefined || v === false) continue;
      if (k === "class") e.className = v;
      else if (k === "text") e.textContent = v;
      else e.setAttribute(k, v);
    }
    for (const f of filhos) if (f !== null && f !== undefined) e.append(f);
    return e;
  }
  function icone(nome, classe = "icone") {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", classe);
    svg.setAttribute("aria-hidden", "true");
    const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
    use.setAttribute("href", `#i-${nome}`);
    svg.append(use);
    return svg;
  }

  // ---------- Cliente da API (registra cada chamada no console de atividade) ----------
  class ErroApi extends Error {
    constructor(status, corpo) {
      super((corpo && typeof corpo.detail === "string" && corpo.detail) || `Erro ${status}`);
      this.status = status;
      this.corpo = corpo;
    }
  }

  async function api(metodo, rota, corpo, { registrar = true } = {}) {
    const inicio = performance.now();
    let resposta;
    try {
      resposta = await fetch(rota, {
        method: metodo,
        headers: corpo ? { "Content-Type": "application/json" } : {},
        body: corpo ? JSON.stringify(corpo) : undefined,
      });
    } catch (e) {
      if (registrar) registrarAtividade(metodo, rota, null, Math.round(performance.now() - inicio));
      throw new ErroApi(0, { detail: "Não foi possível conectar à API" });
    }
    const ms = Math.round(performance.now() - inicio);
    let dados = null;
    if (resposta.status !== 204) {
      const texto = await resposta.text();
      try { dados = texto ? JSON.parse(texto) : null; } catch (e) { dados = null; }
    }
    if (registrar) registrarAtividade(metodo, rota, resposta.status, ms);
    if (!resposta.ok) throw new ErroApi(resposta.status, dados);
    return dados;
  }

  // ---------- Console de atividade ----------
  function registrarAtividade(metodo, rota, status, ms) {
    const lista = $("#consoleLista");
    $("#consoleVazio").hidden = true;
    const ok = status && status >= 200 && status < 300;
    const item = el("li", { class: "novo" },
      el("span", { class: "console-hora", text: hora(new Date()) }),
      el("span", { class: `metodo ${metodo}`, text: metodo }),
      el("span", { class: "console-rota", text: rota, title: rota }),
      el("span", { class: `console-status ${ok ? "ok" : "falha"}` },
        icone(ok ? "check" : "x-circle"),
        document.createTextNode(status ? String(status) : "falhou")),
      el("span", { class: "console-ms", text: `${ms} ms` }),
    );
    lista.prepend(item);
    while (lista.children.length > 40) lista.lastElementChild.remove();
  }

  // ---------- Status da API (verificação periódica do /health) ----------
  async function verificarSaude(registrar = false) {
    const caixa = $("#statusApi");
    const texto = $(".status-texto", caixa);
    const inicio = performance.now();
    try {
      await api("GET", "/health", null, { registrar });
      const ms = Math.round(performance.now() - inicio);
      caixa.className = "status-api online";
      texto.textContent = `API online, ${ms} ms`;
    } catch (e) {
      caixa.className = "status-api offline";
      texto.textContent = "API fora do ar";
    }
  }

  // ---------- Avisos ----------
  function aviso(mensagem, tipo = "ok") {
    const caixa = el("div", { class: `aviso ${tipo}`, role: "status" },
      icone(tipo === "ok" ? "check" : "x-circle"),
      el("span", { text: mensagem }));
    $("#avisos").append(caixa);
    setTimeout(() => {
      caixa.classList.add("saindo");
      setTimeout(() => caixa.remove(), 250);
    }, 3200);
  }

  // ---------- Dados ----------
  async function carregar() {
    const areas = $$(".grafico-area");
    areas.forEach((a) => a.classList.add("carregando"));
    try {
      estado.produtos = await api("GET", "/produtos");
      estado.carregou = true;
    } catch (e) {
      aviso(e.message, "erro");
    } finally {
      areas.forEach((a) => a.classList.remove("carregando"));
    }
    renderizar();
  }

  function produtosFiltrados({ ignorarCategoria = false } = {}) {
    const busca = normalizar(estado.filtro.busca.trim());
    return estado.produtos.filter((p) => {
      if (!ignorarCategoria && estado.filtro.categoria && p.categoria !== estado.filtro.categoria) return false;
      if (busca && !normalizar(`${p.nome} ${p.descricao || ""} ${p.categoria}`).includes(busca)) return false;
      return true;
    });
  }

  function categorias() {
    return [...new Set(estado.produtos.map((p) => p.categoria))].sort((a, b) => a.localeCompare(b, "pt-BR"));
  }

  // ---------- Renderização geral ----------
  function renderizar() {
    atualizarCategorias();
    const lista = produtosFiltrados();
    renderizarIndicadores(lista);
    renderizarGraficos(lista);
    renderizarTabela(lista);
    const total = estado.produtos.length;
    $("#contagem").textContent = estado.carregou
      ? (lista.length === total ? plural(total, "produto", "produtos") : `${inteiro(lista.length)} de ${plural(total, "produto", "produtos")}`)
      : "";
  }

  function atualizarCategorias() {
    const select = $("#filtroCategoria");
    const atual = estado.filtro.categoria;
    const cats = categorias();
    if (atual && !cats.includes(atual)) estado.filtro.categoria = "";
    select.replaceChildren(el("option", { value: "", text: "Todas as categorias" }),
      ...cats.map((c) => el("option", { value: c, text: c })));
    select.value = estado.filtro.categoria;
    $("#listaCategorias").replaceChildren(...cats.map((c) => el("option", { value: c })));
  }

  function renderizarIndicadores(lista) {
    const valor = lista.reduce((s, p) => s + p.preco * p.quantidade, 0);
    const unidades = lista.reduce((s, p) => s + p.quantidade, 0);
    const baixo = lista.filter((p) => p.quantidade < ESTOQUE_BAIXO);
    const esgotados = baixo.filter((p) => p.quantidade === 0).length;
    const nCats = new Set(lista.map((p) => p.categoria)).size;

    $("#kpiValor").textContent = moeda(valor);
    $("#kpiValorNota").textContent = estado.filtro.categoria
      ? `Somente a categoria ${estado.filtro.categoria}. Preço × quantidade de cada produto.`
      : "Soma de preço × quantidade de cada produto";

    $("#kpiProdutos").textContent = inteiro(lista.length);
    $("#kpiProdutosNota").textContent = lista.length ? `em ${plural(nCats, "categoria", "categorias")}` : "";

    $("#kpiUnidades").textContent = inteiro(unidades);
    $("#kpiUnidadesNota").textContent = lista.length
      ? `média de ${fmtDecimal.format(unidades / lista.length)} por produto` : "";

    $("#kpiBaixo").textContent = inteiro(baixo.length);
    const nota = $("#kpiBaixoNota");
    nota.replaceChildren();
    nota.className = "stat-nota";
    if (!lista.length) return;
    if (baixo.length) {
      nota.classList.add("alerta");
      nota.append(icone("alert"), document.createTextNode(
        `menos de ${ESTOQUE_BAIXO} unidades${esgotados ? `, ${plural(esgotados, "esgotado", "esgotados")}` : ""}`));
    } else {
      nota.classList.add("bom");
      nota.append(icone("check"), document.createTextNode("todos com estoque suficiente"));
    }
  }

  // ---------- Gráficos ----------
  function cor(nome) {
    return getComputedStyle(document.documentElement).getPropertyValue(nome).trim();
  }
  function temaGrafico() {
    return {
      serie: cor("--serie-1"),
      lavado: cor("--serie-1-lavado"),
      apagado: cor("--linha-forte"),
      grade: cor("--grade"),
      eixo: cor("--eixo"),
      tinta: cor("--tinta"),
      tinta2: cor("--tinta-2"),
      tinta3: cor("--tinta-3"),
      superficie: cor("--superficie"),
      pagina: cor("--pagina"),
      fonte: getComputedStyle(document.body).fontFamily,
    };
  }

  function dicaPadrao(t) {
    return {
      backgroundColor: t.tinta,
      titleColor: t.pagina,
      bodyColor: t.pagina,
      titleFont: { family: t.fonte, size: 14, weight: "600" },
      bodyFont: { family: t.fonte, size: 13 },
      padding: 10,
      cornerRadius: 8,
      displayColors: false,
      caretSize: 5,
    };
  }

  // Plugin: valor escrito na ponta de cada barra
  function pluginRotulos(formatar) {
    return {
      id: "rotulos",
      afterDatasetsDraw(chart) {
        const t = chart.$tema;
        const { ctx } = chart;
        const meta = chart.getDatasetMeta(0);
        const dados = chart.data.datasets[0].data;
        const horizontal = chart.options.indexAxis === "y";
        ctx.save();
        ctx.font = `600 12px ${t.fonte}`;
        ctx.fillStyle = t.tinta2;
        meta.data.forEach((barra, i) => {
          if (!dados[i]) return;
          const txt = formatar(dados[i]);
          if (horizontal) {
            ctx.textAlign = "left"; ctx.textBaseline = "middle";
            ctx.fillText(txt, barra.x + 6, barra.y);
          } else {
            ctx.textAlign = "center"; ctx.textBaseline = "bottom";
            ctx.fillText(txt, barra.x, barra.y - 5);
          }
        });
        ctx.restore();
      },
    };
  }

  // Plugin: linha vertical que acompanha o mouse + valor no fim da linha
  const pluginMira = {
    id: "mira",
    afterDatasetsDraw(chart) {
      const t = chart.$tema;
      const { ctx, chartArea } = chart;
      const ativos = chart.tooltip && chart.tooltip.getActiveElements();
      if (ativos && ativos.length) {
        const x = ativos[0].element.x;
        ctx.save();
        ctx.strokeStyle = t.eixo;
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(x, chartArea.top); ctx.lineTo(x, chartArea.bottom); ctx.stroke();
        ctx.restore();
      }
      // ponto e valor no fim da linha
      const meta = chart.getDatasetMeta(0);
      const ultimo = meta.data[meta.data.length - 1];
      const valor = chart.data.datasets[0].data.at(-1);
      if (!ultimo) return;
      ctx.save();
      ctx.beginPath(); ctx.arc(ultimo.x, ultimo.y, 6, 0, Math.PI * 2); ctx.fillStyle = t.superficie; ctx.fill();
      ctx.beginPath(); ctx.arc(ultimo.x, ultimo.y, 4, 0, Math.PI * 2); ctx.fillStyle = t.serie; ctx.fill();
      ctx.font = `600 12px ${t.fonte}`; ctx.fillStyle = t.tinta2;
      ctx.textAlign = "right"; ctx.textBaseline = "bottom";
      ctx.fillText(inteiro(valor), ultimo.x - 2, ultimo.y - 10);
      ctx.restore();
    },
  };

  function eixos(t, { horizontal = false, formatarValor = null, inteiros = false } = {}) {
    const valor = {
      beginAtZero: true,
      grid: { color: t.grade, lineWidth: 1, drawTicks: false },
      border: { display: false },
      ticks: {
        color: t.tinta3, font: { family: t.fonte, size: 12 }, padding: 8,
        precision: inteiros ? 0 : undefined,
        callback: formatarValor ? (v) => formatarValor(v) : undefined,
        maxTicksLimit: 6,
      },
    };
    const categoria = {
      grid: { display: false },
      border: { color: t.eixo },
      ticks: { color: t.tinta2, font: { family: t.fonte, size: 12.5 }, padding: 6 },
    };
    return horizontal ? { x: valor, y: categoria } : { x: categoria, y: valor };
  }

  function criarOuAtualizar(nome, canvasId, configurar) {
    const t = temaGrafico();
    const existente = estado.graficos[nome];
    const config = configurar(t);
    if (existente) {
      existente.$tema = t;
      existente.data.labels = config.data.labels;
      existente.data.datasets.forEach((ds, i) => Object.assign(ds, config.data.datasets[i]));
      existente.options = config.options;
      existente.update();
      return existente;
    }
    const grafico = new Chart(document.getElementById(canvasId), config);
    grafico.$tema = t;
    grafico.update("none");
    estado.graficos[nome] = grafico;
    return grafico;
  }

  function mostrarVazio(nome, vazio, mensagem) {
    const painel = $(`[data-grafico="${nome}"]`);
    const caixaVazia = $(".vazio-grafico", painel);
    const area = $(".grafico-area", painel);
    const tabela = $(".tabela-grafico", painel);
    const botao = $(".alternar-tabela", painel);
    const verTabela = botao.getAttribute("aria-pressed") === "true";
    caixaVazia.textContent = mensagem;
    caixaVazia.hidden = !vazio;
    area.hidden = vazio || verTabela;
    tabela.hidden = vazio || !verTabela;
    botao.disabled = vazio;
  }

  function renderizarGraficos(lista) {
    if (typeof Chart === "undefined") return;
    Chart.defaults.font.family = getComputedStyle(document.body).fontFamily;
    const msgVazio = estado.produtos.length ? "Nenhum produto corresponde aos filtros" : "Os gráficos aparecem quando houver produtos cadastrados";

    // 1) Valor em estoque por categoria (ignora o filtro de categoria e destaca a selecionada)
    const baseCategorias = produtosFiltrados({ ignorarCategoria: true });
    const porCategoria = new Map();
    baseCategorias.forEach((p) => {
      const c = porCategoria.get(p.categoria) || { valor: 0, produtos: 0, unidades: 0 };
      c.valor += p.preco * p.quantidade; c.produtos += 1; c.unidades += p.quantidade;
      porCategoria.set(p.categoria, c);
    });
    const cats = [...porCategoria.entries()].sort((a, b) => b[1].valor - a[1].valor);
    const selecionada = estado.filtro.categoria;
    estado.tabelas.categorias = {
      colunas: ["Categoria", "Produtos", "Unidades", "Valor em estoque"],
      numericas: [false, true, true, true],
      linhas: cats.map(([c, v]) => [c, inteiro(v.produtos), inteiro(v.unidades), moeda(v.valor)]),
    };
    mostrarVazio("categorias", !cats.length, msgVazio);
    criarOuAtualizar("categorias", "graficoCategorias", (t) => ({
      type: "bar",
      data: {
        labels: cats.map(([c]) => c),
        datasets: [{
          data: cats.map(([, v]) => v.valor),
          backgroundColor: cats.map(([c]) => (!selecionada || c === selecionada ? t.serie : t.apagado)),
          hoverBackgroundColor: cats.map(([c]) => (!selecionada || c === selecionada ? t.serie + "d9" : t.tinta3)),
          borderRadius: 4,
          borderSkipped: "start",
          maxBarThickness: 22,
          categoryPercentage: 0.8,
          barPercentage: 0.9,
        }],
      },
      options: {
        indexAxis: "y",
        maintainAspectRatio: false,
        // a área de hover/clique é a faixa inteira da categoria, não só a barra pintada
        interaction: { mode: "index", axis: "y", intersect: false },
        animation: { duration: 350 },
        layout: { padding: { right: 78 } },
        scales: eixos(t, { horizontal: true, formatarValor: moedaCompacta }),
        plugins: {
          legend: { display: false },
          tooltip: {
            ...dicaPadrao(t),
            callbacks: {
              title: (itens) => moeda(itens[0].raw),
              label: (item) => {
                const v = cats[item.dataIndex][1];
                return `${item.label}: ${plural(v.produtos, "produto", "produtos")}, ${plural(v.unidades, "unidade", "unidades")}`;
              },
              footer: (itens) => (cats[itens[0].dataIndex][0] === selecionada ? "Clique para remover o filtro" : "Clique para filtrar"),
            },
            footerColor: t.pagina,
            footerFont: { family: t.fonte, size: 12, weight: "400" },
          },
        },
        onHover: (evento, elementos) => { evento.native.target.style.cursor = elementos.length ? "pointer" : "default"; },
        onClick: (evento, elementos) => {
          if (!elementos.length) return;
          const c = cats[elementos[0].index][0];
          definirCategoria(estado.filtro.categoria === c ? "" : c);
        },
      },
      plugins: [pluginRotulos(moedaCompacta)],
    }));

    // 2) Total acumulado de produtos nos últimos 30 dias
    const hoje = new Date(); hoje.setHours(23, 59, 59, 999);
    const dias = [];
    for (let i = 29; i >= 0; i--) { const d = new Date(hoje); d.setDate(hoje.getDate() - i); dias.push(d); }
    const datas = lista.map((p) => lerData(p.criado_em).getTime()).sort((a, b) => a - b);
    let j = 0;
    const acumulado = dias.map((d) => { while (j < datas.length && datas[j] <= d.getTime()) j++; return j; });
    estado.tabelas.evolucao = {
      colunas: ["Dia", "Total de produtos"],
      numericas: [false, true],
      linhas: dias.map((d, i) => [dataCompleta(d), inteiro(acumulado[i])]).reverse(),
    };
    mostrarVazio("evolucao", !lista.length, msgVazio);
    criarOuAtualizar("evolucao", "graficoEvolucao", (t) => ({
      type: "line",
      data: {
        labels: dias.map(dataCurta),
        datasets: [{
          data: acumulado,
          borderColor: t.serie,
          backgroundColor: t.lavado,
          fill: true,
          borderWidth: 2,
          tension: 0.25,
          borderCapStyle: "round",
          borderJoinStyle: "round",
          pointRadius: 0,
          pointHoverRadius: 5,
          pointHoverBackgroundColor: t.serie,
          pointHoverBorderColor: t.superficie,
          pointHoverBorderWidth: 2,
          pointHitRadius: 12,
        }],
      },
      options: {
        maintainAspectRatio: false,
        animation: { duration: 350 },
        interaction: { mode: "index", intersect: false },
        layout: { padding: { top: 22, right: 8 } },
        scales: (() => {
          const s = eixos(t, { inteiros: true });
          s.x.ticks.maxTicksLimit = 7;
          s.x.ticks.maxRotation = 0;
          return s;
        })(),
        plugins: {
          legend: { display: false },
          tooltip: {
            ...dicaPadrao(t),
            callbacks: {
              title: (itens) => plural(itens[0].raw, "produto", "produtos"),
              label: (item) => `até ${dataCompleta(dias[item.dataIndex])}`,
            },
          },
        },
      },
      plugins: [pluginMira],
    }));

    // 3) Produtos por faixa de preço
    const faixas = [
      { rotulo: "Até R$ 50", curto: ["até", "R$ 50"], min: 0, max: 50 },
      { rotulo: "R$ 50 a 100", curto: ["50 a", "100"], min: 50, max: 100 },
      { rotulo: "R$ 100 a 250", curto: ["100 a", "250"], min: 100, max: 250 },
      { rotulo: "R$ 250 a 500", curto: ["250 a", "500"], min: 250, max: 500 },
      { rotulo: "R$ 500 a 1 mil", curto: ["500 a", "1 mil"], min: 500, max: 1000 },
      { rotulo: "Acima de R$ 1 mil", curto: ["acima", "de 1 mil"], min: 1000, max: Infinity },
    ];
    const contagem = faixas.map((f) => lista.filter((p) => p.preco >= f.min && p.preco < f.max).length);
    estado.tabelas.precos = {
      colunas: ["Faixa de preço", "Produtos"],
      numericas: [false, true],
      linhas: faixas.map((f, i) => [f.rotulo, inteiro(contagem[i])]),
    };
    mostrarVazio("precos", !lista.length, msgVazio);
    criarOuAtualizar("precos", "graficoPrecos", (t) => ({
      type: "bar",
      data: {
        labels: faixas.map((f) => f.rotulo),
        datasets: [{
          data: contagem,
          backgroundColor: t.serie,
          hoverBackgroundColor: t.serie + "d9",
          borderRadius: 4,
          borderSkipped: "start",
          maxBarThickness: 24,
        }],
      },
      options: {
        maintainAspectRatio: false,
        animation: { duration: 350 },
        layout: { padding: { top: 22 } },
        interaction: { mode: "index", axis: "x", intersect: false },
        scales: (() => {
          const s = eixos(t, { inteiros: true });
          s.x.ticks.maxRotation = 0;
          s.x.ticks.autoSkip = false;
          s.x.ticks.font = { family: t.fonte, size: 11.5 };
          // Em telas estreitas, rótulos curtos para não sobrepor
          s.x.ticks.callback = function (valor, i) { return this.chart.width < 520 ? faixas[i].curto : faixas[i].rotulo; };
          return s;
        })(),
        plugins: {
          legend: { display: false },
          tooltip: {
            ...dicaPadrao(t),
            callbacks: {
              title: (itens) => plural(itens[0].raw, "produto", "produtos"),
              label: (item) => item.label,
            },
          },
        },
      },
      plugins: [pluginRotulos(inteiro)],
    }));

    // Atualiza as tabelas dos gráficos que estiverem em modo tabela
    $$("[data-grafico]").forEach((painel) => {
      if ($(".alternar-tabela", painel).getAttribute("aria-pressed") === "true") montarTabelaGrafico(painel);
    });
  }

  function recriarGraficos() {
    Object.values(estado.graficos).forEach((g) => g.destroy());
    estado.graficos = {};
    renderizarGraficos(produtosFiltrados());
  }

  function montarTabelaGrafico(painel) {
    const dados = estado.tabelas[painel.dataset.grafico];
    const caixa = $(".tabela-grafico", painel);
    if (!dados) return;
    const th = dados.colunas.map((c, i) => el("th", { scope: "col", class: dados.numericas[i] ? "num" : null, text: c }));
    const linhas = dados.linhas.map((l) => el("tr", {}, ...l.map((v, i) => el("td", { class: dados.numericas[i] ? "num" : null, text: v }))));
    caixa.replaceChildren(el("table", {}, el("thead", {}, el("tr", {}, ...th)), el("tbody", {}, ...linhas)));
  }

  function alternarTabelaGrafico(botao) {
    const painel = botao.closest("[data-grafico]");
    const ativo = botao.getAttribute("aria-pressed") !== "true";
    botao.setAttribute("aria-pressed", String(ativo));
    $("span", botao).textContent = ativo ? "Ver gráfico" : "Ver tabela";
    botao.replaceChild(icone(ativo ? "chart" : "table"), $("svg", botao));
    if (ativo) montarTabelaGrafico(painel);
    $(".grafico-area", painel).hidden = ativo;
    $(".tabela-grafico", painel).hidden = !ativo;
  }

  // ---------- Tabela de produtos ----------
  function valorOrdenacao(p, campo) {
    if (campo === "valor") return p.preco * p.quantidade;
    if (campo === "criado_em") return lerData(p.criado_em).getTime();
    return p[campo];
  }

  function renderizarTabela(lista) {
    const { campo, direcao } = estado.ordem;
    const ordenados = [...lista].sort((a, b) => {
      const va = valorOrdenacao(a, campo), vb = valorOrdenacao(b, campo);
      const r = typeof va === "string" ? va.localeCompare(vb, "pt-BR") : va - vb;
      return r * direcao || a.id - b.id;
    });

    $$("#tabelaProdutos th").forEach((th) => {
      const b = $("button", th);
      if (b && b.dataset.ordem === campo) th.setAttribute("aria-sort", direcao === 1 ? "ascending" : "descending");
      else th.removeAttribute("aria-sort");
    });

    const corpo = $("#corpoTabela");
    corpo.replaceChildren(...ordenados.map(linhaProduto));

    const vazio = $("#vazioTabela");
    const temProdutos = estado.produtos.length > 0;
    vazio.hidden = !estado.carregou || lista.length > 0;
    $(".tabela-rolagem").hidden = lista.length === 0;
    if (!lista.length) {
      $("#vazioTitulo").textContent = temProdutos ? "Nenhum produto encontrado" : "Nenhum produto cadastrado ainda";
      $("#vazioTexto").textContent = temProdutos
        ? "Nenhum produto corresponde à busca ou à categoria escolhida."
        : "Cadastre o primeiro produto ou carregue alguns exemplos para ver os gráficos funcionando.";
      const acoes = $("#vazioAcoes");
      acoes.replaceChildren();
      if (temProdutos) {
        acoes.append(el("button", { class: "botao", type: "button", "data-acao": "limpar", text: "Limpar filtros" }));
      } else {
        const novo = el("button", { class: "botao primario", type: "button", "data-acao": "novo" }, icone("plus"), document.createTextNode("Novo produto"));
        acoes.append(novo, el("button", { class: "botao", type: "button", "data-acao": "exemplos", text: "Carregar dados de exemplo" }));
      }
    }
  }

  function linhaProduto(p) {
    const criado = lerData(p.criado_em);
    let selo = null;
    if (p.quantidade === 0) selo = el("span", { class: "selo critico" }, icone("x-circle"), document.createTextNode("Esgotado"));
    else if (p.quantidade < ESTOQUE_BAIXO) selo = el("span", { class: "selo alerta" }, icone("alert"), document.createTextNode("Baixo"));

    const editar = el("button", { class: "botao fantasma", type: "button", "data-editar": p.id, "aria-label": `Editar ${p.nome}` },
      icone("edit"), document.createTextNode("Editar"));
    const excluir = el("button", { class: "botao fantasma excluir", type: "button", "data-excluir": p.id, "aria-label": `Excluir ${p.nome}` },
      icone("trash"), document.createTextNode("Excluir"));

    return el("tr", {},
      el("td", { class: "col-id", text: `#${p.id}` }),
      el("td", {},
        el("div", { class: "produto-nome", text: p.nome }),
        p.descricao ? el("div", { class: "produto-desc", text: p.descricao, title: p.descricao }) : null),
      el("td", {}, el("span", { class: "chip-categoria", text: p.categoria })),
      el("td", { class: "num", text: moeda(p.preco) }),
      el("td", { class: "num" }, el("span", { class: "estoque" }, selo, document.createTextNode(inteiro(p.quantidade)))),
      el("td", { class: "num", text: moeda(p.preco * p.quantidade) }),
      el("td", { class: "data", text: isNaN(criado) ? p.criado_em : dataHora(criado) }),
      el("td", {}, el("div", { class: "acoes" }, editar, excluir)),
    );
  }

  // ---------- Filtros ----------
  function definirCategoria(c) {
    estado.filtro.categoria = c;
    $("#filtroCategoria").value = c;
    renderizar();
  }

  // ---------- Formulário (criar / editar) ----------
  const dialogo = $("#dialogoProduto");
  const form = $("#formProduto");

  function limparErros() {
    $$(".erro-campo", form).forEach((e) => (e.textContent = ""));
    $$(".campo", form).forEach((c) => c.classList.remove("invalido"));
    $("#erroGeral").hidden = true;
  }

  function abrirFormulario(produto = null) {
    limparErros();
    form.reset();
    estado.editandoId = produto ? produto.id : null;
    $("#dialogoTitulo").textContent = produto ? "Editar produto" : "Novo produto";
    $("#botaoSalvar").textContent = produto ? "Salvar alterações" : "Criar produto";
    $("#requisicaoInfo").textContent = produto ? `Envia: PUT /produtos/${produto.id}` : "Envia: POST /produtos";
    if (produto) {
      form.nome.value = produto.nome;
      form.categoria.value = produto.categoria;
      form.preco.value = produto.preco;
      form.quantidade.value = produto.quantidade;
      form.descricao.value = produto.descricao || "";
    } else if (estado.filtro.categoria) {
      form.categoria.value = estado.filtro.categoria;
    }
    dialogo.showModal();
    form.nome.focus();
  }

  function mostrarErroCampo(campo, mensagem) {
    const alvo = $(`[data-erro="${campo}"]`, form);
    if (alvo) {
      alvo.textContent = mensagem;
      alvo.closest(".campo").classList.add("invalido");
      return true;
    }
    return false;
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    limparErros();

    const numero = (v) => (v === "" ? 0 : Number(v));
    const dados = {
      nome: form.nome.value.trim(),
      categoria: form.categoria.value.trim() || "Geral",
      preco: numero(form.preco.value),
      quantidade: numero(form.quantidade.value),
      descricao: form.descricao.value.trim() || null,
    };

    let invalido = false;
    if (!dados.nome) invalido = mostrarErroCampo("nome", "Informe o nome do produto");
    if (form.preco.validity.badInput) invalido = mostrarErroCampo("preco", "Digite um número, por exemplo 249.90");
    if (form.quantidade.validity.badInput || !Number.isInteger(dados.quantidade)) invalido = mostrarErroCampo("quantidade", "Digite um número inteiro");
    if (invalido) return;

    const botao = $("#botaoSalvar");
    botao.disabled = true;
    try {
      if (estado.editandoId) {
        await api("PUT", `/produtos/${estado.editandoId}`, dados);
        aviso("Alterações salvas");
      } else {
        const novo = await api("POST", "/produtos", dados);
        aviso(`Produto #${novo.id} criado`);
      }
      dialogo.close();
      await carregar();
    } catch (erro) {
      if (erro.status === 422 && erro.corpo && Array.isArray(erro.corpo.erros)) {
        const soltos = erro.corpo.erros.filter((x) => !mostrarErroCampo(x.campo, x.mensagem));
        if (soltos.length) {
          $("#erroGeral").textContent = soltos.map((x) => `${x.campo}: ${x.mensagem}`).join(". ");
          $("#erroGeral").hidden = false;
        }
      } else {
        $("#erroGeral").textContent = erro.message;
        $("#erroGeral").hidden = false;
      }
    } finally {
      botao.disabled = false;
    }
  });

  // ---------- Exclusão ----------
  const dialogoExcluir = $("#dialogoExcluir");

  function abrirExclusao(produto) {
    estado.excluindoId = produto.id;
    $("#excluirTitulo").textContent = `Excluir ${produto.nome}?`;
    $("#excluirTexto").textContent = "O produto será removido do banco de dados. Essa ação não pode ser desfeita.";
    $("#excluirRequisicao").textContent = `Envia: DELETE /produtos/${produto.id}`;
    dialogoExcluir.showModal();
    $("[data-fechar]", dialogoExcluir).focus();
  }

  $("#botaoConfirmarExcluir").addEventListener("click", async (e) => {
    const botao = e.currentTarget;
    botao.disabled = true;
    try {
      await api("DELETE", `/produtos/${estado.excluindoId}`);
      dialogoExcluir.close();
      aviso("Produto excluído");
      await carregar();
    } catch (erro) {
      aviso(erro.message, "erro");
    } finally {
      botao.disabled = false;
    }
  });

  // ---------- Dados de exemplo ----------
  async function carregarExemplos(botao) {
    if (botao) botao.disabled = true;
    try {
      const r = await api("POST", "/exemplos");
      aviso(`${r.inseridos} produtos de exemplo carregados`);
      await carregar();
    } catch (erro) {
      aviso(erro.message, "erro");
      if (botao) botao.disabled = false;
    }
  }

  // ---------- Tema ----------
  function temaAtual() {
    const t = document.documentElement.dataset.theme;
    if (t) return t;
    return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  $("#botaoTema").addEventListener("click", () => {
    const novo = temaAtual() === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = novo;
    try { localStorage.setItem("tema", novo === "dark" ? "escuro" : "claro"); } catch (e) {}
    recriarGraficos();
  });
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    if (!document.documentElement.dataset.theme) recriarGraficos();
  });

  // ---------- Eventos ----------
  $("#botaoNovo").addEventListener("click", () => abrirFormulario());
  $("#botaoAtualizar").addEventListener("click", () => carregar());

  $("#filtroCategoria").addEventListener("change", (e) => definirCategoria(e.target.value));
  let espera;
  $("#filtroBusca").addEventListener("input", (e) => {
    clearTimeout(espera);
    espera = setTimeout(() => { estado.filtro.busca = e.target.value; renderizar(); }, 150);
  });

  $("#tabelaProdutos thead").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-ordem]");
    if (!b) return;
    const campo = b.dataset.ordem;
    estado.ordem = { campo, direcao: estado.ordem.campo === campo ? -estado.ordem.direcao : (["preco", "quantidade", "valor", "criado_em"].includes(campo) ? -1 : 1) };
    renderizarTabela(produtosFiltrados());
  });

  $("#corpoTabela").addEventListener("click", (e) => {
    const editar = e.target.closest("[data-editar]");
    const excluir = e.target.closest("[data-excluir]");
    const id = Number((editar || excluir || {}).dataset?.editar || (editar || excluir || {}).dataset?.excluir);
    const produto = estado.produtos.find((p) => p.id === id);
    if (!produto) return;
    if (editar) abrirFormulario(produto);
    if (excluir) abrirExclusao(produto);
  });

  $("#vazioTabela").addEventListener("click", (e) => {
    const b = e.target.closest("[data-acao]");
    if (!b) return;
    if (b.dataset.acao === "novo") abrirFormulario();
    if (b.dataset.acao === "exemplos") carregarExemplos(b);
    if (b.dataset.acao === "limpar") {
      estado.filtro = { categoria: "", busca: "" };
      $("#filtroBusca").value = "";
      renderizar();
    }
  });

  $$(".alternar-tabela").forEach((b) => b.addEventListener("click", () => alternarTabelaGrafico(b)));

  // Fechar diálogos: botões "Cancelar"/"X" e clique fora da caixa
  $$("dialog").forEach((d) => {
    d.addEventListener("click", (e) => {
      if (e.target.closest("[data-fechar]") || e.target === d) d.close();
    });
  });

  // ---------- Início ----------
  verificarSaude(true).then(carregar);
  setInterval(() => verificarSaude(false), 15000);
})();
