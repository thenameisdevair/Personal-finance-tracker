(() => {
  // ---------- Storage Keys ----------
  const STORAGE = { TX: 'pft.transactions', CAT: 'pft.categories' };

  // ---------- State ----------
  /** @type {{id:string,type:'income'|'expense',amount:number,date:string,category:string,notes?:string}[]} */
  let transactions = load(STORAGE.TX, []);
  let categories = toCategorySets(load(STORAGE.CAT, {
    income: ['Salary', 'Bonus', 'Interest'],
    expense: ['Food', 'Rent', 'Transport']
  }));

  // ---------- Elements ----------
  const el = (id) => document.getElementById(id);
  const txForm = el('txForm'), amount = el('amount'), date = el('date'),
        type = el('type'), category = el('category'), notes = el('notes');

  const catForm = el('catForm'), newCategory = el('newCategory'),
        catType = el('catType'), categoryList = el('categoryList');

  const txTbody = el('txTbody'),
        totalIncome = el('totalIncome'), totalExpense = el('totalExpense'), net = el('net');

  const fText = el('fText'), fType = el('fType'), fCategory = el('fCategory'),
        fFrom = el('fFrom'), fTo = el('fTo'), sortBy = el('sortBy'), clearFilters = el('clearFilters');

  const exportCsv = el('exportCsv'), resetAll = el('resetAll');

  // ---------- Utils ----------
  function load(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } }
  function save(key, value) { localStorage.setItem(key, JSON.stringify(value)); }
  function uid() { return Math.random().toString(36).slice(2, 10); }
  function toCategorySets(obj){ return { income: new Set(obj.income||[]), expense: new Set(obj.expense||[]) }; }
  function fromCategorySets(sets){ return { income: [...sets.income], expense: [...sets.expense] }; }

  function currency(n){
    return new Intl.NumberFormat(undefined, { style:'currency', currency: guessCurrency() }).format(n);
  }
  function guessCurrency(){ try { return Intl.NumberFormat().resolvedOptions().currency || 'USD'; } catch { return 'USD'; } }

  function escapeHtml(s){
    return String(s).replace(/[&<>\"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  // ---------- Category UI ----------
  function renderCategories(){
    // main select (depends on type)
    const current = category.value;
    category.innerHTML = '';
    const pool = type.value === 'income' ? categories.income : categories.expense;
    for (const c of pool){
      const opt = document.createElement('option'); opt.value = c; opt.textContent = c; category.appendChild(opt);
    }
    if (current && [...pool].includes(current)) category.value = current;

    // filter select (all categories)
    const prev = fCategory.value;
    fCategory.innerHTML = '';
    const all = new Set([...categories.income, ...categories.expense]);
    const optAll = document.createElement('option'); optAll.value = 'all'; optAll.textContent = 'All categories';
    fCategory.appendChild(optAll);
    for (const c of all){
      const opt = document.createElement('option'); opt.value = c; opt.textContent = c; fCategory.appendChild(opt);
    }
    if (prev) fCategory.value = prev;

    // list of pills with remove
    categoryList.innerHTML = '';
    for (const c of categories.income) addPill('income', c);
    for (const c of categories.expense) addPill('expense', c);
  }

  function addPill(kind, name){
    const li = document.createElement('li'); li.className = 'pill';
    const tag = document.createElement('span'); tag.textContent = `${name} (${kind})`;
    const x = document.createElement('button'); x.className = 'x'; x.textContent = '×';
    x.onclick = () => { (kind==='income'?categories.income:categories.expense).delete(name); persistCategories(); renderCategories(); render(); };
    li.append(tag, x); categoryList.appendChild(li);
  }

  function persistCategories(){ save(STORAGE.CAT, fromCategorySets(categories)); }

  // ---------- Transactions ----------
  function addTx(t){ transactions.push(t); save(STORAGE.TX, transactions); }
  function removeTx(id){ transactions = transactions.filter(t => t.id !== id); save(STORAGE.TX, transactions); }

  function filteredAndSorted(){
    const q = fText.value.trim().toLowerCase();
    const kind = fType.value; // all | income | expense
    const cat = fCategory.value; // all or name
    const from = fFrom.value ? new Date(fFrom.value) : null;
    const to = fTo.value ? new Date(fTo.value) : null;

    let out = transactions.filter(t => {
      if (kind!=='all' && t.type!==kind) return false;
      if (cat!=='all' && t.category!==cat) return false;
      const d = new Date(t.date);
      if (from && d < from) return false;
      if (to && d > to) return false;
      if (q && !(t.notes||'').toLowerCase().includes(q)) return false;
      return true;
    });

    switch (sortBy.value){
      case 'date-asc': out.sort((a,b)=> new Date(a.date)-new Date(b.date)); break;
      case 'date-desc': out.sort((a,b)=> new Date(b.date)-new Date(a.date)); break;
      case 'amount-asc': out.sort((a,b)=> a.amount-b.amount); break;
      case 'amount-desc': out.sort((a,b)=> b.amount-a.amount); break;
    }
    return out;
  }

  function render(){
    const rows = filteredAndSorted();
    txTbody.innerHTML = '';
    let inc = 0, exp = 0;

    for (const t of rows){
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${t.date}</td>
        <td>${t.type[0].toUpperCase()+t.type.slice(1)}</td>
        <td>${t.category}</td>
        <td class="right">${currency(t.amount * (t.type==='expense'?-1:1))}</td>
        <td>${escapeHtml(t.notes||'')}</td>
        <td><button class="btn btn-ghost" data-del="${t.id}">Delete</button></td>
      `;
      txTbody.appendChild(tr);
      if (t.type==='income') inc += t.amount; else exp += t.amount;
    }

    totalIncome.textContent = `+${currency(inc)}`;
    totalExpense.textContent = `-${currency(exp)}`;
    net.textContent = `= ${currency(inc-exp)}`;

    updateChart(inc, exp);

    txTbody.querySelectorAll('[data-del]').forEach(btn => {
      btn.addEventListener('click', () => { removeTx(btn.dataset.del); render(); });
    });
  }

  // ---------- Chart ----------
  let chart;
  function updateChart(inc, exp){
    const ctx = document.getElementById('ieChart');
    const data = { labels:['Income','Expense'], datasets:[{ label:'Totals', data:[inc, exp] }] };
    const opts = { responsive:true, plugins:{ legend:{ display:false } } };
    if (!chart) chart = new Chart(ctx, { type:'bar', data, options: opts });
    else { chart.data = data; chart.update(); }
  }

  // ---------- CSV ----------
  function toCSV(list){
    const head = ['id','type','amount','date','category','notes'];
    const rows = list.map(t => [t.id, t.type, t.amount, t.date, t.category, (t.notes||'').replace(/\n/g,' ') ]);
    return [head, ...rows].map(r=> r.map(csvEscape).join(',')).join('\n');
  }
  function csvEscape(v){
    const s = String(v);
    return /[",\n]/.test(s) ? '"'+s.replace(/"/g,'""')+'"' : s;
  }
  function download(filename, text){
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], {type:'text/csv'}));
    a.download = filename; a.click();
  }

  // ---------- Events ----------
  txForm.addEventListener('submit', (e)=>{
    e.preventDefault();
    const amt = parseFloat(amount.value);
    if (!isFinite(amt) || amt <= 0) return alert('Enter a valid amount');
    if (!date.value) return alert('Choose a date');
    if (!category.value) return alert('Select a category');

    addTx({ id: uid(), type: type.value, amount: amt, date: date.value, category: category.value, notes: notes.value.trim() });
    txForm.reset();
    renderCategories();
    render();
  });

  type.addEventListener('change', renderCategories);

  catForm.addEventListener('submit', (e)=>{
    e.preventDefault();
    const name = newCategory.value.trim();
    const kind = catType.value;
    if (!name) return;
    (kind==='income'?categories.income:categories.expense).add(name);
    persistCategories();
    newCategory.value='';
    renderCategories();
  });

  [fText, fType, fCategory, fFrom, fTo, sortBy].forEach(elm => elm.addEventListener('input', render));
  clearFilters.addEventListener('click', ()=>{
    fText.value=''; fType.value='all'; fCategory.value='all'; fFrom.value=''; fTo.value=''; sortBy.value='date-desc'; render();
  });

  exportCsv.addEventListener('click', ()=> download('transactions.csv', toCSV(filteredAndSorted())));

  resetAll.addEventListener('click', ()=>{
    if (confirm('This will clear ALL data (transactions & categories). Continue?')){
      transactions = [];
      categories = toCategorySets({ income: ['Salary','Bonus','Interest'], expense: ['Food','Rent','Transport'] });
      save(STORAGE.TX, transactions);
      save(STORAGE.CAT, fromCategorySets(categories));
      renderCategories();
      render();
    }
  });

  // ---------- Init ----------
  const today = new Date().toISOString().slice(0,10);
  date.value = today;
  renderCategories();
  render();

  // expose tiny helpers for tests (optional)
  window.__PFT__ = { toCSV, csvEscape };
})();
