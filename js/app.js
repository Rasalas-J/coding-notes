// ===== 应用状态 =====
const State = {
  notes: [],
  currentView: 'list',
  filter: { type: 'all', date: null, category: null, search: '' },
  auth: { token: null, user: null, isAuthenticated: false },
  github: null,
  notesSha: null
};

// ===== 认证模块 =====
const Auth = {
  showLogin() {
    document.getElementById('loginModal').classList.remove('hidden');
    setTimeout(() => document.getElementById('tokenInput').focus(), 100);
  },

  hideLogin() {
    document.getElementById('loginModal').classList.add('hidden');
    document.getElementById('loginError').classList.add('hidden');
    document.getElementById('tokenInput').value = '';
  },

  async login() {
    const token = document.getElementById('tokenInput').value.trim();
    const remember = document.getElementById('rememberToken').checked;
    const errorEl = document.getElementById('loginError');

    if (!token) {
      errorEl.textContent = '请输入 Token';
      errorEl.classList.remove('hidden');
      return;
    }

    Utils.showLoading('验证 Token...');
    try {
      const api = new GitHubAPI(token);
      const user = await api.validateToken();

      State.auth.token = token;
      State.auth.user = user;
      State.auth.isAuthenticated = true;
      State.github = api;

      if (remember) {
        localStorage.setItem('gh_token', token);
      } else {
        sessionStorage.setItem('gh_token', token);
      }

      this.updateUI();
      this.hideLogin();
      Utils.toast('登录成功！', 'success');
    } catch (err) {
      errorEl.textContent = 'Token 验证失败：' + err.message;
      errorEl.classList.remove('hidden');
    } finally {
      Utils.hideLoading();
    }
  },

  logout() {
    State.auth.token = null;
    State.auth.user = null;
    State.auth.isAuthenticated = false;
    State.github = null;
    localStorage.removeItem('gh_token');
    sessionStorage.removeItem('gh_token');
    this.updateUI();

    // 如果在编辑页面，返回列表
    if (State.currentView === 'editor') {
      location.hash = '#/';
    }
    App.render();
    Utils.toast('已退出登录', 'info');
  },

  checkStoredToken() {
    const token = localStorage.getItem('gh_token') || sessionStorage.getItem('gh_token');
    if (token) {
      State.auth.token = token;
      State.auth.isAuthenticated = true;
      State.github = new GitHubAPI(token);
      // 异步验证 token
      State.github.validateToken().then(user => {
        State.auth.user = user;
        this.updateUI();
      }).catch(() => {
        this.logout();
      });
    }
  },

  updateUI() {
    const loginBtn = document.getElementById('loginBtn');
    const userMenu = document.getElementById('userMenu');
    const newNoteBtn = document.getElementById('newNoteBtn');

    if (State.auth.isAuthenticated) {
      loginBtn.classList.add('hidden');
      userMenu.classList.remove('hidden');
      newNoteBtn.classList.remove('hidden');
    } else {
      loginBtn.classList.remove('hidden');
      userMenu.classList.add('hidden');
      newNoteBtn.classList.add('hidden');
    }
  }
};

