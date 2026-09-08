/* AcrylicArt — layout para aprovação
   Estado no localStorage, render completo a cada mudança estrutural.
   Textos usam contenteditable e gravam sem re-renderizar (o cursor não salta). */
(function () {
  'use strict';
  var KEY = 'acrylicart-layout-v1';
  var uid = function () { return Math.random().toString(36).slice(2, 9); };
  var today = function () { return new Date().toLocaleDateString('pt-BR'); };
  var esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  };
  // 7000 -> "70,00" (o usuário digita centavos, a vírgula entra sozinha)
  var moeda = function (digits) {
    var d = String(digits || '').replace(/\D/g, '').replace(/^0+(?=\d{3})/, '');
    if (!d) return '';
    while (d.length < 3) d = '0' + d;
    var int = d.slice(0, -2), cents = d.slice(-2);
    int = int.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return int + ',' + cents;
  };
  var soDigitos = function (v) { return String(v == null ? '' : v).replace(/\D/g, ''); };
  var ph = function (v) { return (v && String(v).trim()) ? '0' : '1'; };
  var pair = function () {
    return [
      { id: uid(), label: 'Altura total', valor: '' },
      { id: uid(), label: 'Largura frontal', valor: '' }
    ];
  };
  var newPiece = function () {
    return {
      id: uid(), nome: '', imgSrc: '', zoom: 1, ox: 0, oy: 0, desc: '',
      valor: '', valorOn: false, kit: false,
      medidas: [
        { id: uid(), label: 'Altura total', valor: '' },
        { id: uid(), label: 'Largura frontal', valor: '' },
        { id: uid(), label: 'Profundidade (base)', valor: '' }
      ],
      medidasB: pair(), medidasC: pair(), cotas: []
    };
  };

  var S = null, hist = [], snapAt = 0, sel = null, active = null, drag = null, saveT = null;

  function load() {
    var raw = null;
    try { raw = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) {}
    S = (raw && raw.pieces) ? raw : {
      cliente: '', data: today(), prazo: '',
      contato: '19 98108-9491 · @acrylicart.design',
      perPage: 1, plateLight: true, pieces: [newPiece()]
    };
    S.pieces.forEach(function (p) {
      p.nome = p.nome || ''; p.desc = p.desc || ''; p.valor = p.valor || '';
      p.valor = soDigitos(p.valor); p.valorOn = !!p.valorOn; p.kit = !!p.kit;
      p.medidas = p.medidas || []; p.medidasB = p.medidasB || pair(); p.medidasC = p.medidasC || pair();
      p.cotas = p.cotas || []; p.zoom = p.zoom || 1; p.ox = p.ox || 0; p.oy = p.oy || 0;
    });
    S.prazo = soDigitos(S.prazo).slice(0, 3);
    active = S.pieces[0] && S.pieces[0].id;
  }
  function save() {
    clearTimeout(saveT);
    saveT = setTimeout(function () {
      try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {}
    }, 350);
  }
  function snapshot(coalesce) {
    var now = Date.now();
    if (coalesce && snapAt && now - snapAt < 900) return;
    hist.push(JSON.stringify(S));
    if (hist.length > 40) hist.shift();
    snapAt = now;
  }
  function undo() {
    if (!hist.length) return;
    S = JSON.parse(hist.pop());
    snapAt = 0; sel = null;
    render(); save();
  }
  function piece(id) {
    for (var i = 0; i < S.pieces.length; i++) if (S.pieces[i].id === id) return S.pieces[i];
    return null;
  }
  function group(p, g) { return g === 'B' ? p.medidasB : g === 'C' ? p.medidasC : p.medidas; }
  function setGroup(p, g, v) { if (g === 'B') p.medidasB = v; else if (g === 'C') p.medidasC = v; else p.medidas = v; }

  /* ---------- render ---------- */
  function rowsHtml(p, g) {
    return group(p, g).map(function (m) {
      return '<div class="row" data-piece="' + p.id + '" data-group="' + g + '" data-row="' + m.id + '">' +
        '<span class="lbl" contenteditable="true" data-ph="Altura total" data-empty="' + ph(m.label) + '" data-field="label">' + esc(m.label) + '</span>' +
        '<span class="val" contenteditable="true" data-ph="00 cm" data-empty="' + ph(m.valor) + '" data-field="valor">' + esc(m.valor) + '</span>' +
        '<button class="icon no-print" data-act="row-remove" title="Remover linha">✕</button>' +
        '</div>';
    }).join('');
  }
  function groupHtml(p, g, label) {
    return '<div class="group-head"><span class="kicker">' + label + '</span><span class="line"></span>' +
      '<button class="icon no-print" data-act="row-add" data-piece="' + p.id + '" data-group="' + g + '" title="Adicionar linha">+</button></div>' +
      '<div class="rows">' + rowsHtml(p, g) + '</div>';
  }
  function cotaHtml(p, c) {
    var wantFlip = c.side ? c.side === 'b' : (c.v ? c.x < 16 : c.y < 10);
    var flip = c.v ? (c.x < 12 ? true : c.x > 90 ? false : wantFlip)
                   : (c.y < 8 ? true : c.y > 92 ? false : wantFlip);
    var pos = c.v
      ? 'left:' + c.x + '%;top:' + c.y + '%;height:' + c.len + '%;width:0'
      : 'left:' + c.x + '%;top:' + c.y + '%;width:' + c.len + '%;height:0';
    var cls = 'cota ' + (c.v ? 'v' : 'h') + (flip ? ' flip' : '') + (sel === c.id ? ' sel' : '') +
      (c.v && (c.y + c.len > 96) ? ' low' : '') + (!c.v && c.x < 14 ? ' near' : '');
    return '<div class="' + cls + '" style="' + pos + '" data-piece="' + p.id + '" data-cota="' + c.id + '">' +
      '<div class="ln"></div><div class="tk a"></div><div class="tk b"></div>' +
      '<div class="num" contenteditable="true" data-field="cota">' + esc(c.text) + '</div>' +
      '<div class="grip no-print" data-act="cota-len" title="Arraste para mudar o tamanho"></div>' +
      '<div class="ctrl no-print">' +
        '<button data-act="cota-flip" title="' + (c.v ? 'Número à esquerda ou à direita' : 'Número acima ou abaixo') + '">' + (c.v ? '⇄' : '⇅') + '</button>' +
        '<button data-act="cota-remove" title="Remover cota">✕</button>' +
      '</div></div>';
  }
  function pieceHtml(p) {
    var img = p.imgSrc
      ? '<img alt="" draggable="false" data-act="img-move" style="transform:translate(' + p.ox + 'px,' + p.oy + 'px) scale(' + p.zoom + ')">'
      : '';
    return '<div class="piece' + (p.kit ? ' kit' : '') + '" data-piece="' + p.id + '">' +
      '<div class="piece-head">' +
        '<span class="piece-title">' +
          '<b contenteditable="true" data-ph="TROFÉU – NOME DO EVENTO" data-empty="' + ph(p.nome) + '" data-field="nome">' + esc(p.nome) + '</b>' +
          '<i></i>' +
        '</span>' +
        '<button class="icon no-print" data-act="piece-remove" title="Remover peça">✕</button>' +
      '</div>' +
      '<div class="piece-body">' +
        '<div class="plate' + (S.plateLight ? '' : ' dark') + '" data-plate="' + p.id + '">' +
          img +
          (p.imgSrc ? '' : '<div class="drop no-print" data-act="pick"><b>Arraste o PNG aqui</b><small>ou clique para escolher · Ctrl+V cola</small></div>') +
          p.cotas.map(function (c) { return cotaHtml(p, c); }).join('') +
        '</div>' +
        '<div class="info">' +
          '<div class="tools no-print">' +
            '<button class="mini" data-act="cota-add" data-v="1">↕ Cota</button>' +
            '<button class="mini" data-act="cota-add" data-v="">↔ Cota</button>' +
            '<button class="mini" data-act="pick">Imagem</button>' +
            '<button class="mini" data-act="img-clear">Tirar</button>' +
            '<button class="mini" data-act="img-center">Centralizar</button>' +
            '<button class="mini" data-act="kit" aria-pressed="' + p.kit + '" title="Kit de pódio: medidas separadas por colocação">Kit: ' + (p.kit ? 'on' : 'off') + '</button>' +
            '<button class="mini" data-act="valor" aria-pressed="' + p.valorOn + '" title="Mostrar ou ocultar o valor">Valor: ' + (p.valorOn ? 'on' : 'off') + '</button>' +
            '<button class="mini" data-act="piece-dup">Duplicar</button>' +
            '<input type="range" min="0.3" max="3" step="0.02" value="' + p.zoom + '" data-act="zoom" title="Zoom da imagem">' +
          '</div>' +
          '<div>' + groupHtml(p, 'A', p.kit ? 'Campeão' : 'Medidas') +
            (p.kit ? groupHtml(p, 'B', '2º lugar') + groupHtml(p, 'C', '3º lugar') : '') +
          '</div>' +
          '<div>' +
            '<div class="group-head"><span class="kicker">Descrição</span><span class="line"></span></div>' +
            '<div class="desc" contenteditable="true" data-ph="Material, acabamento, gravação, cores…" data-empty="' + ph(p.desc) + '" data-field="desc">' + esc(p.desc) + '</div>' +
          '</div>' +
          '<div class="preco' + (p.valorOn ? '' : ' hidden') + '"><i></i><span class="kicker">Valor</span>' +
            '<span class="fix">R$</span>' +
            '<b contenteditable="true" inputmode="numeric" data-ph="0,00" data-empty="' + ph(p.valor) + '" data-field="valorTxt">' + esc(moeda(p.valor)) + '</b>' +
            '<span class="fix">' + (p.kit ? 'p/ kit' : 'p/ unidade') + '</span>' +
          '</div>' +
        '</div>' +
      '</div>' +
    '</div>';
  }
  function sheetHtml(pieces) {
    return '<div class="sheet">' +
      '<div class="edge"></div>' +
      '<div class="head">' +
        '<div class="wordmark"><img src="logo-acrylicart-branco.png" alt="AcrylicArt"><small>Premiações personalizadas</small></div>' +
        '<div class="head-meta">' +
          '<div class="field"><span class="kicker">Cliente / Evento</span>' +
            '<span class="cliente" contenteditable="true" data-ph="Nome do cliente ou evento" data-empty="' + ph(S.cliente) + '" data-doc="cliente">' + esc(S.cliente) + '</span></div>' +
          '<div class="field"><span class="kicker mute">Data</span>' +
            '<span class="data" contenteditable="true" data-ph="00/00/0000" data-empty="' + ph(S.data) + '" data-doc="data">' + esc(S.data) + '</span></div>' +
        '</div>' +
      '</div>' +
      '<div class="rule"></div>' +
      '<div class="grid n' + S.perPage + '">' + pieces.map(pieceHtml).join('') + '</div>' +
      '<div class="rule"></div>' +
      '<div class="foot">' +
        '<div class="field" style="text-align:left"><span class="kicker">Prazo de produção</span>' +
          '<span class="prazo-line"><span class="prazo" contenteditable="true" inputmode="numeric" data-ph="00" data-empty="' + ph(S.prazo) + '" data-doc="prazo">' + esc(S.prazo) + '</span>' +
          '<span class="fix">dias úteis após aprovação do layout.</span></span></div>' +
        '<div class="contato" contenteditable="true" data-ph="Telefone · Instagram" data-empty="' + ph(S.contato) + '" data-doc="contato">' + esc(S.contato) + '</div>' +
      '</div>' +
    '</div>';
  }
  function render() {
    var pages = [], list = S.pieces.length ? S.pieces : [newPiece()];
    for (var i = 0; i < list.length; i += S.perPage) pages.push(list.slice(i, i + S.perPage));
    document.getElementById('sheets').innerHTML = pages.map(sheetHtml).join('');
    // data URLs go on the element, never through an HTML attribute string
    S.pieces.forEach(function (p) {
      if (!p.imgSrc) return;
      var el = document.querySelector('[data-plate="' + p.id + '"] img');
      if (el) el.src = p.imgSrc;
    });
    document.querySelectorAll('[data-act="per-page"]').forEach(function (b) {
      b.setAttribute('aria-pressed', String(Number(b.dataset.n) === S.perPage));
    });
    var pb = document.querySelector('[data-act="plate"]');
    if (pb) pb.textContent = S.plateLight ? 'Placa: clara' : 'Placa: escura';
    var ub = document.querySelector('[data-act="undo"]');
    if (ub) ub.disabled = !hist.length;
  }

  /* ---------- imagens ---------- */
  function loadImage(pieceId, file) {
    var p = piece(pieceId) || S.pieces[0];
    if (!p || !file) return;
    var fr = new FileReader();
    fr.onload = function () {
      var img = new Image();
      img.onload = function () {
        var max = 1500, sc = Math.min(1, max / Math.max(img.width, img.height)), src = fr.result;
        if (sc < 1) {
          var cv = document.createElement('canvas');
          cv.width = Math.round(img.width * sc); cv.height = Math.round(img.height * sc);
          cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
          src = cv.toDataURL('image/png');
        }
        snapshot(false);
        p.imgSrc = src; p.zoom = 1; p.ox = 0; p.oy = 0;
        render(); save();
      };
      img.src = fr.result;
    };
    fr.readAsDataURL(file);
  }
  function pickFile(pieceId) {
    var inp = document.createElement('input');
    inp.type = 'file'; inp.accept = 'image/*';
    inp.onchange = function () { loadImage(pieceId, inp.files[0]); };
    inp.click();
  }

  /* ---------- arrastar ---------- */
  function startDrag(e, kind, p, c) {
    var plate = e.target.closest('.plate');
    if (!plate) return;
    e.preventDefault(); e.stopPropagation();
    snapshot(false);
    drag = { kind: kind, p: p, c: c, r: plate.getBoundingClientRect(), x: e.clientX, y: e.clientY,
      sx: c ? c.x : p.ox, sy: c ? c.y : p.oy, slen: c ? c.len : 0 };
  }
  function onMove(e) {
    if (!drag) return;
    var d = drag,
      dxp = (e.clientX - d.x) / d.r.width * 100,
      dyp = (e.clientY - d.y) / d.r.height * 100,
      cl = function (v, a, b) { return Math.max(a, Math.min(b, v)); };
    if (d.kind === 'img') { d.p.ox = d.sx + (e.clientX - d.x); d.p.oy = d.sy + (e.clientY - d.y); }
    else if (d.kind === 'move') { d.c.x = cl(d.sx + dxp, -6, 104); d.c.y = cl(d.sy + dyp, -6, 104); }
    else if (d.kind === 'len') { d.c.len = cl(d.slen + (d.c.v ? dyp : dxp), 4, 120); }
    render(); save();
  }

  /* ---------- exportação ---------- */
  function fileBase() {
    var n = (S.cliente || '').trim().replace(/[\\/:*?"<>|]+/g, '-');
    return 'Layout AcrylicArt' + (n ? ' - ' + n : '');
  }
  function exportPdf() {
    if (window.confirm('Gerar o PDF pela impressão do navegador.\n\nNa janela que abrir, confira:\n\n1) Destino: "Salvar como PDF" (NÃO use "Microsoft Print to PDF" — essa opção força página em pé)\n2) Em "Mais definições": Margens "Nenhuma", Escala "Padrão"\n3) Marque "Gráficos de segundo plano"\n\nA orientação paisagem é automática.')) {
      setTimeout(function () { window.print(); }, 60);
    }
  }
  function exportPng() {
    var btn = document.querySelector('[data-act="png"]');
    if (!window.htmlToImage) { window.alert('O gerador de imagem não carregou. Verifique a conexão e recarregue.'); return; }
    var sheets = Array.prototype.slice.call(document.querySelectorAll('.sheet'));
    if (!sheets.length) return;
    btn.textContent = 'Gerando PNG…'; btn.disabled = true;
    document.body.classList.add('capturing');
    var done = function () {
      document.body.classList.remove('capturing');
      btn.textContent = 'Exportar em PNG'; btn.disabled = false;
    };
    var limit = function (pr, ms) {
      return Promise.race([pr, new Promise(function (_, rej) {
        setTimeout(function () { rej(new Error('tempo esgotado')); }, ms);
      })]);
    };
    setTimeout(function () {
      var i = 0;
      var next = function () {
        if (i >= sheets.length) { done(); return; }
        var s = sheets[i];
        limit(window.htmlToImage.toPng(s, {
          pixelRatio: 2, backgroundColor: '#0A090D',
          width: s.offsetWidth, height: s.offsetHeight,
          style: { margin: '0', boxShadow: 'none', transform: 'none' }
        }), 30000).then(function (url) {
          var a = document.createElement('a');
          a.href = url;
          a.download = fileBase() + (sheets.length > 1 ? ' - ' + (i + 1) : '') + '.png';
          a.click();
          i++; setTimeout(next, 120);
        }).catch(function (err) {
          done();
          window.alert('Não foi possível gerar o PNG (' + err.message + ').\nUse "Exportar PDF pronto".');
        });
      };
      next();
    }, 80);
  }

  /* ---------- eventos ---------- */
  function caretEnd(el) {
    var r = document.createRange(), s = window.getSelection();
    r.selectNodeContents(el); r.collapse(false);
    s.removeAllRanges(); s.addRange(r);
  }
  function editable(e) {
    var el = e.target;
    if (!el.isContentEditable) return;
    var v = el.textContent;

    if (el.dataset.doc === 'prazo') {
      var dias = soDigitos(v).slice(0, 3);
      if (v !== dias) { el.textContent = dias; caretEnd(el); }
      el.dataset.empty = dias ? '0' : '1';
      snapshot(true); S.prazo = dias; save(); return;
    }
    if (el.dataset.field === 'valorTxt') {
      var pv = piece(el.closest('.piece').dataset.piece);
      var dig = soDigitos(v).slice(0, 11);
      var txt = moeda(dig);
      if (v !== txt) { el.textContent = txt; caretEnd(el); }
      el.dataset.empty = dig ? '0' : '1';
      snapshot(true); pv.valor = dig; save(); return;
    }
    el.dataset.empty = (v && v.trim()) ? '0' : '1';
    snapshot(true);
    if (el.dataset.doc) { S[el.dataset.doc] = v; save(); return; }
    var row = el.closest('.row');
    if (row) {
      var p = piece(row.dataset.piece);
      var arr = group(p, row.dataset.group);
      for (var i = 0; i < arr.length; i++) if (arr[i].id === row.dataset.row) arr[i][el.dataset.field] = v;
      save(); return;
    }
    var cota = el.closest('.cota');
    if (cota) {
      var pc = piece(cota.dataset.piece);
      pc.cotas.forEach(function (c) { if (c.id === cota.dataset.cota) c.text = v; });
      save(); return;
    }
    var pe = el.closest('.piece');
    if (pe) {
      var pp = piece(pe.dataset.piece);
      if (el.dataset.field === 'nome') pp.nome = v;
      else if (el.dataset.field === 'desc') pp.desc = v;
      else if (el.dataset.field === 'valorTxt') pp.valor = v;
      save();
    }
  }

  document.addEventListener('input', function (e) {
    var el = e.target;
    if (el.dataset && el.dataset.act === 'zoom') {
      var p = piece(el.closest('.piece').dataset.piece);
      snapshot(true); p.zoom = parseFloat(el.value);
      var img = document.querySelector('[data-plate="' + p.id + '"] img');
      if (img) img.style.transform = 'translate(' + p.ox + 'px,' + p.oy + 'px) scale(' + p.zoom + ')';
      save(); return;
    }
    editable(e);
  });

  document.addEventListener('click', function (e) {
    var t = e.target.closest('[data-act]');
    if (!t) return;
    var act = t.dataset.act;
    var pieceEl = t.closest('.piece');
    var p = pieceEl ? piece(pieceEl.dataset.piece) : null;
    var cotaEl = t.closest('.cota');
    var c = null;
    if (cotaEl && p) p.cotas.forEach(function (x) { if (x.id === cotaEl.dataset.cota) c = x; });

    switch (act) {
      case 'add-piece': snapshot(false); S.pieces.push(newPiece()); break;
      case 'undo': undo(); return;
      case 'per-page': snapshot(false); S.perPage = Number(t.dataset.n); break;
      case 'plate': snapshot(false); S.plateLight = !S.plateLight; break;
      case 'reset':
        if (!window.confirm('Limpar tudo e começar um layout novo?')) return;
        snapshot(false);
        S.cliente = ''; S.prazo = ''; S.data = today(); S.pieces = [newPiece()];
        break;
      case 'pdf': exportPdf(); return;
      case 'png': exportPng(); return;
      case 'pick': active = p.id; pickFile(p.id); return;
      case 'img-clear': snapshot(false); p.imgSrc = ''; break;
      case 'img-center': snapshot(false); p.ox = 0; p.oy = 0; p.zoom = 1; break;
      case 'kit': snapshot(false); p.kit = !p.kit; break;
      case 'valor': snapshot(false); p.valorOn = !p.valorOn; break;
      case 'piece-dup': {
        snapshot(false);
        var copy = JSON.parse(JSON.stringify(p));
        copy.id = uid();
        copy.medidas.forEach(function (m) { m.id = uid(); });
        copy.medidasB.forEach(function (m) { m.id = uid(); });
        copy.medidasC.forEach(function (m) { m.id = uid(); });
        copy.cotas.forEach(function (x) { x.id = uid(); });
        S.pieces.splice(S.pieces.indexOf(p) + 1, 0, copy);
        break;
      }
      case 'piece-remove':
        snapshot(false);
        S.pieces = S.pieces.filter(function (x) { return x.id !== p.id; });
        break;
      case 'cota-add':
        snapshot(false);
        var v = !!t.dataset.v;
        p.cotas.push({ id: uid(), v: v, text: '00 cm', x: v ? 10 : 24, y: v ? 14 : 84, len: v ? 66 : 52 });
        break;
      case 'cota-flip':
        snapshot(false);
        var wantFlip = c.side ? c.side === 'b' : (c.v ? c.x < 16 : c.y < 10);
        c.side = wantFlip ? 'a' : 'b';
        break;
      case 'cota-remove':
        snapshot(false);
        p.cotas = p.cotas.filter(function (x) { return x.id !== c.id; });
        sel = null;
        break;
      case 'row-add':
        snapshot(false);
        group(piece(t.dataset.piece), t.dataset.group).push({ id: uid(), label: '', valor: '' });
        break;
      case 'row-remove': {
        snapshot(false);
        var row = t.closest('.row'), pr = piece(row.dataset.piece);
        setGroup(pr, row.dataset.group, group(pr, row.dataset.group).filter(function (m) { return m.id !== row.dataset.row; }));
        break;
      }
      default: return;
    }
    render(); save();
  });

  document.addEventListener('pointerdown', function (e) {
    var plate = e.target.closest('.plate');
    if (plate) active = plate.dataset.plate;
    var cotaEl = e.target.closest('.cota');
    if (cotaEl) {
      var p = piece(cotaEl.dataset.piece), c = null;
      p.cotas.forEach(function (x) { if (x.id === cotaEl.dataset.cota) c = x; });
      if (e.target.closest('.ctrl') || e.target.isContentEditable) return;
      if (sel !== c.id) { sel = c.id; render(); }
      if (e.target.classList.contains('grip')) startDrag(e, 'len', p, c);
      else startDrag(e, 'move', p, c);
      return;
    }
    if (sel) { sel = null; render(); }
    if (e.target.tagName === 'IMG' && plate) {
      var pp = piece(plate.dataset.plate);
      if (pp.imgSrc) startDrag(e, 'img', pp, null);
    }
  });
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', function () { drag = null; });

  document.addEventListener('dragover', function (e) { if (e.target.closest('.plate')) e.preventDefault(); });
  document.addEventListener('drop', function (e) {
    var plate = e.target.closest('.plate');
    if (!plate) return;
    e.preventDefault();
    active = plate.dataset.plate;
    var f = e.dataTransfer.files && e.dataTransfer.files[0];
    if (f) loadImage(active, f);
  });
  window.addEventListener('paste', function (e) {
    var items = (e.clipboardData && e.clipboardData.items) || [];
    for (var i = 0; i < items.length; i++) {
      if (items[i].type && items[i].type.indexOf('image') === 0) {
        var f = items[i].getAsFile();
        if (f) { e.preventDefault(); loadImage(active, f); }
        return;
      }
    }
  });
  window.addEventListener('keydown', function (e) {
    if ((e.ctrlKey || e.metaKey) && String(e.key).toLowerCase() === 'z') { e.preventDefault(); undo(); }
  });

  load();
  render();
})();
