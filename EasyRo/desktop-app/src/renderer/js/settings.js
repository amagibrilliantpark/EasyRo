/** Settings page and theme switching UI. */
window.Settings = {
  init() {
    // ── Settings page ──
    const settingsBtn = document.getElementById('settingsBtn');
    const settingsPage = document.getElementById('settingsPage');
    const settingsClose = document.getElementById('settingsClose');

    settingsBtn.addEventListener('click', () => {
      settingsPage.classList.remove('hidden');
      document.querySelector('.settings-section-title[data-target="generalCard"]').click();
      console.log(`[UI] Settings page opened`);
    });

    settingsClose.addEventListener('click', () => {
      settingsPage.classList.add('hidden');
      console.log(`[UI] Settings page closed`);
    });

    // Toggle cards on section title click
    document.querySelectorAll('.settings-section-title').forEach(title => {
      title.addEventListener('click', () => {
        const targetId = title.dataset.target;
        const contentMap = {
          'generalCard': 'generalContent',
          'aboutCard': 'aboutContent'
        };
        const targetContentId = contentMap[targetId];
        const targetContent = document.getElementById(targetContentId);
        if (targetContent) {
          document.querySelectorAll('.settings-section-title').forEach(t => t.classList.remove('active'));
          document.querySelectorAll('.settings-right-content').forEach(c => c.classList.add('hidden'));
          targetContent.classList.remove('hidden');
          title.classList.add('active');
          console.log(`[UI] Content ${targetContentId} activated`);
        }
      });
    });

    // ── Theme Switching ──
    const lightThemeBtn = document.getElementById('lightThemeBtn');
    const darkThemeBtn = document.getElementById('darkThemeBtn');

    function setTheme(theme) {
      document.body.setAttribute('data-theme', theme);
      localStorage.setItem('easyro_theme', theme);
      
      lightThemeBtn.classList.toggle('active', theme === 'light');
      darkThemeBtn.classList.toggle('active', theme === 'dark');
      if (window.electronAPI?.window?.setTheme) {
        window.electronAPI.window.setTheme(theme);
      }
      console.log(`[UI] Theme set to: ${theme}`);
    }

    const savedTheme = localStorage.getItem('easyro_theme') || 'light';
    setTheme(savedTheme);

    lightThemeBtn.addEventListener('click', () => { setTheme('light'); });
    darkThemeBtn.addEventListener('click', () => { setTheme('dark'); });

    // Feedback button
    document.getElementById('feedbackBtn').addEventListener('click', () => {
      window.electronAPI.openExternal('https://docs.google.com/forms/d/e/1FAIpQLSfbJnE-m8jSKKqtSXtSyqwJMCpyQPjrsmFSjh86aKSNf1rlTw/viewform?usp=header');
    });

    // Close settings on Escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !settingsPage.classList.contains('hidden')) {
        settingsPage.classList.add('hidden');
        console.log(`[UI] Settings page closed via Escape`);
      }
    });
  }
};