// ===== 主应用 =====
const App = {
  async init() {
    // 配置 marked
    if (typeof marked !== 'undefined') {
      marked.setOptions({ breaks: true, gfm: true });
    }

    // 检查存储的 token
    Auth.checkStoredToken();

    // 搜索事件
    let searchTimer;
    document.getElementById('searchInput').addEventListener('input', (e) => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        State.filter.search = e.target.value.toLowerCase();
        if (State.currentView === 'list') this.renderList();
      }, 300);
    });

    // 回车搜索
    document.getElementById('searchInput').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        State.filter.search = e.target.value.toLowerCase();
        if (State.currentView === 'list') this.renderList();
      }
    });

    // 登录弹窗 Enter 键
    document.getElementById('tokenInput').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') Auth.login();
    });

    // 移动端菜单
    document.getElementById('menuToggle').addEventListener('click', () => {
      document.getElementById('sidebar').classList.toggle('open');
      document.getElementById('sidebarOverlay').classList.toggle('show');
    });

    // 路由
    window.addEventListener('hashchange', () => this.handleRoute());

    // 加载数据
    await this.loadNotes();

    // 渲染
    this.handleRoute();
    this.renderSidebar();
  },

  async loadNotes() {
    try {
      // 尝试从 raw.githubusercontent 获取
      const response = await fetch(CONFIG.rawDataURL);
      if (response.ok) {
        const data = await response.json();
        State.notes = data.notes || [];
      } else if (response.status === 404) {
        State.notes = [];
      } else {
        throw new Error('加载失败');
      }
    } catch (err) {
      // 回退到 API
      try {
        const api = State.github || new GitHubAPI(null);
        const file = await api.getFile(CONFIG.dataPath);
        const data = JSON.parse(Utils.decodeBase64(file.content));
        State.notes = data.notes || [];
        State.notesSha = file.sha;
      } catch (err2) {
        State.notes = [];
        Utils.toast('数据加载失败，请刷新重试', 'error');
      }
    }

    // 如果已认证，获取 SHA
    if (State.auth.isAuthenticated && !State.notesSha) {
      try {
        const file = await State.github.getFile(CONFIG.dataPath);
        State.notesSha = file.sha;
      } catch (e) { /* 文件可能不存在 */ }
    }
  },

  async saveNotes(message) {
    if (!State.auth.isAuthenticated) {
      Utils.toast('请先登录', 'error');
      return false;
    }

    const data = JSON.stringify({ notes: State.notes }, null, 2);

    // 获取最新 SHA（防止冲突）
    try {
      const file = await State.github.getFile(CONFIG.dataPath);
      State.notesSha = file.sha;
    } catch (e) { /* 文件可能不存在，SHA 为 null */ }

    try {
      const result = await State.github.putFile(
        CONFIG.dataPath,
        data,
        State.notesSha,
        message || '更新笔记'
      );
      State.notesSha = result.content.sha;
      return true;
    } catch (err) {
      // 如果是冲突，重试一次
      if (err.message.includes('409') || err.message.includes('conflict')) {
        try {
          const file = await State.github.getFile(CONFIG.dataPath);
          State.notesSha = file.sha;
          const result = await State.github.putFile(
            CONFIG.dataPath,
            data,
            State.notesSha,
            message || '更新笔记'
          );
          State.notesSha = result.content.sha;
          return true;
        } catch (err2) {
          Utils.toast('保存失败：' + err2.message, 'error');
          return false;
        }
      }
      Utils.toast('保存失败：' + err.message, 'error');
      return false;
    }
  },

  handleRoute() {
    const hash = location.hash.slice(1) || '/';

    // 关闭移动端侧边栏
    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('sidebarOverlay').classList.remove('show');

    if (hash === '/' || hash === '') {
      State.currentView = 'list';
      State.filter.type = 'all';
      State.filter.date = null;
      State.filter.category = null;
      this.renderList();
    } else if (hash.startsWith('/type/')) {
      State.currentView = 'list';
      State.filter.type = hash.split('/')[2];
      State.filter.date = null;
      State.filter.category = null;
      this.renderList();
    } else if (hash.startsWith('/date/')) {
      State.currentView = 'list';
      State.filter.date = hash.split('/')[2];
      State.filter.type = 'all';
      State.filter.category = null;
      this.renderList();
    } else if (hash.startsWith('/category/')) {
      State.currentView = 'list';
      State.filter.category = decodeURIComponent(hash.split('/')[2]);
      State.filter.type = 'all';
      State.filter.date = null;
      this.renderList();
    } else if (hash.startsWith('/note/')) {
      State.currentView = 'detail';
      this.renderDetail(hash.split('/')[2]);
    } else if (hash === '/new') {
      if (!State.auth.isAuthenticated) {
        Utils.toast('请先登录', 'error');
        location.hash = '#/';
        return;
      }
      State.currentView = 'editor';
      Editor.show();
    } else if (hash.startsWith('/edit/')) {
      if (!State.auth.isAuthenticated) {
        Utils.toast('请先登录', 'error');
        location.hash = '#/';
        return;
      }
      State.currentView = 'editor';
      Editor.show(hash.split('/')[2]);
    }

    this.updateSidebarActive();
  },

  getFilteredNotes() {
    let notes = [...State.notes];

    // 按类型
    if (State.filter.type && State.filter.type !== 'all') {
      notes = notes.filter(n => n.type === State.filter.type);
    }

    // 按日期
    if (State.filter.date) {
      notes = notes.filter(n => Utils.getYearMonthKey(n.createdAt) === State.filter.date);
    }

    // 按分类
    if (State.filter.category) {
      notes = notes.filter(n => n.category === State.filter.category);
    }

    // 搜索
    if (State.filter.search) {
      const q = State.filter.search;
      notes = notes.filter(n =>
        (n.title || '').toLowerCase().includes(q) ||
        (n.content || '').toLowerCase().includes(q) ||
        (n.category || '').toLowerCase().includes(q) ||
        (n.topic || '').toLowerCase().includes(q)
      );
    }

    // 按日期倒序
    notes.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    return notes;
  },

  renderList() {
    const main = document.getElementById('mainContent');
    const notes = this.getFilteredNotes();

    let title = '所有内容';
    let subtitle = `共 ${notes.length} 条记录`;
    if (State.filter.type === 'note') title = '📝 学习笔记';
    else if (State.filter.type === 'project') title = '🚀 项目记录';
    if (State.filter.date) {
      const [y, m] = State.filter.date.split('-');
      title = `📅 ${y}年${parseInt(m)}月`;
    }
    if (State.filter.category) title = `🏷️ ${State.filter.category}`;

    if (notes.length === 0) {
      main.innerHTML = `
        <div class="page-header">
          <div>
            <h1 class="page-title">${title}</h1>
            <p class="page-subtitle">${subtitle}</p>
          </div>
          ${State.auth.isAuthenticated ? '<button class="btn btn-primary" onclick="Editor.show()"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> 新建笔记</button>' : ''}
        </div>
        <div class="empty-state">
          <div class="empty-state-icon">📝</div>
          <h3>暂无内容</h3>
          <p>${State.auth.isAuthenticated ? '点击「新建笔记」创建第一条记录' : '还没有任何笔记或项目记录'}</p>
        </div>
      `;
      return;
    }

    main.innerHTML = `
      <div class="page-header">
        <div>
          <h1 class="page-title">${title}</h1>
          <p class="page-subtitle">${subtitle}</p>
        </div>
        ${State.auth.isAuthenticated ? '<button class="btn btn-primary" onclick="Editor.show()"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> 新建笔记</button>' : ''}
      </div>
      <div class="note-grid">
        ${notes.map(n => this.renderNoteCard(n)).join('')}
      </div>
    `;
  },

  renderNoteCard(note) {
    const typeBadge = note.type === 'project'
      ? '<span class="badge badge-project">🚀 项目</span>'
      : '<span class="badge badge-note">📝 笔记</span>';

    const categoryBadge = note.category
      ? `<span class="badge badge-category">${Utils.escapeHtml(note.category)}</span>`
      : '';

    const excerpt = Utils.extractExcerpt(note.content || '');

    return `
      <a href="#/note/${note.id}" class="note-card">
        <div class="note-card-header">
          <div class="note-card-title">${Utils.escapeHtml(note.title || '无标题')}</div>
        </div>
        <div class="note-card-meta">
          ${typeBadge}
          ${categoryBadge}
          <span class="badge-date">${Utils.formatDate(note.createdAt)}</span>
        </div>
        <div class="note-card-excerpt">${Utils.escapeHtml(excerpt)}</div>
        ${note.topic ? `<div class="note-card-topic">📌 ${Utils.escapeHtml(note.topic)}</div>` : ''}
      </a>
    `;
  },

  renderDetail(id) {
    const main = document.getElementById('mainContent');
    const note = State.notes.find(n => n.id === id);

    if (!note) {
      main.innerHTML = `
        <a href="#/" class="back-link">← 返回列表</a>
        <div class="empty-state">
          <div class="empty-state-icon">🔍</div>
          <h3>未找到笔记</h3>
          <p>该笔记可能已被删除</p>
        </div>
      `;
      return;
    }

    const typeBadge = note.type === 'project'
      ? '<span class="badge badge-project">🚀 项目</span>'
      : '<span class="badge badge-note">📝 笔记</span>';

    const categoryBadge = note.category
      ? `<span class="badge badge-category">${Utils.escapeHtml(note.category)}</span>`
      : '';

    const contentHtml = Utils.renderMarkdown(note.content || '');

    const actions = State.auth.isAuthenticated ? `
      <div class="note-detail-actions">
        <button class="btn btn-primary btn-sm" onclick="Editor.show('${note.id}')">✏️ 编辑</button>
        <button class="btn btn-danger btn-sm" onclick="App.deleteNote('${note.id}')">🗑️ 删除</button>
      </div>
    ` : '';

    main.innerHTML = `
      <a href="#/" class="back-link">← 返回列表</a>
      <div class="note-detail">
        <div class="note-detail-header">
          <h1 class="note-detail-title">${Utils.escapeHtml(note.title || '无标题')}</h1>
          <div class="note-detail-meta">
            ${typeBadge}
            ${categoryBadge}
            ${note.topic ? `<span class="badge-date">📌 ${Utils.escapeHtml(note.topic)}</span>` : ''}
            <span class="badge-date">🕐 创建于 ${Utils.formatDateTime(note.createdAt)}</span>
            ${note.updatedAt && note.updatedAt !== note.createdAt ? `<span class="badge-date">✏️ 更新于 ${Utils.formatDateTime(note.updatedAt)}</span>` : ''}
          </div>
          ${actions}
        </div>
        <div class="note-detail-content markdown-body" id="noteContent">${contentHtml}</div>
      </div>
    `;

    // 高亮代码
    Utils.highlightCode(document.getElementById('noteContent'));
  },

  async deleteNote(id) {
    const note = State.notes.find(n => n.id === id);
    if (!note) return;

    if (!confirm(`确定要删除「${note.title}」吗？\n\n此操作不可撤销！`)) return;

    Utils.showLoading('删除中...');
    State.notes = State.notes.filter(n => n.id !== id);
    const success = await this.saveNotes(`删除笔记: ${note.title}`);

    if (success) {
      Utils.hideLoading();
      Utils.toast('删除成功', 'success');
      location.hash = '#/';
      this.renderList();
      this.renderSidebar();
    } else {
      // 恢复
      State.notes.push(note);
      Utils.hideLoading();
    }
  },

  renderSidebar() {
    // 日期分组
    const dateGroups = {};
    State.notes.forEach(n => {
      const key = Utils.getYearMonthKey(n.createdAt);
      const label = Utils.getYearMonth(n.createdAt);
      if (!dateGroups[key]) dateGroups[key] = { label, count: 0 };
      dateGroups[key].count++;
    });

    const dateList = Object.entries(dateGroups)
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([key, val]) =>
        `<li><a href="#/date/${key}" class="filter-link" data-date="${key}">${val.label} <span class="count">${val.count}</span></a></li>`
      ).join('');

    document.getElementById('dateFilter').innerHTML = dateList ||
      '<li class="filter-link" style="color:var(--text-tertiary);cursor:default">暂无</li>';

    // 分类分组
    const catGroups = {};
    State.notes.forEach(n => {
      if (n.category) {
        catGroups[n.category] = (catGroups[n.category] || 0) + 1;
      }
    });

    const catList = Object.entries(catGroups)
      .sort((a, b) => b[1] - a[1])
      .map(([cat, count]) =>
        `<li><a href="#/category/${encodeURIComponent(cat)}" class="filter-link" data-category="${Utils.escapeHtml(cat)}">${Utils.escapeHtml(cat)} <span class="count">${count}</span></a></li>`
      ).join('');

    document.getElementById('categoryFilter').innerHTML = catList ||
      '<li class="filter-link" style="color:var(--text-tertiary);cursor:default">暂无</li>';
  },

  updateSidebarActive() {
    document.querySelectorAll('.filter-link').forEach(link => {
      link.classList.remove('active');
    });

    const hash = location.hash;
    if (hash === '#/' || hash === '') {
      document.querySelector('[data-type="all"]')?.classList.add('active');
    } else if (hash.startsWith('#/type/note')) {
      document.querySelector('[data-type="note"]')?.classList.add('active');
    } else if (hash.startsWith('#/type/project')) {
      document.querySelector('[data-type="project"]')?.classList.add('active');
    }
  },

  render() {
    this.handleRoute();
    this.renderSidebar();
  }
};
