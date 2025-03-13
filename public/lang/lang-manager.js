// 支持的语言列表
const supportedLanguages = {
  en: "English",
  zh: "中文",
  ja: "日本語",
  ko: "한국어",
  fr: "Français",
  es: "Español"
};

// 默认语言
let currentLang = 'en';

// 尝试从本地存储加载用户首选语言
const savedLang = localStorage.getItem('localTransferLanguage');
if (savedLang && supportedLanguages[savedLang]) {
  currentLang = savedLang;
} else {
  // 尝试检测浏览器语言
  const browserLang = navigator.language.split('-')[0];
  if (supportedLanguages[browserLang]) {
    currentLang = browserLang;
  }
}

// 获取翻译文本
function __(key) {
  // 确保语言对象存在
  if (typeof window[currentLang] === 'undefined') {
    console.warn(`Language ${currentLang} not loaded, falling back to English`);
    return window['en'][key] || key;
  }
  
  // 返回翻译或键名（如果翻译不存在）
  return window[currentLang][key] || window['en'][key] || key;
}

// 切换语言
function switchLanguage(lang) {
  if (supportedLanguages[lang]) {
    currentLang = lang;
    localStorage.setItem('localTransferLanguage', lang);
    
    // 更新页面文本
    updatePageText();
    
    console.log(`语言已切换到: ${supportedLanguages[lang]}`);
    return true;
  }
  return false;
}

// 更新页面上的所有文本
// 增强 updatePageText 函数，确保所有元素都被更新
function updatePageText() {
  // 更新页面标题
  document.title = __('appName');
  
  // 更新具有 data-i18n 属性的元素
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    if (key) {
      el.textContent = __(key);
    }
  });
  
  // 更新具有 data-i18n-placeholder 属性的输入元素
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    const key = el.getAttribute('data-i18n-placeholder');
    if (key) {
      el.placeholder = __(key);
    }
  });
  
  // 触发自定义事件，通知应用程序语言已更改
  document.dispatchEvent(new CustomEvent('languageChanged', { detail: { lang: currentLang } }));
}

// 创建语言选择器
function createLanguageSelector(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;
  
  const langSelector = document.createElement('div');
  langSelector.className = 'language-selector';
  
  // 创建语言选择下拉菜单
  const select = document.createElement('select');
  select.id = 'language-select';
  
  // 添加所有支持的语言
  Object.entries(supportedLanguages).forEach(([code, name]) => {
    const option = document.createElement('option');
    option.value = code;
    option.textContent = name;
    option.selected = code === currentLang;
    select.appendChild(option);
  });
  
  // 添加更改事件
  select.addEventListener('change', (e) => {
    switchLanguage(e.target.value);
  });
  
  langSelector.appendChild(select);
  container.appendChild(langSelector);
}

// 初始化
document.addEventListener('DOMContentLoaded', () => {
  // 在页面加载完成后更新文本
  updatePageText();
});