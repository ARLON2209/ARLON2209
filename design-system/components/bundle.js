/* @ds-bundle: {"format":4,"namespace":"Trafego","components":[{"name":"Button"},{"name":"StatusBadge"},{"name":"Toggle"},{"name":"KpiCard"},{"name":"AccountCard"},{"name":"CampaignTable"},{"name":"BudgetEditor"},{"name":"ConfirmDialog"},{"name":"CommandBar"},{"name":"ChatMessage"},{"name":"AppNav"}]} */
(function () {
  var React = window.React, h = React.createElement;
  function cx() { return Array.prototype.filter.call(arguments, Boolean).join(' '); }
  function brl(n) { return 'R$ ' + Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function omit(o, keys) { var r = {}; for (var k in o) if (keys.indexOf(k) < 0) r[k] = o[k]; return r; }

  function Button(p) {
    var variant = p.variant || 'secondary';
    return h('button', Object.assign({ type: 'button' }, omit(p, ['variant', 'size', 'className']), {
      className: cx('tp-btn', 'tp-btn-' + variant, p.size === 'sm' && 'tp-btn-sm', p.className)
    }));
  }

  var STATUS = { ativa: 'Ativa', pausada: 'Pausada', revisao: 'Em análise', alerta: 'Saldo baixo', erro: 'Sem saldo' };
  function StatusBadge(p) {
    var s = p.status || 'ativa';
    return h('span', { className: 'tp-badge tp-badge-' + s }, p.children || STATUS[s]);
  }

  function Toggle(p) {
    return h('button', {
      type: 'button', role: 'switch', className: 'tp-toggle', 'aria-checked': !!p.checked,
      'aria-label': p.label, disabled: p.disabled,
      onClick: function () { if (p.onChange) p.onChange(!p.checked); }
    });
  }

  function KpiCard(p) {
    var d = p.delta, good = p.goodWhen === 'down' ? d < 0 : d > 0;
    var tone = d == null || d === 0 ? 'flat' : good ? 'good' : 'bad';
    return h('div', { className: 'tp-card tp-kpi' },
      h('span', { className: 'tp-label' }, p.label),
      h('span', { className: 'tp-kpi-value' }, p.value),
      d == null ? null : h('span', { className: 'tp-delta tp-delta-' + tone },
        (d > 0 ? '▲ ' : d < 0 ? '▼ ' : '■ ') + Math.abs(d).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + '% ',
        h('span', { className: 'tp-muted' }, p.compare || 'vs. ontem')));
  }

  function AccountCard(p) {
    var s = p.status || 'ativa';
    return h('div', { className: 'tp-card tp-acc' },
      h('div', { className: 'tp-acc-head' },
        h('div', null, h('div', { className: 'tp-acc-name' }, p.name), h('div', { className: 'tp-acc-id' }, p.accountId)),
        h(StatusBadge, { status: s })),
      p.alert ? h('div', { className: cx('tp-acc-alert', s === 'erro' && 'is-erro') }, p.alert) : null,
      h('div', { className: 'tp-acc-stats' },
        h('div', { className: 'tp-acc-stat' }, h('span', { className: 'tp-label' }, 'Saldo'), h('b', null, brl(p.balance))),
        h('div', { className: 'tp-acc-stat' }, h('span', { className: 'tp-label' }, 'Gasto hoje'), h('b', null, brl(p.spendToday))),
        h('div', { className: 'tp-acc-stat' }, h('span', { className: 'tp-label' }, 'Campanhas ativas'), h('b', null, String(p.activeCampaigns))),
        h('div', { className: 'tp-acc-stat' }, h('span', { className: 'tp-label' }, p.resultLabel || 'CPA'), h('b', null, p.result))),
      p.onOpen ? h(Button, { variant: 'ghost', size: 'sm', onClick: p.onOpen }, 'Abrir conta ›') : null);
  }

  function CampaignTable(p) {
    var rows = p.rows || [];
    return h('div', { className: 'tp-table-wrap' },
      h('table', { className: 'tp-table' },
        h('thead', null, h('tr', null,
          h('th', null, ''), h('th', null, 'Campanha'), h('th', null, 'Status'),
          h('th', { className: 'num' }, 'Orçamento/dia'), h('th', { className: 'num' }, 'Gasto'),
          h('th', { className: 'num' }, 'Resultados'), h('th', { className: 'num' }, 'CPA'), h('th', null, ''))),
        h('tbody', null, rows.map(function (r) {
          return h('tr', { key: r.id, className: r.edited ? 'is-edited' : null },
            h('td', null, h(Toggle, { checked: r.status === 'ativa', label: (r.status === 'ativa' ? 'Pausar ' : 'Ativar ') + r.name, disabled: r.status === 'revisao',
              onChange: function (v) { if (p.onToggle) p.onToggle(r, v); } })),
            h('td', null, h('div', { className: 'tp-camp-name' }, r.name), h('div', { className: 'tp-camp-obj' }, r.objective)),
            h('td', null, h(StatusBadge, { status: r.status })),
            h('td', { className: 'num' }, brl(r.budget)),
            h('td', { className: 'num' }, brl(r.spend)),
            h('td', { className: 'num' }, String(r.results)),
            h('td', { className: 'num' }, r.results ? brl(r.spend / r.results) : '—'),
            h('td', null, h(Button, { variant: 'ghost', size: 'sm', onClick: function () { if (p.onEditBudget) p.onEditBudget(r); } }, 'Editar')));
        }))));
  }

  function BudgetEditor(p) {
    var st = React.useState(p.value != null ? p.value : p.current), v = st[0], setV = st[1];
    var n = Number(v) || 0, diff = p.current ? ((n - p.current) / p.current) * 100 : 0;
    var steps = p.steps || [10, 20, 50];
    return h('div', { className: 'tp-card tp-budget' },
      h('div', null, h('div', { className: 'tp-label' }, 'Orçamento diário'), h('div', { className: 'tp-acc-name' }, p.campaign)),
      h('div', { className: 'tp-input-wrap' }, h('span', null, 'R$'),
        h('input', { className: 'tp-input', inputMode: 'decimal', value: v, 'aria-label': 'Novo orçamento diário',
          onChange: function (e) { setV(e.target.value.replace(',', '.')); } })),
      h('div', { className: 'tp-chips' }, steps.map(function (s) {
        return h('button', { key: s, type: 'button', className: 'tp-chip', onClick: function () { setV(Math.round(p.current * (1 + s / 100) * 100) / 100); } }, '+' + s + '%');
      })),
      h('div', { className: 'tp-diff' }, brl(p.current), ' → ', h('b', null, brl(n)), ' ',
        h('span', { className: diff > 30 ? 'tp-delta-bad' : 'tp-delta-flat' }, (diff >= 0 ? '+' : '') + diff.toFixed(1).replace('.', ',') + '%')),
      diff > 30 ? h('div', { className: 'tp-acc-alert' }, 'Aumento acima de 30% pode reiniciar a fase de aprendizado.') : null,
      h('div', { className: 'tp-row' },
        h(Button, { variant: 'primary', disabled: n <= 0 || n === p.current, onClick: function () { if (p.onSave) p.onSave(n); } }, 'Revisar alteração'),
        h(Button, { variant: 'ghost', onClick: p.onCancel }, 'Cancelar')));
  }

  function ConfirmDialog(p) {
    var changes = p.changes || [];
    return h('div', { className: 'tp-dialog', role: 'dialog', 'aria-label': p.title },
      h('h3', null, p.title || 'Confirmar alterações'),
      h('ul', { className: 'tp-changes' }, changes.map(function (c, i) {
        return h('li', { key: i, className: 'tp-change' },
          h('span', { className: 'tp-change-what' }, c.what), h('span', { className: 'tp-acc-id' }, c.where),
          h('span', { className: 'tp-change-ft' }, c.from, '  →  ', h('b', null, c.to)));
      })),
      p.note ? h('div', { className: 'tp-dialog-note' }, p.note) : null,
      h('div', { className: 'tp-dialog-actions' },
        h(Button, { variant: 'ghost', onClick: p.onCancel }, 'Cancelar'),
        h(Button, { variant: p.destructive ? 'danger' : 'primary', onClick: p.onConfirm }, p.confirmLabel || 'Confirmar e aplicar')));
  }

  function CommandBar(p) {
    var st = React.useState(''), v = st[0], setV = st[1];
    function send(text) { if (text && p.onSubmit) p.onSubmit(text); setV(''); }
    return h('div', { className: 'tp-cmd' },
      h('form', { className: 'tp-cmd-box', onSubmit: function (e) { e.preventDefault(); send(v); } },
        h('span', { className: 'tp-cmd-prompt', 'aria-hidden': true }, '›'),
        h('input', { className: 'tp-cmd-input', value: v, placeholder: p.placeholder || 'Peça em português: "pausar campanha Black Friday"', 'aria-label': 'Comando',
          onChange: function (e) { setV(e.target.value); } }),
        h('span', { className: 'tp-kbd' }, 'Enter')),
      p.suggestions && p.suggestions.length ? h('div', { className: 'tp-chips' }, p.suggestions.map(function (s) {
        return h('button', { key: s, type: 'button', className: 'tp-chip', onClick: function () { send(s); } }, s);
      })) : null);
  }

  function ChatMessage(p) {
    var role = p.role || 'assistant';
    return h('div', { className: 'tp-msg tp-msg-' + role },
      h('span', { className: 'tp-msg-who' }, role === 'user' ? 'você ›' : 'claude'),
      h('div', { className: 'tp-msg-body' },
        (p.tools || []).map(function (t, i) { return h('div', { key: i, className: 'tp-msg-tool' }, t); }),
        p.children));
  }

  function AppNav(p) {
    var items = p.items || [];
    return h('nav', { className: 'tp-nav', 'aria-label': 'Principal' },
      h('div', { className: 'tp-nav-brand' }, h('span', null, '›_ '), p.brand || 'painel de tráfego'),
      items.map(function (it) {
        return h('button', { key: it.id, type: 'button', className: 'tp-nav-item', 'aria-current': it.id === p.current ? 'page' : undefined,
          onClick: function () { if (p.onSelect) p.onSelect(it.id); } },
          it.label, it.count != null ? h('span', { className: 'tp-nav-count' }, it.count) : null);
      }));
  }

  window.Trafego = Object.assign(window.Trafego || {}, {
    Button: Button, StatusBadge: StatusBadge, Toggle: Toggle, KpiCard: KpiCard, AccountCard: AccountCard,
    CampaignTable: CampaignTable, BudgetEditor: BudgetEditor, ConfirmDialog: ConfirmDialog,
    CommandBar: CommandBar, ChatMessage: ChatMessage, AppNav: AppNav, formatBRL: brl
  });
})();
