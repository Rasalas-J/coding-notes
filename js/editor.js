// ===== 编辑器模块 =====
const Editor = {
  editingId: null,
  currentTab: 'write', // 'write' | 'preview'
  uploadedFiles: [], // 本次编辑上传的文件列表

  show(id) {
    this.editingId = id || null;
    this.uploadedFiles = [];
    this.currentTab = 'write';

    if (id) {
      location.hash = `#/edit/${id}`;
    } else {
      location.hash = '#/new';
    }

    this.render();
  },

  render() {
    const main = document.getElementById('mainContent');
    const note = this.editingId
      ? State.notes.find(n => n.id === this.editingId)
      : null;

    const title = note ? '编辑笔记' : '新建笔记';
    const data = note || { title: '', type: 'note', category: '', topic: '', content: '' };

    // 获取已有分类列表
    const categories = [...new Set(State.notes.map(n => n.category).filter(Boolean))].sort();
    const categoryOptions = categories.map(c =>
      `<option value="${Utils.escapeHtml(c)}">${Utils.escapeHtml(c)}</option>`
    ).join('');

    main.innerHTML = `
      <a href="#/" class="back-link">← 返回列表</a>
      <div class="editor-container">
        <div class="editor-header">
          <h2 class="editor-title">${title}</h2>
        </div>
        <div class="editor-form">
          <div class="form-group">
            <label class="form-label">标题</label>
            <input type="text" id="editTitle" class="input" value="${Utils.escapeHtml(data.title)}" placeholder="输入笔记标题..." />
          </div>
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">类型</label>
              <select id="editType" class="select">
                <option value="note" ${data.type === 'note' ? 'selected' : ''}>📝 学习笔记</option>
                <option value="project" ${data.type === 'project' ? 'selected' : ''}>🚀 项目记录</option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">分类</label>
              <input type="text" id="editCategory" class="input" value="${Utils.escapeHtml(data.category || '')}" placeholder="如：Python、Web开发..." list="categoryList" />
              <datalist id="categoryList">${categoryOptions}</datalist>
            </div>
            <div class="form-group">
              <label class="form-label">主题</label>
              <input type="text" id="editTopic" class="input" value="${Utils.escapeHtml(data.topic || '')}" placeholder="如：排序算法..." />
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">内容（支持 Markdown）</label>
            <div class="editor-tabs">
              <button class="editor-tab active" id="tabWrite" onclick="Editor.switchTab('write')">✏️ 编辑</button>
              <button class="editor-tab" id="tabPreview" onclick="Editor.switchTab('preview')">👁️ 预览</button>
            </div>
            <div class="editor-toolbar">
              <button class="toolbar-btn" title="粗体" onclick="Editor.insertFormat('bold')"><b>B</b></button>
              <button class="toolbar-btn" title="斜体" onclick="Editor.insertFormat('italic')"><i>I</i></button>
              <button class="toolbar-btn" title="标题" onclick="Editor.insertFormat('heading')">H</button>
              <div class="toolbar-divider"></div>
              <button class="toolbar-btn" title="行内代码" onclick="Editor.insertFormat('code')"><code>&lt;/&gt;</code></button>
              <button class="toolbar-btn" title="代码块" onclick="Editor.insertFormat('codeblock')">📦</button>
              <div class="toolbar-divider"></div>
              <button class="toolbar-btn" title="引用" onclick="Editor.insertFormat('quote')">❝</button>
              <button class="toolbar-btn" title="无序列表" onclick="Editor.insertFormat('ul')">•</button>
              <button class="toolbar-btn" title="有序列表" onclick="Editor.insertFormat('ol')">1.</button>
              <button class="toolbar-btn" title="表格" onclick="Editor.insertFormat('table')">⊞</button>
              <div class="toolbar-divider"></div>
              <button class="toolbar-btn" title="链接" onclick="Editor.insertFormat('link')">🔗</button>
              <button class="toolbar-btn" title="上传图片" onclick="document.getElementById('imageUpload').click()">🖼️</button>
              <button class="toolbar-btn" title="上传文件" onclick="document.getElementById('fileUpload').click()">📎</button>
              <div class="toolbar-divider"></div>
              <button class="toolbar-btn" title="分割线" onclick="Editor.insertFormat('hr')">―</button>
            </div>
            <div class="editor-body">
              <div class="editor-pane" id="writePane">
                <textarea id="editContent" placeholder="在此输入 Markdown 内容...&#10;&#10;支持粘贴图片、拖拽图片到编辑区...">${Utils.escapeHtml(data.content)}</textarea>
              </div>
              <div class="editor-pane hidden" id="previewPane">
                <div class="editor-preview markdown-body" id="previewContent"></div>
              </div>
            </div>
            <input type="file" id="imageUpload" accept="image/*" style="display:none" onchange="Editor.handleImageUpload(this.files)" />
            <input type="file" id="fileUpload" style="display:none" onchange="Editor.handleFileUpload(this.files)" />
          </div>
          <div class="editor-actions">
            <button class="btn btn-ghost" onclick="Editor.cancel()">取消</button>
            <button class="btn btn-danger hidden" id="deleteBtn" onclick="Editor.deleteCurrent()">🗑️ 删除</button>
            <button class="btn btn-primary" onclick="Editor.save()">💾 保存</button>
          </div>
        </div>
      </div>
    `;

    // 如果是编辑模式，显示删除按钮
    if (this.editingId) {
      document.getElementById('deleteBtn').classList.remove('hidden');
    }

    // 绑定粘贴和拖拽事件
    const textarea = document.getElementById('editContent');
    textarea.addEventListener('paste', (e) => this.handlePaste(e));
    textarea.addEventListener('drop', (e) => this.handleDrop(e));
    textarea.addEventListener('dragover', (e) => { e.preventDefault(); });

    // 实时预览更新
    textarea.addEventListener('input', () => {
      if (this.currentTab === 'preview') this.updatePreview();
    });

    // 快捷键
    textarea.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        this.save();
      }
    });
  },

  switchTab(tab) {
    this.currentTab = tab;
    const writeTab = document.getElementById('tabWrite');
    const previewTab = document.getElementById('tabPreview');
    const writePane = document.getElementById('writePane');
    const previewPane = document.getElementById('previewPane');

    if (tab === 'write') {
      writeTab.classList.add('active');
      previewTab.classList.remove('active');
      writePane.classList.remove('hidden');
      previewPane.classList.add('hidden');
    } else {
      writeTab.classList.remove('active');
      previewTab.classList.add('active');
      writePane.classList.add('hidden');
      previewPane.classList.remove('hidden');
      this.updatePreview();
    }
  },

  updatePreview() {
    const content = document.getElementById('editContent').value;
    const preview = document.getElementById('previewContent');
    preview.innerHTML = Utils.renderMarkdown(content);
    Utils.highlightCode(preview);
  },

  insertFormat(type) {
    const textarea = document.getElementById('editContent');
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = textarea.value.substring(start, end);
    let before = '', after = '', placeholder = '';

    switch (type) {
      case 'bold':
        before = '**'; after = '**'; placeholder = '粗体文本';
        break;
      case 'italic':
        before = '*'; after = '*'; placeholder = '斜体文本';
        break;
      case 'heading':
        before = '## '; after = ''; placeholder = '标题';
        break;
      case 'code':
        before = '`'; after = '`'; placeholder = '代码';
        break;
      case 'codeblock':
        before = '\n```python\n'; after = '\n```\n'; placeholder = '# 在此输入代码';
        break;
      case 'quote':
        before = '> '; after = ''; placeholder = '引用文本';
        break;
      case 'ul':
        before = '- '; after = ''; placeholder = '列表项';
        break;
      case 'ol':
        before = '1. '; after = ''; placeholder = '列表项';
        break;
      case 'link':
        before = '['; after = '](https://)'; placeholder = '链接文本';
        break;
      case 'table':
        const table = '\n| 列1 | 列2 | 列3 |\n|------|------|------|\n| 内容 | 内容 | 内容 |\n';
        textarea.setRangeText(table, start, end, 'end');
        textarea.focus();
        return;
      case 'hr':
        textarea.setRangeText('\n---\n', start, end, 'end');
        textarea.focus();
        return;
    }

    const text = selected || placeholder;
    textarea.setRangeText(before + text + after, start, end, 'end');
    if (!selected) {
      textarea.selectionStart = start + before.length;
      textarea.selectionEnd = start + before.length + placeholder.length;
    }
    textarea.focus();
    if (this.currentTab === 'preview') this.updatePreview();
  },

  insertText(text) {
    const textarea = document.getElementById('editContent');
    const start = textarea.selectionStart;
    textarea.setRangeText(text, start, textarea.selectionEnd, 'end');
    textarea.focus();
    if (this.currentTab === 'preview') this.updatePreview();
  },

  handlePaste(e) {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (const item of items) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const file = item.getAsFile();
        if (file) this.uploadImage(file);
        return;
      }
    }
  },

  handleDrop(e) {
    e.preventDefault();
    const files = e.dataTransfer?.files;
    if (!files) return;

    for (const file of files) {
      if (file.type.startsWith('image/')) {
        this.uploadImage(file);
      } else {
        this.uploadFile(file);
      }
    }
  },

  handleImageUpload(files) {
    for (const file of files) {
      if (file.type.startsWith('image/')) {
        this.uploadImage(file);
      }
    }
    // 清空 input 以便重复上传同一文件
    document.getElementById('imageUpload').value = '';
  },

  handleFileUpload(files) {
    for (const file of files) {
      this.uploadFile(file);
    }
    document.getElementById('fileUpload').value = '';
  },

  async uploadImage(file) {
    if (!State.auth.isAuthenticated) {
      Utils.toast('请先登录', 'error');
      return;
    }

    // 限制大小 10MB
    if (file.size > 10 * 1024 * 1024) {
      Utils.toast('图片大小不能超过 10MB', 'error');
      return;
    }

    Utils.showLoading('上传图片...');

    try {
      const ext = file.name.split('.').pop() || 'png';
      const timestamp = Date.now();
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').substring(0, 30);
      const fileName = `${timestamp}-${safeName}`;
      const filePath = `${CONFIG.uploadsDir}/${fileName}`;

      // 读取文件为 base64
      const base64 = await this.fileToBase64(file);

      // 上传到 GitHub
      await State.github.uploadFile(filePath, base64, `上传图片: ${file.name}`);
      this.uploadedFiles.push(filePath);

      // 插入 Markdown
      const rawUrl = `${CONFIG.rawDataUrl}/${filePath}`;
      this.insertText(`\n![${file.name}](${rawUrl})\n`);

      Utils.hideLoading();
      Utils.toast('图片上传成功', 'success');
    } catch (err) {
      Utils.hideLoading();
      Utils.toast('图片上传失败: ' + err.message, 'error');
    }
  },

  async uploadFile(file) {
    if (!State.auth.isAuthenticated) {
      Utils.toast('请先登录', 'error');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      Utils.toast('文件大小不能超过 10MB', 'error');
      return;
    }

    Utils.showLoading('上传文件...');

    try {
      const timestamp = Date.now();
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').substring(0, 50);
      const fileName = `${timestamp}-${safeName}`;
      const filePath = `${CONFIG.uploadsDir}/${fileName}`;

      const base64 = await this.fileToBase64(file);

      await State.github.uploadFile(filePath, base64, `上传文件: ${file.name}`);
      this.uploadedFiles.push(filePath);

      // 插入 Markdown 链接
      const rawUrl = `${CONFIG.rawDataUrl}/${filePath}`;
      this.insertText(`\n📎 [${file.name}](${rawUrl})\n`);

      Utils.hideLoading();
      Utils.toast('文件上传成功', 'success');
    } catch (err) {
      Utils.hideLoading();
      Utils.toast('文件上传失败: ' + err.message, 'error');
    }
  },

  fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        // 移除 data URL 前缀
        const base64 = reader.result.split(',')[1];
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  },

  async save() {
    const title = document.getElementById('editTitle').value.trim();
    const type = document.getElementById('editType').value;
    const category = document.getElementById('editCategory').value.trim();
    const topic = document.getElementById('editTopic').value.trim();
    const content = document.getElementById('editContent').value;

    if (!title) {
      Utils.toast('请输入标题', 'error');
      document.getElementById('editTitle').focus();
      return;
    }

    if (!content.trim()) {
      Utils.toast('请输入内容', 'error');
      document.getElementById('editContent').focus();
      return;
    }

    Utils.showLoading('保存中...');

    const now = Utils.now();

    if (this.editingId) {
      // 更新现有笔记
      const note = State.notes.find(n => n.id === this.editingId);
      if (note) {
        note.title = title;
        note.type = type;
        note.category = category;
        note.topic = topic;
        note.content = content;
        note.updatedAt = now;
      }
    } else {
      // 创建新笔记
      const newNote = {
        id: Utils.generateId(),
        title,
        type,
        category,
        topic,
        content,
        createdAt: now,
        updatedAt: now
      };
      State.notes.push(newNote);
      this.editingId = newNote.id;
    }

    const success = await App.saveNotes(
      `${this.editingId ? '更新' : '创建'}笔记: ${title}`
    );

    if (success) {
      Utils.hideLoading();
      Utils.toast('保存成功！', 'success');
      location.hash = `#/note/${this.editingId}`;
      App.renderDetail(this.editingId);
      App.renderSidebar();
    } else {
      Utils.hideLoading();
    }
  },

  async deleteCurrent() {
    if (!this.editingId) return;
    if (!confirm('确定要删除此笔记吗？此操作不可撤销！')) return;

    Utils.showLoading('删除中...');
    State.notes = State.notes.filter(n => n.id !== this.editingId);
    const success = await App.saveNotes(`删除笔记`);

    if (success) {
      Utils.hideLoading();
      Utils.toast('删除成功', 'success');
      location.hash = '#/';
      App.renderList();
      App.renderSidebar();
    } else {
      Utils.hideLoading();
    }
  },

  cancel() {
    location.hash = this.editingId ? `#/note/${this.editingId}` : '#/';
  }
};
