// ===== 配置 =====
const CONFIG = {
  owner: 'Rasalas-J',
  repo: 'coding-notes',
  branch: 'main',
  get rawDataUrl() { return `https://raw.githubusercontent.com/${this.owner}/${this.repo}/${this.branch}`; },
  get apiUrl() { return `https://api.github.com/repos/${this.owner}/${this.repo}`; },
  dataPath: 'data/notes.json',
  uploadsDir: 'data/uploads',
  get rawDataURL() { return `${this.rawDataUrl}/${this.dataPath}?t=${Date.now()}`; },
  get uploadsURL() { return `${this.rawDataUrl}/${this.uploadsDir}`; }
};

// ===== 工具函数 =====
const Utils = {
  // UTF-8 字符串转 Base64
  encodeBase64(str) {
    const bytes = new TextEncoder().encode(str);
    let binary = '';
    bytes.forEach(b => binary += String.fromCharCode(b));
    return btoa(binary);
  },

  // Base64 转 UTF-8 字符串
  decodeBase64(b64) {
    const binary = atob(b64.replace(/\n/g, ''));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  },

  // 生成唯一 ID
  generateId() {
    const now = new Date();
    const ts = now.getFullYear().toString() +
      String(now.getMonth() + 1).padStart(2, '0') +
      String(now.getDate()).padStart(2, '0') +
      String(now.getHours()).padStart(2, '0') +
      String(now.getMinutes()).padStart(2, '0') +
      String(now.getSeconds()).padStart(2, '0');
    const rand = Math.random().toString(36).substring(2, 8);
    return `${ts}-${rand}`;
  },

  // 格式化日期
  formatDate(dateStr) {
    const d = new Date(dateStr);
    return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
  },

  // 格式化日期时间
  formatDateTime(dateStr) {
    const d = new Date(dateStr);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  },

  // 获取年月分组
  getYearMonth(dateStr) {
    const d = new Date(dateStr);
    return `${d.getFullYear()}年${d.getMonth() + 1}月`;
  },

  // 获取年月 key
  getYearMonthKey(dateStr) {
    const d = new Date(dateStr);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  },

  // 当前时间 ISO
  now() {
    return new Date().toISOString();
  },

  // 提取纯文本摘要
  extractExcerpt(content, maxLen = 150) {
    let text = content
      .replace(/```[\s\S]*?```/g, ' [代码块] ')
      .replace(/!\[.*?\]\(.*?\)/g, ' [图片] ')
      .replace(/\[([^\]]*)\]\(.*?\)/g, '$1')
      .replace(/[#*`>~_-]/g, '')
      .replace(/\n+/g, ' ')
      .trim();
    if (text.length > maxLen) text = text.substring(0, maxLen) + '...';
    return text;
  },

  // 转义 HTML
  escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  },

  // 渲染 Markdown
  renderMarkdown(content) {
    if (typeof marked === 'undefined') return content;
    const raw = marked.parse(content, { breaks: true, gfm: true });
    const clean = DOMPurify.sanitize(raw, {
      ADD_TAGS: ['iframe'],
      ADD_ATTR: ['target', 'allow', 'allowfullscreen', 'frameborder']
    });
    return clean;
  },

  // 高亮代码
  highlightCode(container) {
    if (typeof hljs === 'undefined') return;
    container.querySelectorAll('pre code').forEach(block => {
      hljs.highlightElement(block);
    });
  },

  // 显示 Toast
  toast(message, type = 'info', duration = 3000) {
    const container = document.getElementById('toastContainer');
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.textContent = message;
    container.appendChild(el);
    setTimeout(() => {
      el.style.animation = 'toastIn 0.3s ease reverse';
      setTimeout(() => el.remove(), 300);
    }, duration);
  },

  // 显示/隐藏加载
  showLoading(text = '处理中...') {
    document.getElementById('loadingText').textContent = text;
    document.getElementById('loadingOverlay').classList.remove('hidden');
  },

  hideLoading() {
    document.getElementById('loadingOverlay').classList.add('hidden');
  }
};

// ===== GitHub API =====
class GitHubAPI {
  constructor(token) {
    this.token = token;
  }

  async request(method, path, body) {
    const url = `${CONFIG.apiUrl}${path}`;
    const headers = {
      'Accept': 'application/vnd.github.v3+json',
      'Content-Type': 'application/json'
    };
    if (this.token) headers['Authorization'] = `token ${this.token}`;

    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.message || `GitHub API 错误: ${response.status}`);
    }

    if (response.status === 204) return null;
    return response.json();
  }

  // 获取文件（带 SHA）
  async getFile(path) {
    return this.request('GET', `/contents/${path}`);
  }

  // 创建或更新文件
  async putFile(path, content, sha, message) {
    const body = {
      message: message || `更新 ${path}`,
      content: typeof content === 'string' ? Utils.encodeBase64(content) : content
    };
    if (sha) body.sha = sha;
    return this.request('PUT', `/contents/${path}`, body);
  }

  // 上传二进制文件（base64）
  async uploadFile(path, base64Content, message) {
    return this.putFile(path, base64Content, null, message || `上传 ${path}`);
  }

  // 删除文件
  async deleteFile(path, sha, message) {
    return this.request('DELETE', `/contents/${path}`, {
      message: message || `删除 ${path}`,
      sha
    });
  }

  // 验证 Token
  async validateToken() {
    const response = await fetch('https://api.github.com/user', {
      headers: { 'Authorization': `token ${this.token}` }
    });
    if (!response.ok) throw new Error('Token 无效');
    return response.json();
  }

  // 检查仓库是否存在
  async repoExists() {
    const response = await fetch(`${CONFIG.apiUrl}`, {
      headers: this.token ? { 'Authorization': `token ${this.token}` } : {}
    });
    return response.ok;
  }
}
