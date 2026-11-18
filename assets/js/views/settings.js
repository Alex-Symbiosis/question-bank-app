window.Views = window.Views || {};

/* ============================================================
   设置：AI 接入 / 算法层 / 学习偏好 / 数据 / 关于
   ============================================================ */
Views.settings = {
  tab: 'ai',
  PRESETS: [
    { name: 'OpenAI', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
    { name: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
    { name: 'Moonshot', baseUrl: 'https://api.moonshot.cn/v1', model: 'moonshot-v1-8k' },
    { name: '通义千问', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-plus' },
    { name: '硅基流动', baseUrl: 'https://api.siliconflow.cn/v1', model: 'Qwen/Qwen2.5-7B-Instruct' },
    { name: 'Ollama 本地', baseUrl: 'http://localhost:11434/v1', model: 'qwen2.5:7b' },
  ],

  render() {
    const tabs = [
      ['ai', 'sparkle', 'AI 接入'],
      ['algo', 'layers', '算法层'],
      ['study', 'pen', '学习偏好'],
      ['data', 'download', '数据与备份'],
      ['about', 'book', '关于'],
    ];
    return `
      <div class="page-head">
        <div>
          <h1 class="page-title">设置</h1>
          <p class="page-sub">AI 配置、算法层参数与本地数据都只保存在这台设备上。</p>
        </div>
      </div>
      <div class="settings-layout">
        <nav class="settings-nav" id="set-nav">
          ${tabs.map(([k, ic, label]) => `<button type="button" data-tab="${k}" class="${this.tab === k ? 'active' : ''}">${icon(ic)} ${label}</button>`).join('')}
        </nav>
        <div class="settings-section" id="settings-body"></div>
      </div>`;
  },

  mount() {
    QA('#set-nav [data-tab]').forEach((b) => {
      b.onclick = () => {
        this.tab = b.dataset.tab;
        QA('#set-nav [data-tab]').forEach((x) => x.classList.toggle('active', x === b));
        this.paint();
      };
    });
    this.paint();
  },

  paint() {
    const body = Q('#settings-body');
    if (!body) return;
    if (this.tab === 'ai') { body.innerHTML = this.aiHTML(); this.bindAI(); }
    else if (this.tab === 'algo') { body.innerHTML = this.algoHTML(); this.bindAlgo(); }
    else if (this.tab === 'study') { body.innerHTML = this.studyHTML(); this.bindStudy(); }
    else if (this.tab === 'data') { body.innerHTML = this.dataHTML(); this.bindData(); }
    else { body.innerHTML = this.aboutHTML(); }
  },

  /* ---------------- AI ---------------- */
  aiHTML() {
    const api = Store.settings.api();
    const configured = AI.isConfigured();
    const profileText = Store.profile.text();
    const aiPrefs = Store.settings.get().ai || {};
    const mentor = Store.mentor.get();
    const mc = mentor.config;
    const MS_STYLE = { coach: '督导型', explain: '讲解型', companion: '陪伴型' };
    const MS_TONE = { gentle: '温和', strict: '严格', brisk: '干脆' };
    const MS_FREQ = { open: '每次打开', daily: '每天一次', off: '不主动' };
    return `
      <div class="card set-group">
        <div class="between wrap">
          <div>
            <h3>${icon('sparkle')} AI 接入</h3>
            <p class="sub" style="margin-bottom:0">所有 AI 能力共用这一条配置：题目讲解、思路提示、简答批改、题库结构化。</p>
          </div>
          <div class="ai-card-side">
            <span class="key-state ${configured ? 'on' : ''}"><span class="dot" style="width:6px;height:6px;border-radius:50%;background:${configured ? 'var(--ok)' : '#C9C7BD'}"></span>${configured ? '已配置' : '未配置'}</span>
            <button type="button" class="ai-help" id="ai-help" title="如何配置 AI 接入">
              <span class="ai-help-mark">?</span><span class="ai-help-text">如何配置</span>
            </button>
          </div>
        </div>

        <div class="preset-chips mt-16 mb-16">
          ${this.PRESETS.map((p) => `<button type="button" data-preset="${p.name}" data-base="${esc(p.baseUrl)}" data-model="${esc(p.model)}">${p.name}</button>`).join('')}
        </div>

        <div class="form-grid">
          <div class="field span2">
            <label>Base URL <span class="hint">OpenAI 兼容接口，通常以 /v1 结尾</span></label>
            <input class="input" id="set-base" value="${esc(api.baseUrl || '')}" placeholder="https://api.openai.com/v1" spellcheck="false" />
          </div>
          <div class="field span2">
            <label>API Key <span class="hint">只写入本机 localStorage；保存后只显示首尾，完整 Key 不再回显</span></label>
            <div class="input-group">
              <input class="input ${api.apiKey ? 'is-masked' : ''}" id="set-key" type="${api.apiKey ? 'text' : 'password'}"
                value="${api.apiKey ? esc(this.maskKey(api.apiKey)) : ''}" ${api.apiKey ? 'readonly' : ''}
                placeholder="sk-..." spellcheck="false" autocomplete="off" />
              <button class="btn btn-ghost" type="button" id="set-key-change" ${api.apiKey ? '' : 'hidden'}>更换</button>
            </div>
          </div>
          <div class="field">
            <label>模型名</label>
            <input class="input" id="set-model" value="${esc(api.model || '')}" placeholder="gpt-4o-mini" spellcheck="false" />
          </div>
          <div class="field">
            <label>温度 <span class="hint">越低越稳定</span></label>
            <input class="input" id="set-temp" type="number" min="0" max="2" step="0.1" value="${api.temperature == null ? 0.5 : api.temperature}" />
          </div>
          <div class="field span2">
            <label class="switch"><input type="checkbox" id="set-stream" ${api.stream ? 'checked' : ''}/><span class="track"></span>流式输出（边生成边显示）</label>
          </div>
          <div class="field span2">
            <label>讲解风格 <span class="hint">决定 AI 讲到多细；简单题会自动收敛</span></label>
            <div class="segmented" id="ai-style">
              ${Object.keys(Algo.STYLE).map((k) => `<button type="button" data-style="${k}" class="${(Store.settings.get().algo.explainStyle || 'balanced') === k ? 'active' : ''}">${Algo.STYLE[k].label}</button>`).join('')}
            </div>
          </div>
        </div>

        <div class="row mt-24">
          <button class="btn btn-primary" id="set-save">保存配置</button>
          <button class="btn btn-ghost" id="set-test">${icon('refresh')} 测试连接</button>
          <span class="grow"></span>
          <a class="btn btn-quiet btn-sm" href="#/usage">${icon('chart')} 调用记录</a>
          <span class="small muted" id="ai-test-result"></span>
        </div>

        <div class="row mt-16" style="padding-top:16px;border-top:1px solid var(--line)">
          <label class="switch"><input type="checkbox" id="set-autopersona" ${aiPrefs.autoPersona !== false ? 'checked' : ''}/><span class="track"></span>保存配置后自动发起「AI 认识你」对话</label>
        </div>
      </div>

      <div class="card set-group">
        <div class="between wrap">
          <div>
            <h3>${icon('mask')} AI 认识你</h3>
            <p class="sub" style="margin-bottom:0">先聊几句，让 AI 知道你是谁、怎么学、喜欢怎么被讲。画像会注入讲解与批改的 prompt。</p>
          </div>
          <span class="chip ${profileText ? 'accent' : 'plain'}">${profileText ? '已建立画像' : '尚未建立'}</span>
        </div>
        <textarea class="textarea mt-16" id="persona-text" rows="5" maxlength="300" spellcheck="false"
          placeholder="还没有画像。点「开始认识你」和 AI 聊几句，它会自己归纳；也可以直接在这里写，比如：在职备考，晚上学一小时，喜欢先讲考点再讲题，数学基础弱。">${esc(profileText)}</textarea>
        <div class="between mt-8">
          <span class="small muted">${profileText ? '可以直接改，改完记得保存' : '不填也能用，只是讲解会更通用'}</span>
          <span class="small muted" id="persona-count">${profileText.length} / 300</span>
        </div>
        <div class="row wrap mt-16">
          <button class="btn btn-primary" id="persona-start">${icon('sparkle')} ${profileText ? '重新认识一下' : '开始认识你'}</button>
          <button class="btn btn-ghost" id="persona-save">保存画像</button>
          <button class="btn btn-ghost" id="persona-import">${icon('upload')} 导入文本</button>
          <input type="file" id="persona-file" accept=".txt,.md,text/plain,text/markdown" hidden />
          <span class="grow"></span>
          ${profileText ? `<button class="btn btn-quiet btn-sm" id="persona-clear">${icon('trash')} 清空画像</button>` : ''}
        </div>
      </div>

      <div class="card set-group">
        <div class="between wrap">
          <div>
            <h3>${icon('sparkle')} AI 带教</h3>
            <p class="sub" style="margin-bottom:0">常驻在界面侧边的老师。只有你主动申请后才会出现，并读取最近的答题与学习记录。</p>
          </div>
          <span class="chip ${mentor.applied ? (mentor.enabled ? 'accent' : 'plain') : 'plain'}">
            ${mentor.applied ? (mentor.enabled ? '已启用' : '已停用') : '未申请'}
          </span>
        </div>
        ${mentor.applied ? `
          <div class="mentor-setting-row mt-16">
            <div class="mentor-setting-main">
              <span class="mentor-avatar sm">${esc((mc.name || '砚').slice(0, 1))}</span>
              <div>
                <strong>${esc(mc.name)}</strong>
                <div class="small muted">${esc(MS_STYLE[mc.style] || '督导型')} · ${esc(MS_TONE[mc.tone] || '温和')} · 主动：${esc(MS_FREQ[mc.frequency] || '每次打开')}${mc.goal ? ' · ' + esc(mc.goal) : ''}</div>
              </div>
            </div>
            <div class="row wrap">
              <a class="btn btn-ghost btn-sm" href="#/mentor/setup">修改配置</a>
              <button class="btn btn-quiet btn-sm" id="mentor-toggle">${mentor.enabled ? '停用' : '启用'}</button>
            </div>
          </div>` : `
          <p class="small muted mt-16" style="line-height:1.9">申请后进入配置页，设定风格、称呼、语气、讲解偏好与主动开口频率；保存后带教才会生成并出现在侧边。没有申请时，界面不会出现它，也不会产生任何主动调用。</p>
          <div class="row mt-16">
            <a class="btn btn-primary" href="#/mentor/setup">${icon('sparkle')} 申请 AI 带教</a>
          </div>`}
      </div>

      <div class="guide-card">
        <div class="g-orb">${icon('shield')}</div>
        <div><h4>密钥如何使用</h4><p>浏览器直接带着你的 Key 请求你填写的服务商。请确认该服务商允许浏览器跨域（CORS）调用；若提示网络错误，通常是 Base URL 或跨域限制导致的。换设备或清理浏览器数据前，请先导出备份。</p></div>
      </div>`;
  },

  openHelp() {
    const rows = this.PRESETS.map((p) => `<li><b>${esc(p.name)}</b>　地址 <code>${esc(p.baseUrl)}</code>　模型 <code>${esc(p.model)}</code></li>`).join('');
    openModal({
      title: '如何配置 AI 接入',
      sub: '一共三样信息：Base URL、API Key、模型名。填完点「测试连接」验证。',
      wide: true,
      body: `
        <div class="ai-guide">
          <h4>一、先选一个服务商</h4>
          <p>点卡片上的预设按钮会自动填好地址和模型，只剩下 Key 需要自己申请。目前支持的预设：</p>
          <ul>${rows}</ul>
          <p class="small muted">Ollama 本地不需要真实 Key，Key 随便填 <code>ollama</code> 即可；但要先在电脑上把 Ollama 跑起来。</p>

          <h4>二、去哪里申请 Key</h4>
          <ul>
            <li><b>OpenAI</b>：platform.openai.com → API keys → Create new secret key，复制 <code>sk-</code> 开头的一整串（只显示一次）。</li>
            <li><b>DeepSeek</b>：platform.deepseek.com → API keys → 创建，复制 <code>sk-</code> 开头的 Key，国内可直接充值。</li>
            <li><b>Moonshot</b>：platform.moonshot.cn → API Key 管理 → 新建。</li>
            <li><b>通义千问</b>：阿里云百炼 bailian.console.aliyun.com → API-KEY 管理，开通后新建（新用户有免费额度）。</li>
            <li><b>硅基流动</b>：cloud.siliconflow.cn → 账户设置 → API 密钥，新账号通常送一点额度。</li>
          </ul>

          <h4>三、Base URL 填什么</h4>
          <p>填服务商给的「OpenAI 兼容」地址，一般以 <code>/v1</code> 结尾，不要再自己拼 <code>/chat/completions</code>。上面预设里列出的就是可以直接用的地址。</p>

          <h4>四、模型名填什么</h4>
          <p>模型名必须和服务商后台的完全一致，大小写、斜杠都算数。预设会带上常用型号；想换型号时，去服务商的模型列表复制准确名称，比如 <code>gpt-4o-mini</code>、<code>deepseek-chat</code>、<code>qwen-plus</code>。</p>

          <h4>五、点「测试连接」应该看到什么</h4>
          <ul>
            <li>按钮先变成「测试中」，随后出现绿色标签 <b>连接成功 · 800ms</b> 之类，后面跟着模型回的一句话。看到这个就说明配置可用。</li>
            <li>显示红色 <b>连接失败</b> 时会带一句原因，对照下一节排查即可。</li>
          </ul>

          <h4>六、常见报错怎么判断</h4>
          <ul>
            <li><b>401 / invalid_api_key / Unauthorized</b>：Key 错了、过期或被撤销。重新复制一次，注意别把前后空格带进去。</li>
            <li><b>404 / model_not_found / Not Found</b>：两种可能——Base URL 少了或多了 <code>/v1</code>；或者模型名写了这个账号没有的型号。</li>
            <li><b>403 / insufficient_quota / 余额不足</b>：账号没有可用额度，去服务商后台充值，或换一个带免费额度的模型。</li>
            <li><b>429 / rate_limit</b>：请求太密被限流，等一会儿再点测试；持续出现说明额度或并发受限。</li>
            <li><b>Failed to fetch / 网络错误</b>：地址根本连不上。检查 Base URL 是否写错、本地 Ollama 是否在运行、是否需要代理。</li>
            <li><b>超时 / 长时间无响应</b>：网络慢或服务商不可达，换网络或换国内服务商。</li>
          </ul>

          <h4>七、费用与安全</h4>
          <ul>
            <li>费用按 token 计费，一次讲解通常几百到几千 token。<code>gpt-4o-mini</code>、<code>deepseek-chat</code> 这类小模型大概每百万 token 几元人民币量级；<code>qwen-plus</code> 和硅基流动的小模型常有免费额度；Ollama 本地免费，但吃电脑性能。具体以各家官网价目为准。</li>
            <li>Key 只保存在这台设备的浏览器 localStorage 里，不会上传到别处；保存后界面只显示首尾几位，导出的备份也不再写入 Key。</li>
            <li>公用电脑用完建议回到这里把 Key 删掉再保存，或清除站点数据；也不要把 Key 截图发出去。</li>
          </ul>
        </div>`,
      actions: [{ label: '知道了', kind: 'primary' }],
    });
  },

  /* 正中间遮 10 位、用 10 个点表示；其余照常露出，整体长度与真实 Key 一致，短 Key 少露几位 */
  maskKey(key) {
    const s = String(key || '');
    if (!s) return '';
    const keep = Math.max(0, s.length - 10);
    const head = Math.ceil(keep / 2);
    const tail = keep - head;
    return s.slice(0, head) + '••••••••••' + (tail > 0 ? s.slice(-tail) : '');
  },

  /* 已保存状态只显示打码值；聚焦或点「更换」才清空输入，供重新粘贴 */
  bindKeyField() {
    const input = Q('#set-key');
    if (!input) return;
    const btn = () => Q('#set-key-change');
    const enterEdit = () => {
      if (!input.classList.contains('is-masked')) return;
      input.classList.remove('is-masked');
      input.readOnly = false;
      input.type = 'password';
      input.value = '';
      input.placeholder = '粘贴新的 API Key（留空保存则保留原 Key）';
      const b = btn();
      if (b) { b.hidden = false; b.textContent = '取消'; }
      input.focus();
    };
    const backToMask = () => {
      const key = (Store.settings.api() || {}).apiKey || '';
      input.classList.add('is-masked');
      input.readOnly = true;
      input.type = 'text';
      input.value = this.maskKey(key);
      input.placeholder = 'sk-...';
      const b = btn();
      if (b) { b.hidden = !key; b.textContent = '更换'; }
      input.blur();
    };
    input.addEventListener('focus', enterEdit);
    input.addEventListener('click', enterEdit);
    const b = btn();
    if (b) b.onclick = () => {
      if (input.classList.contains('is-masked')) enterEdit();
      else backToMask();
    };
  },

  /* 保存后回到打码展示，输入框里不保留明文 */
  refreshKeyField() {
    const input = Q('#set-key');
    if (!input) return;
    const key = (Store.settings.api() || {}).apiKey || '';
    input.classList.toggle('is-masked', !!key);
    input.readOnly = !!key;
    input.type = key ? 'text' : 'password';
    input.value = key ? this.maskKey(key) : '';
    input.placeholder = 'sk-...';
    input.blur();
    const b = Q('#set-key-change');
    if (b) { b.hidden = !key; b.textContent = '更换'; }
  },

  bindAI() {
    const api = Store.settings.api();
    const helpBtn = Q('#ai-help');
    if (helpBtn) helpBtn.onclick = () => this.openHelp();
    this.bindKeyField();
    QA('[data-preset]').forEach((b) => {
      b.onclick = () => {
        Q('#set-base').value = b.dataset.base;
        Q('#set-model').value = b.dataset.model;
      };
    });
    Q('#ai-style').addEventListener('click', (e) => {
      const b = e.target.closest('[data-style]');
      if (!b) return;
      Store.settings.patch('algo', { explainStyle: b.dataset.style });
      QA('#ai-style [data-style]').forEach((x) => x.classList.toggle('active', x === b));
      toast('讲解风格已更新', 'ok');
    });
    Q('#set-save').onclick = () => {
      if (!this.saveAI()) return;
      toast('AI 配置已保存', 'ok');
      const auto = (Store.settings.get().ai || {}).autoPersona !== false;
      if (auto && !Store.profile.get().onboarded) setTimeout(() => this.openPersonaChat(), 280);
    };
    Q('#set-autopersona').onchange = (e) => {
      Store.settings.patch('ai', { autoPersona: e.target.checked });
      toast(e.target.checked ? '保存配置后将自动发起画像对话' : '已关闭自动发起，可随时在下方手动开始', 'ok');
    };
    const mentorToggle = Q('#mentor-toggle');
    if (mentorToggle) mentorToggle.onclick = () => {
      const next = !Store.mentor.get().enabled;
      Store.mentor.setEnabled(next);
      if (window.Mentor) Mentor.refresh();
      this.paint();
      toast(next ? '带教已重新启用' : '带教已停用，侧边不再出现', 'ok');
    };
    Q('#set-test').onclick = async () => {
      if (!this.saveAI()) return;
      const btn = Q('#set-test');
      const out = Q('#ai-test-result');
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner"></span> 测试中';
      out.textContent = '';
      try {
        const res = await AI.testConnection();
        out.innerHTML = `<span class="chip ok">连接成功 · ${res.ms}ms</span> <span class="small muted">${esc(res.model)} 回复：${esc(res.text.slice(0, 30))}</span>`;
      } catch (e) {
        out.innerHTML = `<span class="chip bad">连接失败</span> <span class="small muted">${esc(e.friendly || e.message)}</span>`;
      } finally {
        btn.disabled = false;
        btn.innerHTML = icon('refresh') + ' 测试连接';
      }
    };

    const pText = Q('#persona-text');
    pText.oninput = () => {
      const n = Q('#persona-count');
      if (n) n.textContent = `${pText.value.length} / 300`;
    };
    Q('#persona-save').onclick = () => {
      const text = pText.value.trim();
      if (text.length > 300) { toast('画像请控制在 300 字以内', 'bad'); return; }
      if (!text) { toast('先写一点内容，或点「开始认识你」让 AI 归纳', 'bad'); return; }
      Store.profile.set(text);
      toast('画像已保存，之后的讲解会按它调整', 'ok');
      this.paint();
    };
    Q('#persona-start').onclick = () => this.openPersonaChat();
    const importBtn = Q('#persona-import');
    const fileInput = Q('#persona-file');
    if (importBtn && fileInput) {
      importBtn.onclick = () => fileInput.click();
      fileInput.onchange = async () => {
        const file = fileInput.files && fileInput.files[0];
        if (!file) return;
        try {
          const raw = await readFile(file);
          let text = String(raw || '').replace(/\r\n/g, '\n').trim();
          if (!text) { toast('这个文件里没有可用的文字', 'bad'); return; }
          if (text.length > 300) { text = text.slice(0, 300); toast('已截取前 300 字，保存前可以再删减', 'ok'); }
          pText.value = text;
          pText.dispatchEvent(new Event('input'));
          toast('已导入到编辑框，确认后点「保存画像」', 'ok');
        } catch (e) {
          toast('读取文件失败：' + (e.message || e), 'bad');
        } finally {
          fileInput.value = '';
        }
      };
    }
    const clearBtn = Q('#persona-clear');
    if (clearBtn) {
      clearBtn.onclick = async () => {
        const ok = await confirmModal({
          title: '清空人物画像？',
          body: '清空后 AI 会回到通用讲法，随时可以重新建立。',
          okText: '清空',
          danger: true,
        });
        if (!ok) return;
        Store.profile.clear();
        toast('画像已清空', 'ok');
        this.paint();
      };
    }
  },

  /* ---------------- AI 认识你：引导对话 ---------------- */
  openPersonaChat() {
    const history = [];
    let busy = false;
    const fmt = (t) => esc(t).replace(/\n/g, '<br>');
    const modal = openModal({
      title: '认识一下',
      sub: '随便聊聊，AI 会边聊边了解你。聊两三句后，就能让它归纳成画像。',
      wide: true,
      body: `
        <div class="pc-log" id="pc-log"></div>
        <div class="pc-input row mt-12">
          <input class="input grow" id="pc-text" placeholder="打字回复…" autocomplete="off" />
          <button class="btn btn-primary" id="pc-send">${icon('send')} 发送</button>
        </div>
        <div class="pc-result" id="pc-result" hidden>
          <div class="between">
            <label class="small muted">归纳出的画像（可改，300 字以内）</label>
            <span class="small muted" id="pc-count">0 / 300</span>
          </div>
          <textarea class="textarea mt-8" id="pc-profile" rows="4" maxlength="300" spellcheck="false"></textarea>
        </div>
        <div class="row wrap mt-12">
          <button class="btn btn-soft btn-sm" id="pc-summary" disabled>生成画像</button>
          <button class="btn btn-primary btn-sm" id="pc-save" disabled>保存</button>
          <button class="btn btn-quiet btn-sm" id="pc-skip">跳过，以后再说</button>
          <span class="grow"></span>
          <span class="small muted" id="pc-hint"></span>
        </div>`,
    });

    const log = Q('#pc-log', modal.el);
    const input = Q('#pc-text', modal.el);
    const sendBtn = Q('#pc-send', modal.el);
    const sumBtn = Q('#pc-summary', modal.el);
    const saveBtn = Q('#pc-save', modal.el);
    const resultBox = Q('#pc-result', modal.el);
    const profileInput = Q('#pc-profile', modal.el);
    const count = Q('#pc-count', modal.el);
    const hint = Q('#pc-hint', modal.el);

    const scroll = () => { log.scrollTop = log.scrollHeight; };
    const append = (role, text) => {
      const el = document.createElement('div');
      el.className = 'pc-msg ' + role;
      el.innerHTML = text ? fmt(text) : '<span class="pc-typing"><i></i><i></i><i></i></span>';
      log.appendChild(el);
      scroll();
      return el;
    };
    const setBusy = (v, msg) => {
      busy = v;
      sendBtn.disabled = v;
      input.disabled = v;
      if (msg !== undefined) hint.textContent = msg;
      sumBtn.disabled = v || !history.some((m) => m.role === 'user');
      saveBtn.disabled = v || !profileInput.value.trim();
    };

    const fail = (bubble, e) => {
      bubble.classList.add('bad');
      bubble.textContent = '没能连上 AI：' + (e.friendly || e.message || '未知错误');
    };

    const callAI = async (bubble) => {
      setBusy(true, 'AI 正在回复…');
      let acc = '';
      try {
        const res = await AI.personaChat({
          history,
          onDelta: (d) => { acc += d; bubble.innerHTML = fmt(acc); scroll(); },
        });
        history.push({ role: 'assistant', content: res.text });
        bubble.innerHTML = fmt(res.text);
        hint.textContent = '';
      } catch (e) {
        fail(bubble, e);
        hint.textContent = '';
      }
      setBusy(false);
      if (!busy) input.focus();
    };

    const send = () => {
      const text = input.value.trim();
      if (!text || busy) return;
      input.value = '';
      append('me', text);
      history.push({ role: 'user', content: text });
      callAI(append('ai', ''));
    };

    sendBtn.onclick = send;
    input.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); send(); } };

    Q('#pc-skip', modal.el).onclick = () => {
      Store.profile.markOnboarded();
      modal.close();
      toast('已跳过，之后可以在「AI 接入」里再建立画像', 'ok');
    };

    profileInput.oninput = () => {
      count.textContent = `${profileInput.value.length} / 300`;
      saveBtn.disabled = busy || !profileInput.value.trim();
    };

    saveBtn.onclick = () => {
      const text = profileInput.value.trim();
      if (!text) { toast('画像还是空的，先生成或写一点内容', 'bad'); return; }
      Store.profile.set(text);
      modal.close();
      toast('画像已保存，之后的讲解会按它调整', 'ok');
      this.paint();
    };

    sumBtn.onclick = async () => {
      if (busy) return;
      setBusy(true, '正在把刚才聊的归纳成画像…');
      const bubble = append('ai', '');
      bubble.innerHTML = '<span class="pc-typing"><i></i><i></i><i></i></span>';
      try {
        const res = await AI.personaSummary({ history });
        bubble.innerHTML = fmt('整理好了，我写在下面了，你可以直接改；不满意也能继续聊，再生成一次。');
        resultBox.hidden = false;
        profileInput.value = res.text;
        count.textContent = `${res.text.length} / 300`;
        hint.textContent = '不满意可以继续聊，再生成一次';
      } catch (e) {
        fail(bubble, e);
      }
      setBusy(false);
      if (!resultBox.hidden) profileInput.focus();
    };

    append('ai', '');
    callAI(log.lastElementChild);
  },

  saveAI() {
    const baseUrl = Q('#set-base').value.trim();
    const keyInput = Q('#set-key');
    const editing = !!keyInput && !keyInput.classList.contains('is-masked');
    const currentKey = (Store.settings.api() || {}).apiKey || '';
    const apiKey = editing ? (keyInput.value.trim() || currentKey) : currentKey;
    const model = Q('#set-model').value.trim();
    const temperature = clamp(Number(Q('#set-temp').value) || 0, 0, 2);
    const stream = Q('#set-stream').checked;
    if (baseUrl && !/^https?:\/\//i.test(baseUrl)) { toast('Base URL 需要以 http:// 或 https:// 开头', 'bad'); return false; }
    if (!baseUrl || !apiKey || !model) { toast('Base URL、API Key 与模型名都需要填写', 'bad'); return false; }
    Store.settings.patch('api', { baseUrl, apiKey, model, temperature, stream });
    this.refreshKeyField();
    App.updateChrome();
    return true;
  },

  /* ---------------- 算法层 ---------------- */
  algoHTML() {
    const algo = Store.settings.get().algo || {};
    const disabled = new Set(algo.disabledStages || []);
    const stages = Algo.describe();
    return `
      <div class="card set-group">
        <h3>${icon('layers')} 算法层流水线</h3>
        <p class="sub">每次向 AI 发送指令前，先在这里做归一化、意图识别、指代解析、片段抽取与模板编排。关掉某个阶段可用于对比效果。</p>
        ${stages.map((s) => `
          <div class="algo-stage-row">
            <span class="ord">${String(s.order / 10).padStart(2, '0')}</span>
            <span class="nm">${esc(s.name)}<small>${esc(s.desc || '')}</small></span>
            <label class="switch"><input type="checkbox" data-stage="${s.id}" ${disabled.has(s.id) ? '' : 'checked'}/><span class="track"></span></label>
          </div>`).join('')}
      </div>

      <div class="card set-group">
        <h3>${icon('sparkle')} 上下文与调试</h3>
        <p class="sub">讲解风格可在「AI 接入」里调整；这里控制拼进 prompt 的题目信息长度。</p>
        <div class="form-grid">
          <div class="field">
            <label>上下文预算（字符）</label>
            <input class="input" id="set-maxchars" type="number" min="800" max="12000" step="200" value="${algo.maxChars || 6000}" />
          </div>
          <div class="field">
            <label class="switch"><input type="checkbox" id="set-showpacket" ${algo.showPacket ? 'checked' : ''}/><span class="track"></span>在 AI 抽屉里显示分解过程</label>
          </div>
        </div>
      </div>

      <div class="card set-group">
        <h3>${icon('brain')} 算法实验台</h3>
        <p class="sub">输入一句指令，实时查看它被拆成了哪些片段、命中了什么意图、最终拼成什么 prompt。不会调用 AI。</p>
        <div class="form-grid">
          <div class="field">
            <label>题库</label>
            <select class="select" id="lab-bank">
              ${Store.banks.list().map((b) => `<option value="${b.id}">${esc(b.title)}</option>`).join('') || '<option value="">（暂无题库）</option>'}
            </select>
          </div>
          <div class="field">
            <label>第几题</label>
            <input class="input" id="lab-q" type="number" min="1" value="1" />
          </div>
          <div class="field span2">
            <label>用户指令</label>
            <textarea class="textarea" id="lab-input" rows="3">讲讲第 1 题，为什么不是 B？</textarea>
          </div>
        </div>
        <div class="row mt-16">
          <button class="btn btn-primary" id="lab-run">${icon('layers')} 运行算法层</button>
          <span class="small muted">只做本地分解，不消耗 token</span>
        </div>
        <div class="lab-grid mt-16" id="lab-out">
          <div class="lab-out"><div class="lab-frag"><div class="k">等待运行</div><div class="v">点击「运行算法层」查看结构化片段。</div></div></div>
          <div class="lab-out"><div class="lab-prompt">prompt 会显示在这里…</div></div>
        </div>
      </div>`;
  },

  bindAlgo() {
    QA('[data-stage]').forEach((el) => {
      el.onchange = () => {
        const disabled = QA('[data-stage]').filter((x) => !x.checked).map((x) => x.dataset.stage);
        Store.settings.patch('algo', { disabledStages: disabled });
      };
    });
    Q('#set-maxchars').onchange = (e) => {
      Store.settings.patch('algo', { maxChars: clamp(Math.round(+e.target.value || 6000), 800, 12000) });
    };
    Q('#set-showpacket').onchange = (e) => {
      Store.settings.patch('algo', { showPacket: e.target.checked });
    };
    Q('#lab-run').onclick = () => this.runLab();
  },

  runLab() {
    const bankId = Q('#lab-bank').value;
    const bank = Store.banks.get(bankId);
    const num = clamp(Math.round(+Q('#lab-q').value || 1), 1, bank ? bank.questions.length : 1);
    const question = bank ? bank.questions[num - 1] : null;
    const text = Q('#lab-input').value.trim() || '讲讲这道题';
    const packet = Algo.run({ text, question, bank, userAnswer: question && question.type === 'short' ? '（这里可以放学生的作答）' : '' });

    const frags = packet.fragments.map((f) => `<div class="lab-frag">
      <div class="k">${esc(f.label)} · P${f.priority}${f.truncated ? ' · 已压缩' : ''}</div>
      <div class="v">${esc(f.content)}</div>
    </div>`).join('') || '<div class="lab-frag"><div class="k">无片段</div><div class="v">当前输入没有可抽取的上下文</div></div>';

    const stages = packet.debug.stages.map((s) => `<span class="algo-step ${s.enabled ? '' : 'off'}">${esc(s.name)}</span>`).join('');
    const left = `<div class="lab-out">
      <div class="row wrap" style="gap:6px;margin-bottom:10px">
        <span class="chip accent">${esc(packet.intentLabel)}</span>
        <span class="chip plain">置信度 ${Math.round(packet.confidence * 100)}%</span>
        <span class="chip plain">${packet.debug.durationMs}ms</span>
        <span class="chip plain">${packet.debug.promptChars} 字符</span>
      </div>
      <div class="algo-flow">${stages}</div>
      ${frags}
      ${packet.debug.notes.length ? `<div class="small muted" style="line-height:1.8">备注：${packet.debug.notes.map(esc).join('；')}</div>` : ''}
    </div>`;
    const right = `<div class="lab-out"><div class="lab-prompt">${esc(packet.debug.promptText || '（无 prompt）')}</div></div>`;
    Q('#lab-out').innerHTML = left + right;
  },

  /* ---------------- 学习偏好 ---------------- */
  studyHTML() {
    const st = Store.settings.get().study || {};
    return `
      <div class="card set-group">
        <h3>${icon('pen')} 答题节奏</h3>
        <p class="sub">这些偏好会应用在答题模式与考试中。</p>
        <div style="display:flex;flex-direction:column;gap:16px">
          <label class="switch"><input type="checkbox" id="st-autonext" ${st.autoNext ? 'checked' : ''}/><span class="track"></span>答对后自动进入下一题</label>
          <div class="row">
            <span class="small muted" style="min-width:110px">自动跳题延迟</span>
            <input class="input" id="st-delay" type="number" min="400" max="5000" step="100" value="${st.autoNextDelay || 1400}" style="max-width:130px" />
            <span class="small muted">毫秒</span>
          </div>
          <label class="switch"><input type="checkbox" id="st-wrongauto" ${st.wrongAutoAdd !== false ? 'checked' : ''}/><span class="track"></span>答错时自动加入错题本</label>
          <label class="switch"><input type="checkbox" id="st-shuffle" ${st.shuffleOptions ? 'checked' : ''}/><span class="track"></span>答题时打乱选项顺序（判分仍按原答案）</label>
          <label class="switch"><input type="checkbox" id="st-timer" ${st.showTimer !== false ? 'checked' : ''}/><span class="track"></span>考试中显示倒计时（关闭后仍会到时自动交卷）</label>
        </div>
      </div>
      <div class="card set-group">
        <h3>${icon('sparkle')} 仪式感</h3>
        <p class="sub">开启时，每次打开都会走封面掀开与今日问候；关闭后直接进入界面开始用，不留过渡。</p>
        <div class="ritual-row">
          <div class="ritual-main">
            <strong>启动仪式</strong>
            <span>${st.splash !== false ? '封面、问候卡与太阳系依次出现' : '已关闭，打开即进入界面'}</span>
          </div>
          <button type="button" class="ritual-pill ${st.splash !== false ? 'on' : ''}" id="st-ritual"
            role="switch" aria-checked="${st.splash !== false}" aria-label="仪式感">
            <span class="knob" aria-hidden="true"></span>
          </button>
        </div>
        <p class="small muted mt-12" style="line-height:1.9">系统开启「减少动态效果」时也会自动跳过。</p>
      </div>
      <div class="guide-card">
        <div class="g-orb">${icon('clock')}</div>
        <div><h4>关于计时</h4><p>考试一旦开始就按真实时间倒计时，退出页面也不会暂停；未交卷的考试会保存在本地，下次可以继续。</p></div>
      </div>`;
  },

  bindStudy() {
    Q('#st-autonext').onchange = (e) => Store.settings.patch('study', { autoNext: e.target.checked });
    Q('#st-delay').onchange = (e) => Store.settings.patch('study', { autoNextDelay: clamp(Math.round(+e.target.value || 1400), 400, 5000) });
    Q('#st-wrongauto').onchange = (e) => Store.settings.patch('study', { wrongAutoAdd: e.target.checked });
    Q('#st-shuffle').onchange = (e) => Store.settings.patch('study', { shuffleOptions: e.target.checked });
    Q('#st-timer').onchange = (e) => Store.settings.patch('study', { showTimer: e.target.checked });
    Q('#st-ritual').onclick = () => {
      const on = (Store.settings.get().study || {}).splash !== false;
      const next = !on;
      Store.settings.patch('study', { splash: next });
      if (!next && window.Splash && Splash.off) Splash.off();
      this.paint();
      toast(next ? '仪式感已开启，下次打开时播放' : '仪式感已关闭，之后直接进入界面', 'ok');
    };
  },

  /* ---------------- 数据 ---------------- */
  dataHTML() {
    const state = Store.getState();
    const totalQ = state.banks.reduce((n, b) => n + b.questions.length, 0);
    const size = new Blob([JSON.stringify(state)]).size;
    return `
      <div class="card set-group">
        <h3>${icon('download')} 本地数据</h3>
        <p class="sub">所有题库、作答记录与设置都保存在浏览器 localStorage。清理浏览器数据会一并删除，建议定期导出。</p>
        <div class="import-summary" style="margin-bottom:20px">
          <div class="import-stat"><b>${state.banks.length}</b><span>题库</span></div>
          <div class="import-stat"><b>${totalQ}</b><span>题目</span></div>
          <div class="import-stat"><b>${Store.wrong.total()}</b><span>错题</span></div>
          <div class="import-stat"><b>${(size / 1024).toFixed(1)}k</b><span>占用空间</span></div>
        </div>
        <div class="row wrap">
          <button class="btn btn-primary" id="data-export">${icon('download')} 导出备份</button>
          <button class="btn btn-ghost" id="data-import-btn">${icon('upload')} 导入备份</button>
          <input type="file" id="data-import" accept=".json,application/json" hidden />
          <span class="grow"></span>
          <button class="btn btn-danger" id="data-reset">${icon('trash')} 清空数据</button>
        </div>
        <p class="small muted mt-16" style="line-height:1.9">导出的 JSON 包含题库、错题、考试记录与设置，但不含 API Key；换设备或换浏览器后需要重新填写一次 Key。</p>
      </div>

      <div class="card set-group">
        <h3>${icon('clock')} 考试记录</h3>
        <p class="sub">最近 30 场考试的得分与时间。</p>
        ${state.exams.length ? `<div class="mistake-list">
          ${state.exams.slice(0, 6).map((e) => {
            const b = Store.banks.get(e.bankId);
            return `<a class="mistake-row" href="#/exam/result/${e.bankId}" style="text-decoration:none">
              <div class="cnt"><b style="color:${e.score >= 60 ? 'var(--ok)' : 'var(--bad)'}">${e.score || 0}</b><span>得分</span></div>
              <div class="grow"><div class="mtxt">${esc(e.bankTitle || (b && b.title) || '已删除的题库')}</div>
                <div class="msub">${e.ids.length} 题 · ${formatTime(e.usedSec || 0)} · ${relTime(e.finishedAt)}</div></div>
              <span class="chip plain">查看复盘</span>
            </a>`;
          }).join('')}
        </div>` : '<p class="small muted">还没有考试记录。</p>'}
      </div>`;
  },

  bindData() {
    Q('#data-export').onclick = () => {
      downloadFile(`题库备份-${todayKey()}.json`, Store.exportAll(), 'application/json;charset=utf-8');
      toast('备份已导出', 'ok');
    };
    const input = Q('#data-import');
    Q('#data-import-btn').onclick = () => input.click();
    input.onchange = async () => {
      const file = input.files && input.files[0];
      if (!file) return;
      try {
        const text = await readFile(file, 'text');
        const ok = await confirmModal({
          title: '导入备份？',
          body: '当前设备上的题库与记录会被备份文件覆盖。建议先导出一次当前数据。',
          okText: '覆盖导入',
        });
        if (!ok) return;
        Store.importAll(text);
        toast('备份已导入', 'ok');
        location.hash = '#/';
        App.render();
      } catch (e) {
        toast('导入失败：' + (e.message || '文件格式不正确'), 'bad', 4800);
      }
    };
    Q('#data-reset').onclick = async () => {
      const ok = await confirmModal({
        title: '清空所有数据？',
        body: '题库、错题、考试记录都会被删除，只保留 AI 与算法层设置。此操作无法撤销。',
        okText: '清空',
        danger: true,
      });
      if (!ok) return;
      Store.reset(true);
      toast('数据已清空，已恢复示例题库', 'ok');
      location.hash = '#/';
      App.render();
    };
  },

  /* ---------------- 关于 ---------------- */
  aboutHTML() {
    return `
      <div class="card set-group">
        <h3>${icon('book')} 题库 · 本地智能学习</h3>
        <p class="sub">一个不需要后端、数据完全留在本机的刷题应用。打开 index.html 即可使用。</p>
        <div class="summary-line"><span>版本</span><b>1.0</b></div>
        <div class="summary-line"><span>数据存储</span><b>浏览器 localStorage</b></div>
        <div class="summary-line"><span>AI 接口</span><b>OpenAI 兼容 /chat/completions</b></div>
        <div class="summary-line"><span>算法层</span><b>${Algo.describe().length} 个可插拔阶段</b></div>
        <div class="summary-line"><span>PDF 解析</span><b>本地 pdf.js</b></div>
      </div>

      <div class="card set-group">
        <h3>${icon('layers')} 算法层做了什么</h3>
        <p class="sub">它位于 AI 接入层之下，把用户的一句话变成结构化上下文，再交给模型。</p>
        ${Algo.describe().map((s) => `<div class="summary-line"><span>${String(s.order / 10).padStart(2, '0')} · ${esc(s.name)}</span><b style="font-weight:400;color:var(--ink-3);text-align:right;max-width:60%">${esc(s.desc || '')}</b></div>`).join('')}
        <p class="small muted mt-16" style="line-height:2">例如「讲讲第 3 题」会被拆成：定位第 3 题 → 题干、选项、正确答案、参考解析 → 用户疑问 → 讲解模板。你可以在「算法层 · 算法实验台」里实时查看。</p>
      </div>

      <div class="guide-card">
        <div class="g-orb">${icon('shield')}</div>
        <div><h4>隐私</h4><p>题库、作答记录和 API Key 都只存在本机。只有你点击「问 AI」或触发批改时，相关题目片段才会发送到你配置的服务商。</p></div>
      </div>`;
  },
};
